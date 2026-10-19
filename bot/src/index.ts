// 亞太寶寶:Teams 群組裡的 AI 同事。
// /api/messages 收 Teams 的訊息;每天台北 18:00 整理大綱;/admin/* 給 Ian 看狀態、管知識庫。
import type { Activity, Chat, Env, Message } from './types';
import { cleanText, fetchImages, graphChatMessages, hasFiles, isMentioned, sendText, sendTyping, verifyBotRequest, type Target } from './teams';
import { activeChats, deactivateChat, getChat, messagesBetween, radarBrands, radarItems, recentMessages, recentSummaries, saveMessage, saveMessages, saveSummary, searchMessages, upsertChat } from './db';
import { answer, summarize, triage } from './brain';
import { fetchPage, ingest, listDocs, removeDoc, search } from './kb';
import { monthSpend, recordUsage, spendLine, type Spend } from './budget';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const page = (title: string, body: string) => new Response(`<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;max-width:40em;margin:60px auto;padding:0 20px;line-height:1.9;color:#111}h1{font-weight:600;font-size:22px}</style><body><h1>${title}</h1>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

const HELP = `我是亞太寶寶，部門群組裡的 AI 同事。可以這樣用我：
- **@我 問問題**：群組裡的事、競品動態、市場資訊、翻譯、整理，附圖片也看得懂
- **找紀錄**：「上週誰說要跟泰國代理商聯絡？」這種我會翻對話紀錄
- **每天 18:00** 我會把當天的對話整理成大綱貼在群組
- **記住 + 網址或一段文字**：存進知識庫，之後問到我就會引用
- **今天的大綱**：現在就整理今天到目前為止的對話
- **額度**：看這個月的 AI 花費`;

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
      if (!allowedChat(env, chat)) { await sendText(env, t, '嗨，我是亞太寶寶。目前我只服務亞太事業部的群組，這裡我先不說話，有需要請找 Ian 開通。'); return; }
      await sendText(env, t, chat.kind === 'personal'
        ? '嗨，我是亞太寶寶 👋 直接跟我說話就好。打「幫助」看我會什麼。'
        : `嗨，我是亞太寶寶 👋 從今天起我會跟著這個群組：\n- @我 就能問問題，群組裡的事、競品、市場都可以\n- 每天 18:00 我會把當天的對話整理成大綱\n- 丟網址或資料給我說「記住」，就存進知識庫\n\n打「@亞太寶寶 幫助」看完整說明。`);
    }
    if (removed) await deactivateChat(env, a.conversation.id);
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
  const addressed = chat.kind === 'personal' || isMentioned(a);
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

  if (/^(幫助|help|你會什麼|你會做什麼|說明)$/i.test(cmd)) return sendText(env, t, HELP);
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
        ? await (async () => { const p = await fetchPage(url); return ingest(env, { title: p.title, text: p.text, kind: 'url', source_url: url, added_by: asker }); })()
        : await ingest(env, { title: body.split('\n')[0].slice(0, 60) || '同事提供的資料', text: body, kind: 'text', added_by: asker });
      return sendText(env, t, `記住了：《${doc.title}》，${doc.chars} 字，拆成 ${doc.chunks} 段。之後問到相關的事我會引用。`);
    } catch (e: any) {
      return sendText(env, t, `這個我存不進去：${e?.message ?? e}。可以把文字直接貼給我再試一次。`);
    }
  }

  const spend = await monthSpend(env);
  if (spend.level === 'stop') return sendText(env, t, `這個月的 AI 額度（US$${spend.budget}）用完了，我先休息到下個月 1 號。急的話請 Ian 調高上限。`);
  await sendTyping(env, t);

  const [recent, brands, images] = await Promise.all([recentMessages(env, chat.id, 30, a.id), radarBrands(env), fetchImages(env, a)]);
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
    tier, allowWeb, wantsLong: tri.t.wants_long, radarUrl: env.RADAR_URL,
  });
  await recordUsage(env, chat.id, 'answer', r.usage);
  let reply = r.text;
  if (hasFiles(a)) reply += '\n\n（附的檔案我現在還讀不了，先貼文字或截圖給我。）';
  if (spend.level === 'tight') reply += '\n\n（這個月額度快用完了，我先不上網查。）';
  await sendText(env, t, reply);
  await saveMessage(env, { teams_id: `bot:${a.id}`, chat_id: chat.id, ts: new Date().toISOString(), from_id: null, from_name: env.BOT_NAME, is_bot: true, text: reply, images: 0, source: 'live' });
}

// ---- 每日大綱 ----
async function runSummary(env: Env, chat: Chat, date: string, opt: { post: boolean; backfill: boolean }): Promise<{ count: number; text: string | null; posted: boolean }> {
  const { from, to } = dayRangeUtc(date);
  if (opt.backfill) {
    try {
      const gm = await graphChatMessages(env, chat.id, from);
      const n = await saveMessages(env, gm.filter(m => m.ts >= from && m.ts < to).map(m => ({ teams_id: m.id, chat_id: chat.id, ts: m.ts, from_id: m.from_id, from_name: m.from_name, is_bot: m.is_bot, text: m.text, images: m.images, source: 'graph' as const })));
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
  for (const chat of await activeChats(env)) {
    if (!chat.summary_enabled || chat.kind === 'personal' || !allowedChat(env, chat) || chat.last_summary_date === date) continue;
    try {
      const r = await runSummary(env, chat, date, { post: true, backfill: true });
      if (!r.text) await env.DB.prepare('UPDATE chats SET last_summary_date=? WHERE id=?').bind(date, chat.id).run();
      console.log(JSON.stringify({ chat: chat.id, date, ...r, text: undefined }));
    } catch (e) { console.error('summary failed', chat.id, e); }
  }
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

    if (path === '/') return page(env.BOT_NAME, `<p>${env.ORG_NAME}的 AI 同事，住在 Teams 裡。</p><p><a href="${env.RADAR_URL}">亞太競品雷達</a></p>`);
    if (path === '/privacy') return page('隱私說明', `<p>亞太寶寶只在被安裝的 Teams 對話裡運作。它會保存該對話的訊息文字、每日大綱，以及同事主動要求「記住」的資料，用來回答問題與整理大綱；資料存放在${env.ORG_NAME}自己的 Cloudflare 帳號。回答時會把相關內容送到 Anthropic 的 API 處理，依其商用條款不會被用於訓練模型。圖片只在回答當下使用，不保存。要刪除資料請聯絡管理者。</p>`);
    if (path === '/terms') return page('使用條款', `<p>亞太寶寶是${env.ORG_NAME}內部使用的工具，僅供部門同事於工作用途使用。回答由 AI 產生，可能有誤，重要決策請自行確認來源。</p>`);

    if (path.startsWith('/admin/')) {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      if (path === '/admin/status') {
        const [spend, chats, docs] = await Promise.all([monthSpend(env), activeChats(env), listDocs(env, 20)]);
        const byModel = (await env.DB.prepare("SELECT model, kind, COUNT(*) AS n, SUM(input) AS input, SUM(output) AS output, SUM(searches) AS searches, ROUND(SUM(cost_usd),4) AS usd FROM usage WHERE ts >= ? GROUP BY model, kind ORDER BY usd DESC").bind(`${spend.month}-01`).all()).results;
        const counts = (await env.DB.prepare('SELECT chat_id, COUNT(*) AS n, MAX(ts) AS last FROM messages GROUP BY chat_id').all()).results;
        return json({ spend, by_model: byModel, chats, messages: counts, kb: docs });
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
        const n = await saveMessages(env, gm.map(m => ({ teams_id: m.id, chat_id: chat.id, ts: m.ts, from_id: m.from_id, from_name: m.from_name, is_bot: m.is_bot, text: m.text, images: m.images, source: 'graph' as const })));
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
        if (body.url) { const p = await fetchPage(body.url); return json(await ingest(env, { title: body.title || p.title, text: p.text, kind: 'url', source_url: body.url, added_by: 'admin' })); }
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
      return json({ error: 'unknown admin route' }, 404);
    }
    return new Response('not found', { status: 404 });
  },

  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dailySummaries(env));
  },
};
