import type { Brand, BrandStat, Env, Issue, IssueBundle, IssueSummary, Item, ItemImage, ItemSource, ItemsBundle } from './types';
import { parseWeekId, previousWeeks, weekRange } from './week';
import { twText } from './zh';
import type { BrandReport } from './schema';
import { heroImageOf, storeImages, type Candidate } from './images';

export async function allBrands(env: Env): Promise<Brand[]> {
  const r = await env.DB.prepare('SELECT * FROM brands WHERE active=1 ORDER BY sort').all<Brand>();
  return r.results;
}

export async function getIssue(env: Env, week: string): Promise<Issue | null> {
  return env.DB.prepare('SELECT * FROM issues WHERE week=?').bind(week).first<Issue>();
}

export async function ensureIssue(env: Env, week: string): Promise<Issue> {
  const existing = await getIssue(env, week);
  if (existing) return existing;
  const p = parseWeekId(week);
  if (!p) throw new Error('bad week id ' + week);
  const { start, end } = weekRange(p.year, p.week);
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM issues').first<{ c: number }>();
  const no = (count?.c ?? 0) + 1;
  await env.DB.prepare('INSERT OR IGNORE INTO issues (week,no,range_start,range_end,status) VALUES (?,?,?,?,?)').bind(week, no, start, end, 'draft').run();
  return (await getIssue(env, week))!;
}

// 一個品牌最久跑多久(SDK timeout 9 分鐘)。認領超過這個時間還沒結束,就當作中斷,可以重新認領。
const STALE = "datetime('now','-15 minutes')";

/** 這一週還沒跑過的品牌(沒有 runs 列、上次是 error,或認領後中斷) */
export async function pendingBrands(env: Env, week: string): Promise<Brand[]> {
  const r = await env.DB.prepare(
    `SELECT b.* FROM brands b
     LEFT JOIN runs r ON r.brand_id=b.id AND r.week=?
     WHERE b.active=1 AND (r.id IS NULL OR r.status='error' OR (r.status='running' AND r.started_at < ${STALE}))
     ORDER BY b.sort`).bind(week).all<Brand>();
  return r.results;
}

/** 認領一個品牌。排程每 2 分鐘起跑一次,前一個還沒跑完時,靠這一步避免兩次執行跑到同一個品牌。 */
export async function claimRun(env: Env, week: string, brandId: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `INSERT INTO runs (week,brand_id,status) VALUES (?,?,'running')
     ON CONFLICT(week,brand_id) DO UPDATE SET status='running', started_at=datetime('now'), finished_at=NULL
     WHERE runs.status='error' OR (runs.status='running' AND runs.started_at < ${STALE})`).bind(week, brandId).run();
  return (r.meta.changes ?? 0) > 0;
}

function norm(s: string) { return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''); }
function similar(a: string, b: string) {
  const A = new Set(norm(a)); const B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const ch of A) if (B.has(ch)) inter++;
  return inter / Math.min(A.size, B.size);
}

export interface SaveStats { inserted: number; skipped: number; images: number }

/** 把一個品牌的研究結果寫進資料庫,去重,抓圖 */
export async function saveReport(env: Env, week: string, brand: Brand, report: BrandReport): Promise<SaveStats> {
  const weeks = previousWeeks(week, 8);
  const recent = await env.DB.prepare(
    `SELECT i.id, i.title, s.url FROM items i LEFT JOIN item_sources s ON s.item_id=i.id
     WHERE i.brand_id=? AND i.week IN (${weeks.map(() => '?').join(',')})`).bind(brand.id, ...weeks).all<{ id: string; title: string; url: string | null }>();
  const seenUrls = new Set(recent.results.map(r => r.url).filter(Boolean) as string[]);
  const seenTitles = recent.results.map(r => r.title);

  const existingCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM items WHERE week=? AND brand_id=?').bind(week, brand.id).first<{ c: number }>();
  let seq = existingCount?.c ?? 0;
  const stats: SaveStats = { inserted: 0, skipped: 0, images: 0 };
  const stmts: D1PreparedStatement[] = [];

  for (const raw of report.items) {
    // 存檔前統一成台灣繁體中文的寫法(全形標點、台灣用語),見 zh.ts
    const it = { ...raw, title: twText(raw.title), summary: twText(raw.summary), market: twText(raw.market),
      observation: twText(raw.observation) ?? null, status_note: twText(raw.status_note) ?? null };
    const dupUrl = it.sources.some(s => seenUrls.has(s.url));
    const dupTitle = seenTitles.some(t => similar(t, it.title) >= 0.7);
    if (dupUrl || dupTitle) { stats.skipped++; continue; }
    seq++;
    const id = `${week.slice(5)}-${brand.id}-${String(seq).padStart(2, '0')}`;
    const officialSources = it.sources.filter(s => s.is_official).length;
    const confidence = it.sources.length >= 2 ? 'verified' : 'single';
    stmts.push(env.DB.prepare(
      `INSERT INTO items (id,week,brand_id,category,market,title,summary,observation,date_start,date_end,status_note,confidence,rank)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, week, brand.id, it.category, it.market, it.title, it.summary, it.observation, it.date_start, it.date_end, it.status_note, confidence,
      (confidence === 'verified' ? 0 : 50) + (officialSources ? 0 : 10) + (it.observation ? 0 : 5)));
    for (const s of it.sources) {
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO item_sources (item_id,url,publisher,title,published_at,is_official) VALUES (?,?,?,?,?,?)')
        .bind(id, s.url, s.publisher, s.title, s.published_at, s.is_official ? 1 : 0));
      seenUrls.add(s.url);
    }
    seenTitles.push(it.title);
    stats.inserted++;

    // 圖片:模型給的直接圖 → 來源頁的主圖
    const cands: Candidate[] = it.image_urls.slice(0, 4).map(u => ({ url: u, credit: it.image_credit ? `${it.image_credit}` : '官方素材', official: /official|官方/.test(it.image_credit ?? '') || it.sources.some(s => s.is_official && u.includes(hostOf(s.url))) }));
    if (cands.length < 2) {
      for (const s of it.sources.slice(0, 2)) {
        const hero = await heroImageOf(s.url);
        if (hero) cands.push({ url: hero, credit: `${s.is_official ? '官方素材' : '報導配圖'} · ${s.publisher}`, official: s.is_official, page: s.url });
      }
    }
    const stored = await storeImages(env, id, cands, 3);
    stored.forEach((im, i) => stmts.push(env.DB.prepare(
      'INSERT OR IGNORE INTO item_images (item_id,kv_key,content_type,bytes,source_url,page_url,credit,is_official,sort) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, im.kv_key, im.content_type, im.bytes, im.source_url, im.page_url, im.credit, im.is_official, i + 1)));
    stats.images += stored.length;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return stats;
}

function hostOf(u: string) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '\u0000'; } }

export async function recordRun(env: Env, week: string, brandId: string, status: 'ok' | 'quiet' | 'error', data: { items?: number; input?: number; output?: number; searches?: number; error?: string }) {
  await env.DB.prepare(
    `INSERT INTO runs (week,brand_id,status,items_found,input_tokens,output_tokens,searches,error,finished_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(week,brand_id) DO UPDATE SET status=excluded.status, items_found=excluded.items_found, input_tokens=excluded.input_tokens,
       output_tokens=excluded.output_tokens, searches=excluded.searches, error=excluded.error, finished_at=excluded.finished_at`)
    .bind(week, brandId, status, data.items ?? 0, data.input ?? null, data.output ?? null, data.searches ?? null, data.error ?? null).run();
}

export async function loadBundle(env: Env, week: string): Promise<IssueBundle | null> {
  const issue = await getIssue(env, week);
  if (!issue) return null;
  const brands = await allBrands(env);
  const items = (await env.DB.prepare('SELECT * FROM items WHERE week=? AND hidden=0 ORDER BY is_lead DESC, rank, created_at').bind(week).all<Item>()).results;
  const { sources, images } = await attach(env, items.map(i => i.id));
  const weeks8 = previousWeeks(week, 8);
  const act = (await env.DB.prepare(`SELECT DISTINCT brand_id, week FROM items WHERE hidden=0 AND week IN (${weeks8.map(() => '?').join(',')})`).bind(...weeks8).all<{ brand_id: string; week: string }>()).results;
  const activity: Record<string, string[]> = {};
  for (const a of act) (activity[a.brand_id] ??= []).push(a.week);
  const runs = (await env.DB.prepare('SELECT brand_id,status,items_found FROM runs WHERE week=?').bind(week).all<{ brand_id: string; status: string; items_found: number }>()).results;
  const activeBrandIds = new Set(items.map(i => i.brand_id));
  const quiet = brands.filter(b => !activeBrandIds.has(b.id));
  return { issue, brands, items, sources, images, activity, weeks8, quiet, runs };
}

/** 一次撈多則動態的來源與圖片。D1 一次查詢最多 100 個參數,所以分批。 */
async function attach(env: Env, ids: string[]) {
  const sources: Record<string, ItemSource[]> = {};
  const images: Record<string, ItemImage[]> = {};
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const q = chunk.map(() => '?').join(',');
    for (const s of (await env.DB.prepare(`SELECT * FROM item_sources WHERE item_id IN (${q}) ORDER BY is_official DESC, id`).bind(...chunk).all<ItemSource>()).results)
      (sources[s.item_id] ??= []).push(s);
    for (const im of (await env.DB.prepare(`SELECT * FROM item_images WHERE item_id IN (${q}) ORDER BY sort`).bind(...chunk).all<ItemImage>()).results)
      (images[im.item_id] ??= []).push(im);
  }
  return { sources, images };
}

// 頭條的選法要跟週報頁一致:指定頭條優先,其次有圖、rank 低、較早寫入的
// 只有小圖(最大一張 < 150KB)的動態扣分,避免頭條大圖被硬放大
const LEAD_ORDER = `ORDER BY t.is_lead DESC, (CASE WHEN EXISTS (SELECT 1 FROM item_images m WHERE m.item_id=t.id) THEN 0 ELSE 100 END)
  + (CASE WHEN COALESCE((SELECT MAX(m.bytes) FROM item_images m WHERE m.item_id=t.id), 0) < 150000 THEN 30 ELSE 0 END) + t.rank, t.created_at LIMIT 1`;

/** 所有期數,新的在前。drafts=false 時只列已發布的。 */
export async function listIssues(env: Env, drafts: boolean): Promise<IssueSummary[]> {
  const r = await env.DB.prepare(
    `SELECT i.*,
       (SELECT COUNT(*) FROM items t WHERE t.week=i.week AND t.hidden=0) AS items,
       (SELECT COUNT(DISTINCT t.brand_id) FROM items t WHERE t.week=i.week AND t.hidden=0) AS brands,
       (SELECT t.title FROM items t WHERE t.week=i.week AND t.hidden=0 ${LEAD_ORDER}) AS lead_title,
       (SELECT t.brand_id FROM items t WHERE t.week=i.week AND t.hidden=0 ${LEAD_ORDER}) AS lead_brand,
       (SELECT m.kv_key FROM items t JOIN item_images m ON m.item_id=t.id WHERE t.week=i.week AND t.hidden=0
          ORDER BY m.bytes DESC LIMIT 1) AS cover_key
     FROM issues i WHERE (? = 1 OR i.status='published') ORDER BY i.week DESC`).bind(drafts ? 1 : 0).all<IssueSummary>();
  return r.results;
}

/** 跨期撈動態(品牌頁、分類頁)。where 只能是程式內寫死的條件,值一律用 binds 帶。 */
export async function loadItems(env: Env, drafts: boolean, where: string, binds: (string | number)[]): Promise<ItemsBundle> {
  const items = (await env.DB.prepare(
    `SELECT t.* FROM items t JOIN issues i ON i.week=t.week
     WHERE t.hidden=0 AND (? = 1 OR i.status='published') AND (${where})
     ORDER BY t.week DESC, t.is_lead DESC, t.rank, t.created_at`).bind(drafts ? 1 : 0, ...binds).all<Item>()).results;
  return { items, ...(await attach(env, items.map(i => i.id))) };
}

/** 每個品牌累計幾則、出現在幾期、最近一次是哪一期 */
export async function brandStats(env: Env, drafts: boolean): Promise<BrandStat[]> {
  const r = await env.DB.prepare(
    `SELECT t.brand_id, COUNT(*) AS items, COUNT(DISTINCT t.week) AS weeks, MAX(t.week) AS last_week
     FROM items t JOIN issues i ON i.week=t.week
     WHERE t.hidden=0 AND (? = 1 OR i.status='published') GROUP BY t.brand_id`).bind(drafts ? 1 : 0).all<BrandStat>();
  return r.results;
}

/** 單則動態所在的那一期(故事頁用) */
export async function weekOfItem(env: Env, id: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT week FROM items WHERE id=? AND hidden=0').bind(id).first<{ week: string }>();
  return r?.week ?? null;
}
