import type { Activity, Chat, Env, Message } from './types';

export async function upsertChat(env: Env, a: Activity): Promise<Chat> {
  const kind = a.conversation.conversationType ?? (a.conversation.isGroup ? 'groupChat' : 'personal');
  const tenant = a.conversation.tenantId ?? a.channelData?.tenant?.id ?? null;
  await env.DB.prepare(
    `INSERT INTO chats (id,kind,name,service_url,tenant_id) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET service_url=excluded.service_url, last_seen=datetime('now'), active=1,
       name=COALESCE(excluded.name, chats.name), tenant_id=COALESCE(excluded.tenant_id, chats.tenant_id)`)
    .bind(a.conversation.id, kind, a.conversation.name ?? null, a.serviceUrl, tenant).run();
  return (await getChat(env, a.conversation.id))!;
}

export function getChat(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM chats WHERE id=?').bind(id).first<Chat>();
}

export async function deactivateChat(env: Env, id: string) {
  await env.DB.prepare('UPDATE chats SET active=0 WHERE id=?').bind(id).run();
}

export async function activeChats(env: Env): Promise<Chat[]> {
  return (await env.DB.prepare('SELECT * FROM chats WHERE active=1 ORDER BY installed_at').all<Chat>()).results;
}

export interface NewMessage { teams_id: string; chat_id: string; ts: string; from_id: string | null; from_name: string | null; is_bot: boolean; text: string; images: number; source: 'live' | 'graph'; reactions?: number }

export async function saveMessage(env: Env, m: NewMessage): Promise<boolean> {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO messages (teams_id,chat_id,ts,from_id,from_name,is_bot,text,images,source) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(m.teams_id, m.chat_id, m.ts, m.from_id, m.from_name, m.is_bot ? 1 : 0, m.text, m.images, m.source).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function saveMessages(env: Env, list: NewMessage[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < list.length; i += 30) {
    const slice = list.slice(i, i + 30);
    const rs = await env.DB.batch([
      ...slice.map(m => env.DB.prepare('INSERT OR IGNORE INTO messages (teams_id,chat_id,ts,from_id,from_name,is_bot,text,images,source,reactions) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(m.teams_id, m.chat_id, m.ts, m.from_id, m.from_name, m.is_bot ? 1 : 0, m.text, m.images, m.source, m.reactions ?? 0)),
      // 即時存過的訊息,補抓時把按讚數帶回來
      ...slice.filter(m => (m.reactions ?? 0) > 0).map(m => env.DB.prepare('UPDATE messages SET reactions=? WHERE teams_id=?').bind(m.reactions, m.teams_id)),
    ]);
    for (const r of rs.slice(0, slice.length)) n += r.meta.changes ?? 0;
  }
  return n;
}

/** 最近 n 則(時間正序) */
export async function recentMessages(env: Env, chatId: string, n = 30, beforeTeamsId?: string): Promise<Message[]> {
  const r = await env.DB.prepare('SELECT * FROM messages WHERE chat_id=? AND teams_id<>? ORDER BY ts DESC LIMIT ?').bind(chatId, beforeTeamsId ?? '', n).all<Message>();
  return r.results.reverse();
}

export async function messagesBetween(env: Env, chatId: string, fromIso: string, toIso: string): Promise<Message[]> {
  return (await env.DB.prepare('SELECT * FROM messages WHERE chat_id=? AND ts>=? AND ts<? ORDER BY ts').bind(chatId, fromIso, toIso).all<Message>()).results;
}

/** 關鍵字搜對話紀錄(trigram,至少三個字才找得到) */
export async function searchMessages(env: Env, chatId: string, query: string, n = 10): Promise<Message[]> {
  const terms = query.split(/[\s,，。、;；:：!！?？()（）「」]+/).map(t => t.trim()).filter(t => [...t].length >= 3).slice(0, 5);
  if (!terms.length) return [];
  const match = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
  try {
    const r = await env.DB.prepare(
      `SELECT m.* FROM messages_fts f JOIN messages m ON m.rowid=f.rowid WHERE messages_fts MATCH ? AND m.chat_id=? AND m.is_bot=0 ORDER BY m.ts DESC LIMIT ?`)
      .bind(match, chatId, n).all<Message>();
    return r.results.reverse();
  } catch { return []; }
}

export async function saveSummary(env: Env, chatId: string, date: string, text: string, model: string, count: number, posted: boolean) {
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO summaries (chat_id,date,text,model,messages,posted) VALUES (?,?,?,?,?,?)').bind(chatId, date, text, model, count, posted ? 1 : 0),
    env.DB.prepare('UPDATE chats SET last_summary_date=? WHERE id=?').bind(date, chatId),
  ]);
}

export async function recentSummaries(env: Env, chatId: string, n = 3) {
  return (await env.DB.prepare('SELECT date,text FROM summaries WHERE chat_id=? ORDER BY date DESC LIMIT ?').bind(chatId, n).all<{ date: string; text: string }>()).results;
}

// ---- 競品雷達(唯讀) ----
export interface RadarBrand { id: string; name_zh: string; name_en: string | null }
export interface RadarItem { id: string; week: string; brand_id: string; category: string; market: string; title: string; summary: string; observation: string | null; date_start: string | null; date_end: string | null; confidence: string; urls: string | null }

export async function radarBrands(env: Env): Promise<RadarBrand[]> {
  try {
    return (await env.RADAR.prepare('SELECT id,name_zh,name_en FROM brands WHERE active=1 ORDER BY sort').all<RadarBrand>()).results;
  } catch { return []; }
}

/** 指定品牌(或全部)最近幾期的動態,含來源網址 */
export async function radarItems(env: Env, brandIds: string[], limit = 12): Promise<RadarItem[]> {
  const where = brandIds.length ? `AND i.brand_id IN (${brandIds.map(() => '?').join(',')})` : '';
  const r = await env.RADAR.prepare(
    `SELECT i.id,i.week,i.brand_id,i.category,i.market,i.title,i.summary,i.observation,i.date_start,i.date_end,i.confidence,
            (SELECT GROUP_CONCAT(url, ' ') FROM item_sources s WHERE s.item_id=i.id) AS urls
     FROM items i JOIN issues w ON w.week=i.week
     WHERE i.hidden=0 AND w.status='published' ${where}
     ORDER BY i.week DESC, i.rank LIMIT ?`).bind(...brandIds, limit).all<RadarItem>();
  return r.results;
}

// ---- 表情回饋 ----
const REACTION_SCORE: Record<string, number> = { like: 1, heart: 1, laugh: 1, surprised: 0, sad: -1, angry: -1 };

export async function saveFeedback(env: Env, f: { chat_id: string; message_id: string; from_id: string | null; from_name: string | null; reaction: string; removed: boolean }) {
  const score = REACTION_SCORE[f.reaction] ?? 0;
  await env.DB.prepare('INSERT INTO feedback (chat_id,message_id,from_id,from_name,reaction,score,removed) VALUES (?,?,?,?,?,?,?)')
    .bind(f.chat_id, f.message_id, f.from_id, f.from_name, f.reaction, score, f.removed ? 1 : 0).run();
  return score;
}

/** 最近被按了不滿意表情的回答(給她當提醒) */
export async function negativeFeedback(env: Env, chatId: string, n = 3): Promise<{ text: string; reaction: string; from_name: string | null }[]> {
  return (await env.DB.prepare(
    `SELECT m.text, f.reaction, f.from_name FROM feedback f JOIN messages m ON m.teams_id=f.message_id
     WHERE f.chat_id=? AND f.removed=0 AND f.score<0 AND f.ts >= datetime('now','-14 days') ORDER BY f.ts DESC LIMIT ?`).bind(chatId, n).all<{ text: string; reaction: string; from_name: string | null }>()).results;
}

export async function feedbackStats(env: Env, since: string) {
  return (await env.DB.prepare("SELECT reaction, COUNT(*) AS n FROM feedback WHERE removed=0 AND ts >= ? GROUP BY reaction ORDER BY n DESC").bind(since).all()).results;
}
