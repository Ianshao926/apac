// 跟 Microsoft 的往來:驗證 Teams 送來的請求、拿 token、回話、抓圖、從 Graph 補抓聊天紀錄。
// 不用 botbuilder SDK(太重,也跑不在 Workers 上),直接打 REST。
import type { Activity, Env, ImageData } from './types';

const BF_ISSUER = 'https://api.botframework.com';
const BF_OPENID = 'https://login.botframework.com/v1/.well-known/openidconfiguration';

// ---- 驗證 Teams → 我們 的 JWT ----
let jwks: { keys: JsonWebKey[]; fetched: number } | null = null;

async function getKeys(force = false): Promise<JsonWebKey[]> {
  if (!force && jwks && Date.now() - jwks.fetched < 12 * 3600e3) return jwks.keys;
  const cfg = await (await fetch(BF_OPENID)).json<{ jwks_uri: string }>();
  const keys = await (await fetch(cfg.jwks_uri)).json<{ keys: JsonWebKey[] }>();
  jwks = { keys: keys.keys, fetched: Date.now() };
  return jwks.keys;
}

function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

/** 回傳 null 代表通過;字串是失敗原因 */
export async function verifyBotRequest(req: Request, env: Env, activity: Activity): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return 'no bearer token';
  const [h, p, s] = m[1].split('.');
  if (!h || !p || !s) return 'malformed token';
  let header: any, payload: any;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(h)));
    payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  } catch { return 'undecodable token'; }
  if (header.alg !== 'RS256') return 'alg ' + header.alg;
  if (payload.iss !== BF_ISSUER) return 'issuer ' + payload.iss;
  if (payload.aud !== env.MS_APP_ID) return 'audience mismatch';
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 300) return 'expired';
  if (typeof payload.nbf === 'number' && payload.nbf > now + 300) return 'not yet valid';
  const su = (x: string) => (x || '').replace(/\/+$/, '').toLowerCase();
  if (payload.serviceurl && su(payload.serviceurl) !== su(activity.serviceUrl)) return 'serviceUrl mismatch';

  let keys = await getKeys();
  let jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) { keys = await getKeys(true); jwk = keys.find((k: any) => k.kid === header.kid); }
  if (!jwk) return 'unknown kid';
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? null : 'bad signature';
}

// ---- 我們 → Microsoft 的 token(client credentials) ----
const tokens: Record<string, { value: string; exp: number }> = {};

async function msToken(env: Env, scope: string): Promise<string> {
  const hit = tokens[scope];
  if (hit && hit.exp > Date.now() + 60e3) return hit.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: env.MS_APP_ID, client_secret: env.MS_APP_SECRET, scope });
  const res = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await res.json<any>();
  if (!res.ok || !j.access_token) throw new Error(`token ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  tokens[scope] = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}
export const botToken = (env: Env) => msToken(env, 'https://api.botframework.com/.default');
export const graphToken = (env: Env) => msToken(env, 'https://graph.microsoft.com/.default');

// ---- 回話 ----
export interface Target { serviceUrl: string; conversationId: string; replyToId?: string }

async function postActivity(env: Env, t: Target, activity: Record<string, unknown>) {
  const base = t.serviceUrl.replace(/\/+$/, '');
  const url = `${base}/v3/conversations/${encodeURIComponent(t.conversationId)}/activities${t.replyToId ? '/' + encodeURIComponent(t.replyToId) : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${await botToken(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: { id: `28:${env.MS_APP_ID}`, name: env.BOT_NAME }, conversation: { id: t.conversationId }, ...activity }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`send ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

/** Teams 的 markdown 要兩個換行才會分段;清單行之間也補上 */
export function teamsMarkdown(s: string): string {
  return s.trim().replace(/\r/g, '').replace(/\n(?!\n)/g, '\n\n').replace(/\n{3,}/g, '\n\n');
}

/** 回傳 Teams 給這則訊息的 id(之後有人對它按表情,通知裡帶的就是這個 id) */
export async function sendText(env: Env, t: Target, text: string): Promise<string | null> {
  const body = await postActivity(env, t, { type: 'message', textFormat: 'markdown', text: teamsMarkdown(text) });
  try { return String(JSON.parse(body).id ?? '') || null; } catch { return null; }
}

export function sendTyping(env: Env, t: Target) {
  return postActivity(env, { serviceUrl: t.serviceUrl, conversationId: t.conversationId }, { type: 'typing' }).catch(() => '');
}

// ---- 收到的圖 ----
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Teams 貼上的圖要帶 bot token 才抓得到。最多抓 4 張、每張 4MB。 */
export async function fetchImages(env: Env, activity: Activity): Promise<ImageData[]> {
  const out: ImageData[] = [];
  for (const a of activity.attachments ?? []) {
    if (out.length >= 4) break;
    if (!a.contentUrl || !/^image\//.test(a.contentType)) continue;
    try {
      const res = await fetch(a.contentUrl, { headers: { authorization: `Bearer ${await botToken(env)}` } });
      if (!res.ok) continue;
      let ct = (res.headers.get('content-type') || a.contentType).split(';')[0].trim();
      if (ct === 'image/*' || !IMAGE_TYPES.has(ct)) ct = 'image/png';
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024 || buf.byteLength < 100) continue;
      out.push({ media_type: ct as ImageData['media_type'], data: Buffer.from(buf).toString('base64') });
    } catch { /* 抓不到就跳過 */ }
  }
  return out;
}

/** 訊息裡有沒有非圖片的檔案 */
export function hasFiles(activity: Activity) {
  return (activity.attachments ?? []).some(a => a.contentType === 'application/vnd.microsoft.teams.file.download.info' || a.contentType === 'reference');
}

// ---- 文字整理 ----
/** 把 <at>亞太寶寶</at> 這類標記拿掉,HTML 轉純文字 */
export function cleanText(s: string | undefined): string {
  if (!s) return '';
  // 引用回覆:<blockquote itemtype="http://schema.skype.com/Reply">…<p itemprop="preview">原文</p></blockquote> → ［回覆 某人：原文］
  const quoted = s.replace(/<blockquote[^>]*schema\.skype\.com\/Reply[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) => {
    const who = /<strong[^>]*>([^<]*)<\/strong>/i.exec(inner)?.[1]?.trim() || '某人';
    const prev = /<p[^>]*itemprop="preview"[^>]*>([\s\S]*?)<\/p>/i.exec(inner)?.[1] ?? '';
    const text = htmlToText(prev).replace(/\s+/g, ' ').slice(0, 120);
    return `［回覆 ${who}：${text}］ `;
  });
  // 對她自己的 @ 拿掉,對別人的 @ 保留成 @名字
  return htmlToText(quoted.replace(/<at[^>]*>[^<]*寶寶[^<]*<\/at>/gi, ' ')).trim();
}

/** 有人用「回覆」引用她的訊息 */
export function isReplyToBot(activity: Activity, appId: string): boolean {
  const m = /<blockquote[^>]*schema\.skype\.com\/Reply[^>]*>([\s\S]*?)<\/blockquote>/i.exec(activity.text || '');
  if (!m) return false;
  return m[1].includes(`28:${appId}`) || /<strong[^>]*>[^<]*寶寶[^<]*<\/strong>/i.test(m[1]);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<at[^>]*>([^<]*)<\/at>/gi, '@$1')
    .replace(/<img[^>]*>/gi, '[圖片]')
    .replace(/<attachment[^>]*>.*?<\/attachment>/gis, '[附件]')
    .replace(/<attachment[^>]*\/>/gi, '[附件]')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function isMentioned(activity: Activity): boolean {
  const me = activity.recipient?.id;
  if (activity.entities?.some(e => e.type === 'mention' && e.mentioned?.id === me)) return true;
  return /<at[^>]*>[^<]*寶寶[^<]*<\/at>/i.test(activity.text || '');
}

// ---- Graph:補抓一段時間內的聊天紀錄(需要 ChatMessage.Read.Chat 的 RSC 權限) ----
export interface GraphMessage { id: string; ts: string; from_id: string | null; from_name: string | null; is_bot: boolean; text: string; images: number; reactions: number }

export async function graphChatMessages(env: Env, chatId: string, sinceIso: string, maxPages = 6): Promise<GraphMessage[]> {
  const token = await graphToken(env);
  let url: string | null = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages?$top=50&$orderby=lastModifiedDateTime desc&$filter=lastModifiedDateTime gt ${sinceIso}`;
  const out: GraphMessage[] = [];
  for (let i = 0; url && i < maxPages; i++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const j = await res.json<any>();
    if (!res.ok) throw new Error(`graph ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    for (const m of j.value ?? []) {
      if (m.messageType !== 'message' || m.deletedDateTime) continue;
      const html = m.body?.contentType === 'html' ? m.body.content : (m.body?.content ?? '').replace(/</g, '&lt;');
      const text = htmlToText(html);
      const images = (html.match(/<img/gi) ?? []).length;
      if (!text && !images) continue;
      const app = m.from?.application; const user = m.from?.user;
      out.push({ id: String(m.id), ts: m.createdDateTime, from_id: user?.id ?? app?.id ?? null, from_name: user?.displayName ?? app?.displayName ?? null, is_bot: !!app, text: text || '[圖片]', images, reactions: Array.isArray(m.reactions) ? m.reactions.length : 0 });
    }
    url = j['@odata.nextLink'] ?? null;
  }
  return out;
}
