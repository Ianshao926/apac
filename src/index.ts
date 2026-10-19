import { CATEGORIES, type Brand, type Env, type Item } from './types';
import { targetWeekFor, parseWeekId } from './week';
import { allBrands, brandStats, claimRun, ensureIssue, getIssue, listIssues, loadBundle, loadItems, pendingBrands, recordRun, saveReport, weekOfItem } from './db';
import { researchBrand } from './research';
import { renderArchive, renderBrand, renderBrands, renderEmpty, renderHome, renderIssue, renderIssueStories, renderStories, renderStory, type Site } from './render';
import { renderBanner } from './banner';
import { buildCard, postToTeams } from './card';
import { LOGOS } from './logos';

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

    // 管理者帶 ?k= 瀏覽時,站內連結都要帶著 k,才看得到草稿
    const k = admin ? url.searchParams.get('k') : null;
    const link = (p: string) => {
      if (!k) return p;
      const [base, hash] = p.split('#');
      return `${base}${base.includes('?') ? '&' : '?'}k=${encodeURIComponent(k)}${hash ? '#' + hash : ''}`;
    };
    const site: Site = { siteName: env.SITE_NAME, orgName: env.ORG_NAME, link, admin };
    const catParam = (): Item['category'] | null => {
      const c = url.searchParams.get('c');
      return c && (CATEGORIES as readonly string[]).includes(c) ? (c as Item['category']) : null;
    };
    const notFound = (msg: string) => html(`<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:40px">${msg}</p>`, 404);
    const draftBlocked = () => html('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:40px">這一期還在草稿,尚未發布。</p>', 403);

    // 首頁:最新一期(一般人看最新已發布的,管理者看最新的草稿)
    if (path === '/') {
      const issues = await listIssues(env, admin);
      if (!issues.length) return html(renderEmpty(site), 404);
      const bundle = await loadBundle(env, issues[0].week);
      return html(renderHome(bundle!, site, issues));
    }

    let m: RegExpExecArray | null;
    if ((m = /^\/w\/(\d{4}-W\d{2})(\/stories)?$/.exec(path))) {
      const bundle = await loadBundle(env, m[1]);
      if (!bundle) return notFound('沒有這一期。');
      if (bundle.issue.status !== 'published' && !admin) return draftBlocked();
      const issues = await listIssues(env, admin);
      return html(m[2] ? renderIssueStories(bundle, site, issues, catParam()) : renderIssue(bundle, site, issues));
    }
    if (path === '/w') return html(renderArchive(await listIssues(env, admin), site));
    if ((m = /^\/s\/([\w-]+)$/.exec(path))) {
      const week = await weekOfItem(env, m[1]);
      const bundle = week ? await loadBundle(env, week) : null;
      const it = bundle?.items.find(i => i.id === m![1]);
      if (!bundle || !it) return notFound('找不到這則動態。');
      if (bundle.issue.status !== 'published' && !admin) return draftBlocked();
      return html(renderStory(bundle, it, site));
    }
    if (path === '/c' || (m = /^\/c\/(new_product|campaign|loyalty)$/.exec(path))) {
      const cat = path === '/c' ? null : (m![1] as Item['category']);
      const [bundle, brands, issues] = await Promise.all([
        cat ? loadItems(env, admin, 't.category = ?', [cat]) : loadItems(env, admin, '1 = 1', []),
        allBrands(env), listIssues(env, admin)]);
      return html(renderStories(bundle, brands, site, issues, cat));
    }
    if (path === '/b') {
      const [brands, stats] = await Promise.all([allBrands(env), brandStats(env, admin)]);
      return html(renderBrands(brands, stats, site));
    }
    if ((m = /^\/b\/([a-z0-9-]+)$/.exec(path))) {
      const brands = await allBrands(env);
      const br = brands.find(b => b.id === m![1]);
      if (!br) return notFound('沒有這個品牌。');
      const bundle = await loadItems(env, admin, 't.brand_id = ?', [br.id]);
      return html(renderBrand(br, bundle, brands, site, catParam()));
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
    if ((m = /^\/logo\/([a-z0-9-]+)\.png$/.exec(path))) {
      const png = LOGOS[m[1]];
      if (!png) return new Response('not found', { status: 404 });
      return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
    }
    if ((m = /^\/banner\/(\d{4}-W\d{2})\.png$/.exec(path))) {
      const issue = await getIssue(env, m[1]);
      if (!issue) return new Response('not found', { status: 404 });
      const n = await env.DB.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT brand_id) AS c FROM items WHERE week=? AND hidden=0').bind(m[1]).first<{ n: number; c: number }>();
      const png = await renderBanner(env, issue, n?.n ?? 0, n?.c ?? 0);
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
