// 亞太寶寶:Teams 群組裡的 AI 同事。
// /api/messages 收 Teams 的訊息;每天台北 18:00 整理大綱;/admin/* 給 Ian 看狀態、管知識庫。
import type { Activity, Chat, Env, Message } from './types';
import { cleanText, fetchImages, graphChatMessages, hasFiles, isMentioned, isReplyToBot, sendText, sendTyping, verifyBotRequest, type Target } from './teams';
import { activeChats, deactivateChat, feedbackStats, getChat, messagesBetween, negativeFeedback, radarBrands, radarItems, recentMessages, recentSummaries, saveFeedback, saveMessage, saveMessages, saveSummary, searchMessages, upsertChat } from './db';
import { answer, summarize, triage } from './brain';
import { embed, fetchPage, ingest, listDocs, removeDoc, search } from './kb';
import { monthSpend, recordUsage, spendLine } from './budget';
import { CHANGELOG, aboutMe, announcement, monthlyNote, monthsSince, selfLine, stageName } from './growth';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import LOGO from '../assets/logo-512.png';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const page = (title: string, body: string) => new Response(`<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;max-width:40em;margin:60px auto;padding:0 20px;line-height:1.9;color:#111}h1{font-weight:600;font-size:22px}</style><body><h1>${title}</h1>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

const HELP = `我是亞太寶寶，部門的新同事。可以這樣用我：

**問問題**：@我，或直接回覆我的訊息
- 群組裡的事：「上週誰說要跟泰國代理商聯絡？」「今天決定了什麼？」
- 競品與市場：「霸王茶姬最近在馬來西亞做了什麼？」我會查部門的競品週報，需要的話上網查最新的
- 看圖：貼菜單、海報、IG 截圖給我，我會讀出內容並分析
- 翻譯、整理、解釋、寫短文都可以

**每天 18:00** 我會貼當天的大綱。想提早看，說「今天的大綱」

**餵我資料**：「記住 + 網址」或「記住 + 一段文字」，存進部門知識庫，回答時會附出處

**回饋**：對我的回答按 👍 或 👎 我會記住；答錯了直接糾正我

我只知道這個群組裡的事和共用知識庫，別的群組的內容不會講出來。`;

const TPE_DATE = (ms = Date.now()) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
const dayRangeUtc = (date: string) => { const s = Date.parse(`${date}T00:00:00+08:00`); return { from: new Date(s).toISOString(), to: new Date(s + 86400e3).toISOString() }; };

function isAdmin(req: Request, env: Env, url: URL) {
  const t = req.headers.get('x-admin-token') || url.searchParams.get('k');
  return !!env.ADMIN_TOKEN && t === env.ADMIN_TOKEN;
}

function allowedChat(env: Env, chat: Chat) {
  if (chat.kind === 'personal') return true;
  const list = (env.ALLOWED_CHATS || '').split(',').map(s => s.trim()).filter(Boolean);
  return !list.length || list.includes(chat.id);
}

// ---- 收到訊息 ----
async function onActivity(env: Env, ctx: ExecutionContext, a: Activity) {
  const me = a.recipient?.id;
  if (a.type === 'conversationUpdate' || a.type === 'installationUpdate') {
    const added = a.type === 'installationUpdate' ? a.action === 'add' : !!a.membersAdded?.some(m => m.id === me);
    const removed = a.type === 'installationUpdate' ? a.action === 'remove' : !!a.membersRemoved?.some(m => m.id === me);
    if (added) {
      const chat = await upsertChat(env, a);
      const t: Target = { serviceUrl: a.serviceUrl, conversationId: a.conversation.id };
      if (!allowedChat(env, chat)) { await sendText(env, t, '嗨，我是亞太寶寶。我目前只在亞太事業部的群組工作，這裡我先不說話，有需要請找 Ian 開通。'); return; }
      await sendText(env, t, chat.kind === 'personal'
        ? '嗨，我是亞太寶寶 👋 這裡是我們兩個的私訊，想問什麼直接說，或丟資料給我說「記住」。打「幫助」看我會什麼。'
        : `大家好，我是亞太寶寶，今天開始加入亞太事業部，是大家的新同事 👋

我剛來，很多事還在學，不過這幾件現在就可以找我：
- **問我問題**：@我 就好。群組裡誰說過什麼、競品最近在幹嘛、某個市場的狀況，附圖也看得懂
- **每天 18:00**：我會把當天的討論整理成大綱，重點、決議、待辦一次列好
- **餵我資料**：丟網址或一段文字給我說「記住」，之後有人問到我就會拿出來用，還會附出處
- **回覆我、對我按表情**都可以，我看得到，也會記住

答錯了請直接糾正我，我會改。打「@亞太寶寶 幫助」有完整說明。請多多指教！`);
    }
    if (removed) await deactivateChat(env, a.conversation.id);
    return;
  }
  if (a.type === 'messageReaction') {
    // 有人對她的訊息按表情。只記下來,不回話。
    const chat = await getChat(env, a.conversation.id);
    if (!chat || !a.replyToId) return;
    for (const r of a.reactionsAdded ?? []) await saveFeedback(env, { chat_id: chat.id, message_id: a.replyToId, from_id: a.from?.aadObjectId ?? a.from?.id ?? null, from_name: a.from?.name ?? null, reaction: r.type, removed: false });
    for (const r of a.reactionsRemoved ?? []) await saveFeedback(env, { chat_id: chat.id, message_id: a.replyToId, from_id: a.from?.aadObjectId ?? a.from?.id ?? null, from_name: a.from?.name ?? null, reaction: r.type, removed: true });
    return;
  }
  if (a.type !== 'message') return;

  const chat = await upsertChat(env, a);
  const fromBot = a.from?.id === me;
  const text = cleanText(a.text);
  const imageCount = (a.attachments ?? []).filter(x => /^image\//.test(x.contentType)).length;
  if (!fromBot && (text || imageCount)) {
    await saveMessage(env, { teams_id: a.id ?? `${a.conversation.id}:${a.timestamp}`, chat_id: chat.id, ts: a.timestamp ?? new Date().toISOString(), from_id: a.from?.aadObjectId ?? a.from?.id ?? null, from_name: a.from?.name ?? null, is_bot: false, text: text || (imageCount ? '[圖片]' : ''), images: imageCount, source: 'live' });
  }
  if (fromBot) return;
  const addressed = chat.kind === 'personal' || isMentioned(a) || isReplyToBot(a, env.MS_APP_ID);
  if (!addressed || !allowedChat(env, chat)) return;
  if (!text && !imageCount) return;

  const t: Target = { serviceUrl: a.serviceUrl, conversationId: a.conversation.id, replyToId: a.id };
  ctx.waitUntil(handleAsk(env, chat, a, text, t).catch(async e => {
    console.error('ask failed', e);
    await sendText(env, t, '我這邊出了點問題，等一下再試一次。（' + String(e?.message ?? e).slice(0, 120) + '）').catch(() => {});
  }));
}

// ---- 回答 ----
async function handleAsk(env: Env, chat: Chat, a: Activity, text: string, t: Target) {
  const asker = a.from?.name ?? '同事';
  const cmd = text.replace(/[\s。！!]+$/u, '');

  if (/^(幫助|help|你會什麼|你會做什麼|說明)$/i.test(cmd)) return sendText(env, t, `${HELP}\n\n${selfLine(chat.installed_at.slice(0, 10))}`);
  if (/^(額度|用量|花費|預算)$/.test(cmd)) return sendText(env, t, spendLine(await monthSpend(env)));
  if (/^(今天的大綱|整理今天|今日大綱|整理一下今天)$/.test(cmd)) {
    await sendTyping(env, t);
    const r = await runSummary(env, chat, TPE_DATE(), { post: false, backfill: true });
    return sendText(env, t, r.text ?? `今天到現在只有 ${r.count} 則訊息，還不用整理。`);
  }
  const remember = /^(記住|記起來|存進知識庫|記一下)[：:\s]*/u.exec(text);
  if (remember) {
    await sendTyping(env, t);
    const body = text.slice(remember[0].length).trim();
    const url = /https?:\/\/\S+/u.exec(body)?.[0];
    try {
      const doc = url
        ? await (async () => { const p = await fetchPage(env, url); return ingest(env, { title: p.title, text: p.text, kind: 'url', source_url: url, added_by: asker }); })()
        : await ingest(env, { title: body.split('\n')[0].slice(0, 60) || '同事提供的資料', text: body, kind: 'text', added_by: asker });
      return sendText(env, t, `記住了：《${doc.title}》，${doc.chars} 字，拆成 ${doc.chunks} 段。之後問到相關的事我會引用。`);
    } catch (e: any) {
      return sendText(env, t, `這個我存不進去：${e?.message ?? e}。可以把文字直接貼給我再試一次。`);
    }
  }

  const spend = await monthSpend(env);
  if (spend.level === 'stop') return sendText(env, t, '這個月的額度用完了，我先休息到下個月 1 號。急的話請找 Ian。');
  await sendTyping(env, t);

  const [recent, brands, images, complaints] = await Promise.all([recentMessages(env, chat.id, 30, a.id), radarBrands(env), fetchImages(env, a), negativeFeedback(env, chat.id)]);
  const tri = await triage(env, text || '（傳了圖片）', recent, brands, images.length > 0);
  await recordUsage(env, chat.id, 'triage', tri.usage);
  let tier = tri.t.tier;
  let allowWeb = tri.t.needs_web;
  if (spend.level === 'tight') { if (tier === 'deep') tier = 'main'; allowWeb = false; }

  const q = tri.t.search_query || text;
  const [found, kb, radar] = await Promise.all([
    tier === 'fast' ? Promise.resolve([] as Message[]) : searchMessages(env, chat.id, q, 10),
    tier === 'fast' ? Promise.resolve([]) : search(env, q, chat.id, 6).catch(e => { console.error('kb search', e); return []; }),
    tri.t.brand_ids.length ? radarItems(env, tri.t.brand_ids, 12) : Promise.resolve([]),
  ]);
  const seen = new Set(recent.map(m => m.teams_id));
  const r = await answer(env, {
    question: text, askerName: asker, images, recent, found: found.filter(m => !seen.has(m.teams_id)), kb, radar, brands,
    tier, allowWeb, wantsLong: tri.t.wants_long, radarUrl: env.RADAR_URL, aboutMe: aboutMe(chat.installed_at.slice(0, 10)), complaints,
  });
  await recordUsage(env, chat.id, 'answer', r.usage);
  let reply = r.text;
  if (hasFiles(a)) reply += '\n\n（附的檔案我現在還讀不了，先貼文字或截圖給我。）';
  if (spend.level === 'tight') reply += '\n\n（這個月額度快用完了，我先不上網查。）';
  const sentId = await sendText(env, t, reply);
  await saveMessage(env, { teams_id: sentId ?? `bot:${a.id}`, chat_id: chat.id, ts: new Date().toISOString(), from_id: null, from_name: env.BOT_NAME, is_bot: true, text: reply, images: 0, source: 'live' });
}

// ---- 每日大綱 ----
async function runSummary(env: Env, chat: Chat, date: string, opt: { post: boolean; backfill: boolean }): Promise<{ count: number; text: string | null; posted: boolean }> {
  const { from, to } = dayRangeUtc(date);
  if (opt.backfill) {
    try {
      const gm = await graphChatMessages(env, chat.id, from);
      const n = await saveMessages(env, gm.filter(m => m.ts >= from && m.ts < to).map(m => ({ teams_id: m.id, chat_id: chat.id, ts: m.ts, from_id: m.from_id, from_name: m.from_name, is_bot: m.is_bot, text: m.text, images: m.images, source: 'graph' as const, reactions: m.reactions })));
      console.log(`backfill ${chat.id} ${date}: ${gm.length} fetched, ${n} new`);
    } catch (e) { console.warn('backfill failed (RSC 權限沒開?)', String(e).slice(0, 300)); }
  }
  const msgs = (await messagesBetween(env, chat.id, from, to)).filter(m => !m.is_bot);
  if (msgs.length < 4) return { count: msgs.length, text: null, posted: false };
  const spend = await monthSpend(env);
  if (spend.level === 'stop') return { count: msgs.length, text: null, posted: false };
  const r = await summarize(env, chat.name ?? '亞太寶寶', date, msgs);
  await recordUsage(env, chat.id, 'summary', r.usage);
  const header = `**${date.replace(/^\d{4}-/, '').replace('-', '/')} 今日大綱**（${msgs.length} 則對話）\n\n`;
  let posted = false;
  if (opt.post) {
    await sendText(env, { serviceUrl: chat.service_url, conversationId: chat.id }, header + r.text);
    posted = true;
  }
  await saveSummary(env, chat.id, date, r.text, r.usage.model, msgs.length, posted);
  // 大綱也進這個對話專屬的知識庫,之後問「上週決定了什麼」找得到
  await ingest(env, { title: `${date} ${chat.name ?? '群組'}大綱`, text: r.text, kind: 'summary', chat_id: chat.id }).catch(e => console.error('ingest summary', e));
  return { count: msgs.length, text: header + r.text, posted };
}

async function dailySummaries(env: Env) {
  const date = TPE_DATE();
  const chats = (await activeChats(env)).filter(c => c.kind !== 'personal' && allowedChat(env, c));
  await announceGrowth(env, chats).catch(e => console.error('announce', e));
  for (const chat of chats) {
    if (!chat.summary_enabled || chat.last_summary_date === date) continue;
    try {
      const r = await runSummary(env, chat, date, { post: true, backfill: true });
      if (!r.text) await env.DB.prepare('UPDATE chats SET last_summary_date=? WHERE id=?').bind(date, chat.id).run();
      console.log(JSON.stringify({ chat: chat.id, date, ...r, text: undefined }));
    } catch (e) { console.error('summary failed', chat.id, e); }
    await monthlyRecap(env, chat, date).catch(e => console.error('monthly', e));
  }
}

const getMeta = (env: Env, key: string) => env.DB.prepare('SELECT value FROM meta WHERE key=?').bind(key).first<{ value: string }>().then(r => r?.value ?? null);
const setMeta = (env: Env, key: string, value: string) => env.DB.prepare("INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, value).run();

/** 部署後有新的 CHANGELOG 就在群組說一次 */
async function announceGrowth(env: Env, chats: Chat[]): Promise<string[]> {
  const said: string[] = [];
  const last = CHANGELOG[CHANGELOG.length - 1]?.id ?? 0;
  for (const chat of chats) {
    const key = `announced:${chat.id}`;
    const joined = chat.installed_at.slice(0, 10);
    // 第一次:她加入前就會的事不用宣布,從加入那天之後的更新開始
    const done = Number((await getMeta(env, key)) ?? Math.max(0, ...CHANGELOG.filter(c => c.date <= joined).map(c => c.id)));
    for (const c of CHANGELOG.filter(c => c.id > done && c.kind !== 'birth')) {
      const text = announcement(c);
      await sendText(env, { serviceUrl: chat.service_url, conversationId: chat.id }, text);
      said.push(text);
    }
    if (last > done) await setMeta(env, key, String(last));
  }
  return said;
}

/** 加入群組後每個月同一天,報這個月的數字 */
async function monthlyRecap(env: Env, chat: Chat, date: string) {
  const join = chat.installed_at.slice(0, 10);
  const months = monthsSince(join, date);
  if (!months) return;
  const key = `recap:${chat.id}`;
  if ((await getMeta(env, key)) === String(months)) return;
  const since = new Date(Date.parse(date + 'T00:00:00+08:00') - 30 * 86400e3).toISOString();
  const a = await env.DB.prepare("SELECT COUNT(*) AS n FROM usage WHERE chat_id=? AND kind='answer' AND ts >= ?").bind(chat.id, since).first<{ n: number }>();
  const u = await env.DB.prepare('SELECT COUNT(DISTINCT from_id) AS u FROM messages WHERE chat_id=? AND is_bot=0 AND ts >= ?').bind(chat.id, since).first<{ u: number }>();
  const d = await env.DB.prepare('SELECT COUNT(*) AS n FROM summaries WHERE chat_id=? AND created_at >= ?').bind(chat.id, since).first<{ n: number }>();
  const k = await env.DB.prepare("SELECT COUNT(*) AS n FROM kb_docs WHERE kind IN ('url','text') AND created_at >= ?").bind(since).first<{ n: number }>();
  await sendText(env, { serviceUrl: chat.service_url, conversationId: chat.id }, monthlyNote(months, { answers: a?.n ?? 0, askers: u?.u ?? 0, digests: d?.n ?? 0, kb: k?.n ?? 0 }));
  await setMeta(env, key, String(months));
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/messages') {
      if (req.method !== 'POST') return new Response('POST only', { status: 405 });
      let a: Activity;
      try { a = await req.json<Activity>(); } catch { return new Response('bad json', { status: 400 }); }
      const bad = await verifyBotRequest(req, env, a);
      if (bad) { console.warn('rejected', bad); return new Response('unauthorized', { status: 401 }); }
      try { await onActivity(env, ctx, a); } catch (e) { console.error('activity', e); }
      return new Response(null, { status: 200 });
    }

    if (path === '/') return page(env.BOT_NAME, `<p><img src="/logo.png" width="128" height="128" alt="亞太寶寶" style="display:block;margin:0 0 20px"></p><p>${env.ORG_NAME}的新同事，住在 Teams 裡。</p><p><a href="${env.RADAR_URL}">亞太競品雷達</a></p>`);
    if (path === '/logo.png') return new Response(LOGO, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
    if (path === '/privacy') return page('隱私說明', `<p>亞太寶寶只在被安裝的 Teams 對話裡運作。它會保存該對話的訊息文字、每日大綱，以及同事主動要求「記住」的資料，用來回答問題與整理大綱；資料存放在${env.ORG_NAME}自己的 Cloudflare 帳號。回答時會把相關內容送到 Anthropic 的 API 處理，依其商用條款不會被用於訓練模型。圖片只在回答當下使用，不保存。要刪除資料請聯絡管理者。</p>`);
    if (path === '/terms') return page('使用條款', `<p>亞太寶寶是${env.ORG_NAME}內部使用的工具，僅供部門同事於工作用途使用。回答由 AI 產生，可能有誤，重要決策請自行確認來源。</p>`);

    if (path.startsWith('/admin/')) {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      try { return await adminRoute(req, env, url, path); }
      catch (e: any) { console.error('admin', e); return json({ error: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6) }, 500); }
    }
    return new Response('not found', { status: 404 });
  },

  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dailySummaries(env));
  },
};

async function adminRoute(req: Request, env: Env, url: URL, path: string): Promise<Response> {
  {
    {
      if (path === '/admin/status') {
        const [spend, chats, docs] = await Promise.all([monthSpend(env), activeChats(env), listDocs(env, 20)]);
        const byModel = (await env.DB.prepare("SELECT model, kind, COUNT(*) AS n, SUM(input) AS input, SUM(output) AS output, SUM(searches) AS searches, ROUND(SUM(cost_usd),4) AS usd FROM usage WHERE ts >= ? GROUP BY model, kind ORDER BY usd DESC").bind(`${spend.month}-01`).all()).results;
        const counts = (await env.DB.prepare('SELECT chat_id, COUNT(*) AS n, MAX(ts) AS last FROM messages GROUP BY chat_id').all()).results;
        return json({ stage: stageName(), changelog: CHANGELOG, spend, by_model: byModel, chats, messages: counts, kb: docs, feedback: await feedbackStats(env, `${spend.month}-01`) });
      }
      if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
      const chatId = url.searchParams.get('chat') || (env.ALLOWED_CHATS || '').split(',')[0].trim();
      if (path === '/admin/summary') {
        const chat = await getChat(env, chatId);
        if (!chat) return json({ error: 'unknown chat' }, 404);
        const r = await runSummary(env, chat, url.searchParams.get('date') || TPE_DATE(), { post: url.searchParams.get('post') === '1', backfill: url.searchParams.get('backfill') !== '0' });
        return json(r);
      }
      if (path === '/admin/backfill') {
        const chat = await getChat(env, chatId);
        if (!chat) return json({ error: 'unknown chat' }, 404);
        const since = url.searchParams.get('since') || new Date(Date.now() - 7 * 86400e3).toISOString();
        const gm = await graphChatMessages(env, chat.id, since, 20);
        const n = await saveMessages(env, gm.map(m => ({ teams_id: m.id, chat_id: chat.id, ts: m.ts, from_id: m.from_id, from_name: m.from_name, is_bot: m.is_bot, text: m.text, images: m.images, source: 'graph' as const, reactions: m.reactions })));
        return json({ fetched: gm.length, inserted: n });
      }
      if (path === '/admin/send') {
        const chat = await getChat(env, chatId);
        if (!chat) return json({ error: 'unknown chat' }, 404);
        const text = url.searchParams.get('text') || '測試：亞太寶寶在線上。';
        return json({ ok: true, result: await sendText(env, { serviceUrl: chat.service_url, conversationId: chat.id }, text) });
      }
      if (path === '/admin/kb') {
        const body = await req.json<{ title?: string; text?: string; url?: string }>().catch(() => ({} as any));
        if (body.url) { const p = await fetchPage(env, body.url); return json(await ingest(env, { title: body.title || p.title, text: p.text, kind: 'url', source_url: body.url, added_by: 'admin' })); }
        if (body.text) return json(await ingest(env, { title: body.title || body.text.slice(0, 60), text: body.text, kind: 'text', added_by: 'admin' }));
        return json({ error: 'text or url required' }, 400);
      }
      if (path === '/admin/kb-delete') {
        const id = Number(url.searchParams.get('id'));
        return json({ ok: await removeDoc(env, id) });
      }
      if (path === '/admin/kb-search') {
        return json(await search(env, url.searchParams.get('q') || '', chatId, 6));
      }
      if (path === '/admin/summaries') return json(await recentSummaries(env, chatId, 7));
      if (path === '/admin/announce') {
        const chats = (await activeChats(env)).filter(c => c.kind !== 'personal' && allowedChat(env, c));
        return json({ chats: chats.length, said: await announceGrowth(env, chats) });
      }
      if (path === '/admin/selftest') {
        // 一步一步試:Workers AI 算向量 → Vectorize 查詢 → 雷達資料庫,哪一步壞了直接回報
        const out: Record<string, unknown> = {};
        const t0 = Date.now();
        const [v] = await embed(env, ['測試']); out.embed = { dims: v.length, ms: Date.now() - t0 };
        const q = await env.VEC.query(v, { topK: 1, namespace: 'kb' }); out.vectorize = { matches: q.count };
        out.radar = (await radarBrands(env)).length;
        out.spend = await monthSpend(env);
        return json(out);
      }
      return json({ error: 'unknown admin route' }, 404);
    }
  }
}
