import type { Brand, Env } from './types';
import { targetWeekFor, parseWeekId } from './week';
import { allBrands, claimRun, ensureIssue, getIssue, loadBundle, pendingBrands, recordRun, saveReport } from './db';
import { researchBrand } from './research';
import { renderIssue } from './render';
import { renderBanner } from './banner';
import { buildCard, postToTeams } from './card';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

function isAdmin(req: Request, env: Env, url: URL) {
  const t = req.headers.get('x-admin-token') || url.searchParams.get('k');
  return !!env.ADMIN_TOKEN && t === env.ADMIN_TOKEN;
}

/** 跑一個品牌:研究 → 存檔 → 記錄 */
async function runOneBrand(env: Env, week: string, brandId?: string) {
  const issue = await ensureIssue(env, week);
  const pending = await pendingBrands(env, week);
  let brand: Brand | undefined;
  if (brandId) {
    // 手動指定品牌:直接跑,不看認領狀態
    brand = (await allBrands(env)).find(b => b.id === brandId);
  } else {
    for (const b of pending) if (await claimRun(env, week, b.id)) { brand = b; break; }
  }
  if (!brand) return { week, done: true, message: brandId ? 'unknown brand' : 'nothing pending' };
  const t0 = Date.now();
  try {
    const r = await researchBrand(env, brand, week, issue.range_start, issue.range_end);
    const stats = await saveReport(env, week, brand, r.report);
    await recordRun(env, week, brand.id, r.report.items.length ? 'ok' : 'quiet', { items: stats.inserted, input: r.usage.input, output: r.usage.output, searches: r.usage.searches });
    return { week, brand: brand.id, status: r.report.items.length ? 'ok' : 'quiet', found: r.report.items.length, ...stats, quiet_reason: r.report.quiet_reason, usage: r.usage, model: r.model, ms: Date.now() - t0, remaining: pending.filter(p => p.id !== brand.id).length };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 900);
    await recordRun(env, week, brand.id, 'error', { error: msg });
    return { week, brand: brand.id, status: 'error', error: msg, ms: Date.now() - t0, remaining: pending.filter(p => p.id !== brand.id).length };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const admin = isAdmin(req, env, url);

    // 首頁:最新已發布的一期;管理者看最新一期(含草稿)
    if (path === '/') {
      const row = admin
        ? await env.DB.prepare('SELECT week FROM issues ORDER BY week DESC LIMIT 1').first<{ week: string }>()
        : await env.DB.prepare("SELECT week FROM issues WHERE status='published' ORDER BY week DESC LIMIT 1").first<{ week: string }>();
      if (!row) return html(`<!doctype html><meta charset="utf-8"><title>${env.SITE_NAME}</title><p style="font-family:system-ui;padding:40px">還沒有任何一期。</p>`, 404);
      return Response.redirect(`${url.origin}/w/${row.week}${admin && url.searchParams.get('k') ? `?k=${url.searchParams.get('k')}` : ''}`, 302);
    }

    let m: RegExpExecArray | null;
    if ((m = /^\/w\/(\d{4}-W\d{2})$/.exec(path))) {
      const bundle = await loadBundle(env, m[1]);
      if (!bundle) return html('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:40px">沒有這一期。</p>', 404);
      if (bundle.issue.status !== 'published' && !admin) return html('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:40px">這一期還在草稿,尚未發布。</p>', 403);
      return html(renderIssue(bundle, { siteName: env.SITE_NAME, orgName: env.ORG_NAME, brandCount: bundle.brands.length }));
    }
    if ((m = /^\/api\/(\d{4}-W\d{2})\.json$/.exec(path))) {
      const bundle = await loadBundle(env, m[1]);
      if (!bundle) return json({ error: 'not found' }, 404);
      if (bundle.issue.status !== 'published' && !admin) return json({ error: 'draft' }, 403);
      return json(bundle);
    }
    if ((m = /^\/img\/(.+)$/.exec(path))) {
      const key = 'img/' + m[1];
      const { value, metadata } = await env.IMG.getWithMetadata<{ ct: string }>(key, 'arrayBuffer');
      if (!value) return new Response('not found', { status: 404 });
      return new Response(value, { headers: { 'content-type': metadata?.ct ?? 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    if ((m = /^\/banner\/(\d{4}-W\d{2})\.png$/.exec(path))) {
      const issue = await getIssue(env, m[1]);
      if (!issue) return new Response('not found', { status: 404 });
      const brands = await allBrands(env);
      const active = await env.DB.prepare('SELECT COUNT(DISTINCT brand_id) AS c FROM items WHERE week=? AND hidden=0').bind(m[1]).first<{ c: number }>();
      const png = await renderBanner(env, issue, active?.c ?? 0, brands.length);
      return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=600' } });
    }
    if ((m = /^\/card\/(\d{4}-W\d{2})\.json$/.exec(path)) && admin) {
      const bundle = await loadBundle(env, m[1]);
      if (!bundle) return json({ error: 'not found' }, 404);
      return json(buildCard(bundle, env.PUBLIC_URL || url.origin));
    }

    // ---- 管理端 ----
    if (path.startsWith('/admin/')) {
      if (!admin) return json({ error: 'unauthorized' }, 401);
      if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
      const week = url.searchParams.get('week') || targetWeekFor();
      if (!parseWeekId(week)) return json({ error: 'bad week' }, 400);

      if (path === '/admin/run') {
        const brand = url.searchParams.get('brand') || undefined;
        return json(await runOneBrand(env, week, brand));
      }
      if (path === '/admin/status') {
        const issue = await getIssue(env, week);
        const runs = (await env.DB.prepare('SELECT brand_id,status,items_found,input_tokens,output_tokens,searches,error,finished_at FROM runs WHERE week=? ORDER BY finished_at').bind(week).all()).results;
        const pending = (await pendingBrands(env, week)).map(b => b.id);
        return json({ issue, runs, pending });
      }
      if (path === '/admin/publish') {
        const bundle = await loadBundle(env, week);
        if (!bundle) return json({ error: 'no issue' }, 404);
        await env.DB.prepare("UPDATE issues SET status='published', published_at=datetime('now') WHERE week=?").bind(week).run();
        bundle.issue.status = 'published';
        const card = buildCard(bundle, env.PUBLIC_URL || url.origin);
        const r = await postToTeams(env, card);
        return json({ ok: true, week, teams: r });
      }
      if (path === '/admin/lead') {
        const id = url.searchParams.get('item');
        if (!id) return json({ error: 'item required' }, 400);
        await env.DB.batch([
          env.DB.prepare('UPDATE items SET is_lead=0 WHERE week=?').bind(week),
          env.DB.prepare('UPDATE items SET is_lead=1 WHERE id=? AND week=?').bind(id, week),
        ]);
        return json({ ok: true, lead: id });
      }
      if (path === '/admin/hide') {
        const id = url.searchParams.get('item'); const on = url.searchParams.get('on') !== '0';
        if (!id) return json({ error: 'item required' }, 400);
        await env.DB.prepare('UPDATE items SET hidden=? WHERE id=?').bind(on ? 1 : 0, id).run();
        return json({ ok: true, item: id, hidden: on });
      }
      if (path === '/admin/reset-run') {
        const brand = url.searchParams.get('brand');
        if (!brand) return json({ error: 'brand required' }, 400);
        await env.DB.prepare('DELETE FROM runs WHERE week=? AND brand_id=?').bind(week, brand).run();
        return json({ ok: true });
      }
      return json({ error: 'unknown admin route' }, 404);
    }

    return new Response('not found', { status: 404 });
  },

  // 每週一 UTC 00:00–00:58(台北 08:00–08:58),每 2 分鐘一格,一格認領一個品牌
  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const week = targetWeekFor();
    const n = Math.max(1, Number(env.BRANDS_PER_BATCH || '1'));
    ctx.waitUntil((async () => {
      for (let i = 0; i < n; i++) {
        const r = await runOneBrand(env, week);
        console.log(JSON.stringify(r));
        if ((r as any).done) break;
      }
    })());
  },
};
