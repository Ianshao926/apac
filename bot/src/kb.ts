// 知識庫:文字拆段 → Workers AI 算向量 → 存 Vectorize;段落原文存 D1。
// namespace:'kb' 是共用知識;'chat:<id>' 是某個對話專屬的(每日大綱),別的群組查不到。
import type { Env, KbDoc, KbHit } from './types';

const EMBED_MODEL = '@cf/baai/bge-m3';   // 多語言,1024 維,中文沒問題
const CHUNK = 380;    // 字。bge-m3 一次最多 512 個 token,中文大約一字一個 token,連標題一起要留餘裕
const OVERLAP = 50;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  // 先照段落切,太長的段落再按句子切
  const paras = clean.split(/\n\s*\n/);
  const out: string[] = [];
  let buf = '';
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
  for (const p of paras) {
    const sentences = p.split(/(?<=[。！？!?；;\n])/);
    for (const s of sentences) {
      if ((buf + s).length > CHUNK && buf) {
        const tail = buf.slice(-OVERLAP);
        flush();
        buf = tail + s;
      } else buf += s;
    }
    buf += '\n';
  }
  flush();
  return out.filter(c => c.length >= 20);
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const r: any = await env.AI.run(EMBED_MODEL as any, { text: texts.slice(i, i + 50) } as any);
    out.push(...(r.data as number[][]));
  }
  return out;
}

export interface IngestInput { title: string; text: string; kind: 'url' | 'text' | 'summary'; source_url?: string | null; chat_id?: string | null; added_by?: string | null }

export async function ingest(env: Env, inp: IngestInput): Promise<KbDoc> {
  const chunks = chunkText(inp.text);
  if (!chunks.length) throw new Error('內容太短,沒有可以存的段落');
  const r = await env.DB.prepare('INSERT INTO kb_docs (title,kind,source_url,chat_id,added_by,chars,chunks) VALUES (?,?,?,?,?,?,?) RETURNING *')
    .bind(inp.title.slice(0, 120), inp.kind, inp.source_url ?? null, inp.chat_id ?? null, inp.added_by ?? null, inp.text.length, chunks.length).first<KbDoc>();
  const doc = r!;
  const vectors = await embed(env, chunks.map(c => `${inp.title.slice(0, 40)}\n${c}`));
  const ns = inp.chat_id ? `chat:${inp.chat_id}` : 'kb';
  await env.VEC.upsert(vectors.map((v, i) => ({ id: `${doc.id}-${i}`, values: v, namespace: ns, metadata: { doc: doc.id, title: doc.title, kind: doc.kind, url: inp.source_url ?? '' } })));
  for (let i = 0; i < chunks.length; i += 40) {
    await env.DB.batch(chunks.slice(i, i + 40).map((c, j) => env.DB.prepare('INSERT INTO kb_chunks (id,doc_id,seq,text) VALUES (?,?,?,?)').bind(`${doc.id}-${i + j}`, doc.id, i + j, c)));
  }
  return doc;
}

export async function removeDoc(env: Env, docId: number): Promise<boolean> {
  const doc = await env.DB.prepare('SELECT * FROM kb_docs WHERE id=?').bind(docId).first<KbDoc>();
  if (!doc) return false;
  const ids = Array.from({ length: doc.chunks }, (_, i) => `${doc.id}-${i}`);
  if (ids.length) await env.VEC.deleteByIds(ids);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM kb_chunks WHERE doc_id=?').bind(docId),
    env.DB.prepare('DELETE FROM kb_docs WHERE id=?').bind(docId),
  ]);
  return true;
}

export async function listDocs(env: Env, limit = 50): Promise<KbDoc[]> {
  return (await env.DB.prepare('SELECT * FROM kb_docs ORDER BY id DESC LIMIT ?').bind(limit).all<KbDoc>()).results;
}

/** 共用知識 + 這個對話自己的大綱,各取前幾名,合併後照分數排 */
export async function search(env: Env, query: string, chatId: string | null, k = 6): Promise<KbHit[]> {
  const [qv] = await embed(env, [query]);
  const namespaces = ['kb', ...(chatId ? [`chat:${chatId}`] : [])];
  const matches: { id: string; score: number; metadata?: Record<string, unknown> }[] = [];
  for (const namespace of namespaces) {
    const r = await env.VEC.query(qv, { topK: k, namespace, returnMetadata: 'all' });
    matches.push(...r.matches);
  }
  const top = matches.filter(m => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, k);
  if (!top.length) return [];
  const rows = (await env.DB.prepare(`SELECT c.id,c.doc_id,c.text,d.title,d.kind,d.source_url FROM kb_chunks c JOIN kb_docs d ON d.id=c.doc_id WHERE c.id IN (${top.map(() => '?').join(',')})`)
    .bind(...top.map(m => m.id)).all<{ id: string; doc_id: number; text: string; title: string; kind: string; source_url: string | null }>()).results;
  const byId = new Map(rows.map(r => [r.id, r]));
  return top.flatMap(m => { const r = byId.get(m.id); return r ? [{ ...r, score: m.score }] : []; });
}

/** 抓網頁轉純文字,給「記住 <網址>」用 */
export async function fetchPage(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; apac-bot/1.0)', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`網頁回了 ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const raw = (await res.text()).slice(0, 600_000);
  if (/text\/plain/.test(ct)) return { title: url, text: raw };
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(raw)?.[1]?.trim() || url;
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(raw)?.[1] ?? raw)
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (body.length < 200) throw new Error('這一頁抓不到正文（可能要登入，或是純圖片）');
  return { title: title.replace(/\s+/g, ' ').slice(0, 120), text: body.slice(0, 60_000) };
}
