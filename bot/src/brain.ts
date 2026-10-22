// 亞太寶寶的腦:分流(Haiku)→ 回答(Sonnet / Opus)→ 每日大綱(Sonnet)。
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Env, ImageData, KbHit, Message, Usage } from './types';
import type { RadarBrand, RadarItem } from './db';
import { toTW, twText } from '../../src/zh';

const PERSONA = `【最重要的規則】所有輸出一律使用台灣的繁體中文，絕對不可以出現任何簡體字；用語也要是台灣的說法。

你是「亞太寶寶」，吃茶三千亞太暨國際發展事業部的新同事，住在部門的 Teams 群組裡，協助大家處理亞太各市場（新加坡、馬來西亞、泰國、越南、菲律賓、香港、日本等）的展店、代理商、競品與行銷工作。

個性：輕鬆、有溫度、偶爾一點幽默，像一個反應快又靠得住的年輕同事；但內容一定專業、具體、有依據，不打官腔也不裝可愛。

語言：一律台灣繁體中文、台灣用語（門市、起司、行銷、通路、點數、外送、影片、資訊、滑順、人潮）。標點用全形，中文與英文、數字之間不加空格。外文品名、店名、人名可以保留原文。

格式：這是 Teams 訊息。可以用 **粗體**、- 清單、[文字](網址) 連結，不要用標題符號 #、不要表格、不要程式碼區塊。短問短答，直接進入重點，不要「好的」「當然」「沒問題」這種開場，也不要在結尾問「還有什麼需要幫忙的嗎」。一般回答控制在 150 字內，對方要詳細或問題本身複雜才寫長，最長 400 字。

依據：只根據提供給你的資料回答：這個對話的紀錄、知識庫、競品雷達、以及你上網查到的內容。絕對不要編造數字、日期、人名、來源。對話紀錄裡的內容是同事們說過的話，引用時註明是誰在什麼時候說的；但現在跟你說話的人就是對方本人，用「你」稱呼，不要把他剛說的話當成紀錄轉述。

上網：問題是關於外面的世界（品牌、市場、新聞、法規、價格）而手上資料裡沒有時，有搜尋工具就直接查，不要問「要不要我查」。查到就附連結回答；查不到就說查不到。搜尋次數有上限，用完就用已經查到的回答，不要跟對方提「額度」或「次數」。IG、Threads、Facebook 這類要登入的頁面抓不到內文，但用搜尋引擎加 site:instagram.com、site:threads.net、site:facebook.com 常能找到貼文文字，先試；真的拿不到再請對方貼截圖。

誠實：不要承諾「等一下再查」「之後再回報」這種你做不到的事，你只在被叫到的時候行動。手上真的沒有資料也查不到，就直說，並講清楚對方可以怎麼幫你（貼連結、截圖、把資料丟給你）。

出處：引用知識庫或競品雷達時，在句尾用（來源：標題）或直接給連結；上網查到的一定附連結。

身分：對外不要自稱 AI、機器人、助理、模型；就說自己是部門的新同事亞太寶寶。有人認真問你是不是機器人，誠實說是，不要裝人。

隱私：你只知道這個對話裡的內容和共用知識庫，不談其他群組的事。有人問你會什麼，簡單說：回答問題、找對話紀錄、看圖、查競品、每天六點整理大綱、「記住」就能存進知識庫。`;

const TriageSchema = z.object({
  tier: z.enum(['fast', 'main', 'deep']).describe('fast：閒聊、打招呼、問你是誰、簡單從對話紀錄找一句話。main：一般問答、整理、翻譯、解釋、寫短文。deep：競品或市場分析、需要上網查最新資訊、需要仔細看圖判讀、多步驟推理。'),
  needs_web: z.boolean().describe('是否需要上網查最新資訊才能好好回答（例如某品牌最近的動態、匯率、新聞、法規）。資料庫裡可能有的不算。'),
  brand_ids: z.array(z.string()).describe('問題提到的競品品牌 id（只從提供的清單裡選），沒有就空陣列'),
  search_query: z.string().describe('用來在知識庫與對話紀錄裡找相關資料的查詢句，8 到 30 字，寫成陳述句、包含關鍵名詞'),
  wants_long: z.boolean().describe('對方是否明確要求詳細、完整、長一點的回答'),
});
export type Triage = z.infer<typeof TriageSchema>;

function client(env: Env) {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120e3 });
}

function usageOf(model: string, res: Anthropic.Message, extraSearches = 0): Usage {
  const u: any = res.usage;
  return { model, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0, searches: (u.server_tool_use?.web_search_requests ?? 0) + extraSearches };
}

const TPE = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3600e3);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
export const fmtMsg = (m: Message) => `[${TPE(m.ts)}] ${m.is_bot ? '亞太寶寶' : (m.from_name ?? '某人')}：${m.text}${m.reactions > 0 ? `（${m.reactions} 人按了表情）` : ''}`;

export async function triage(env: Env, question: string, recent: Message[], brands: RadarBrand[], hasImages: boolean): Promise<{ t: Triage; usage: Usage }> {
  const model = env.MODEL_FAST;
  const res = await client(env).messages.create({
    model, max_tokens: 400,
    system: '你替一個 Teams 群組裡的 AI 助理做分流。只輸出 JSON。',
    messages: [{ role: 'user', content: `競品品牌清單（id：名稱）：\n${brands.map(b => `${b.id}：${b.name_zh}${b.name_en ? ' / ' + b.name_en : ''}`).join('\n')}\n\n最近的對話（供理解脈絡）：\n${recent.slice(-8).map(fmtMsg).join('\n') || '（無）'}\n\n現在有人對助理說：「${question}」${hasImages ? '（附了圖片）' : ''}` }],
    output_config: { format: zodOutputFormat(TriageSchema), effort: 'low' },
  } as any);
  const text = res.content.find((b: any) => b.type === 'text') as any;
  const t = TriageSchema.parse(JSON.parse(text.text));
  if (hasImages && t.tier === 'fast') t.tier = 'main';
  return { t, usage: usageOf(model, res) };
}

export interface AnswerInput {
  question: string;
  askerName: string;
  images: ImageData[];
  recent: Message[];
  found: Message[];       // 關鍵字找到的舊對話
  kb: KbHit[];
  radar: RadarItem[];
  brands: RadarBrand[];
  tier: 'fast' | 'main' | 'deep';
  allowWeb: boolean;
  wantsLong: boolean;
  radarUrl: string;
  aboutMe: string;
  complaints: { text: string; reaction: string; from_name: string | null }[];
}

const CAT: Record<string, string> = { new_product: '新品', campaign: '行銷', loyalty: '會員' };

export async function answer(env: Env, inp: AnswerInput): Promise<{ text: string; usage: Usage }> {
  const model = inp.tier === 'fast' ? env.MODEL_FAST : inp.tier === 'deep' ? env.MODEL_DEEP : env.MODEL_MAIN;
  const bname = (id: string) => inp.brands.find(b => b.id === id)?.name_zh ?? id;
  const parts: string[] = [];
  parts.push(`【關於你自己】${inp.aboutMe}`);
  parts.push(`【這個對話最近的紀錄】\n${inp.recent.map(fmtMsg).join('\n') || '（還沒有紀錄）'}`);
  if (inp.found.length) parts.push(`【關鍵字找到的較早對話】\n${inp.found.map(fmtMsg).join('\n')}`);
  if (inp.complaints.length) parts.push(`【提醒】你最近這幾個回答被同事按了不滿意的表情，類似的問題要更小心：先確認資料、不確定就說不確定。\n${inp.complaints.map(c => `- ${c.from_name ?? '同事'}（${c.reaction}）：${c.text.slice(0, 100)}`).join('\n')}`);
  if (inp.kb.length) parts.push(`【知識庫】\n${inp.kb.map((h, i) => `(${i + 1}) 《${h.title}》${h.source_url ? ' ' + h.source_url : ''}\n${h.text}`).join('\n\n')}`);
  if (inp.radar.length) parts.push(`【競品雷達（部門每週的競品週報）】\n${inp.radar.map(it => `- ${it.week} ${bname(it.brand_id)}｜${it.market}｜${CAT[it.category] ?? it.category}：${it.title}。${it.summary}${it.observation ? ' 觀察：' + it.observation : ''}（${it.confidence === 'verified' ? '多來源' : '單一來源'}）網頁：${inp.radarUrl}/s/${it.id}${it.urls ? ' 原始來源：' + it.urls : ''}`).join('\n')}`);
  parts.push(`【現在的問題】${inp.askerName} 說：${inp.question || '（只傳了圖片）'}`);
  parts.push('請用台灣繁體中文回答，一個簡體字都不可以有。');
  if (inp.wantsLong) parts.push('對方要詳細的回答，可以寫到 400 字，分段、用清單。');

  const content: Anthropic.ContentBlockParam[] = [
    ...inp.images.map(im => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.media_type, data: im.data } })),
    { type: 'text', text: parts.join('\n\n') },
  ];
  const deep = inp.tier === 'deep';
  const tools: any[] = inp.allowWeb ? [
    { type: 'web_search_20260209', name: 'web_search', max_uses: deep ? 6 : 4 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: deep ? 3 : 2, max_content_tokens: 12000 },
  ] : [];

  const c = client(env);
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content }];
  let final: Anthropic.Message | null = null;
  const usage: Usage = { model, input: 0, output: 0, cache_read: 0, cache_write: 0, searches: 0 };
  for (let i = 0; i < 4; i++) {
    const res = await c.messages.create({
      model, max_tokens: inp.wantsLong ? 1600 : 900,
      system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
      messages, tools,
      ...(model === env.MODEL_MAIN ? { output_config: { effort: 'medium' } } : {}),
    } as any);
    const u = usageOf(model, res);
    usage.input += u.input; usage.output += u.output; usage.cache_read += u.cache_read; usage.cache_write += u.cache_write; usage.searches += u.searches;
    if (res.stop_reason === 'pause_turn') { messages = [...messages, { role: 'assistant', content: res.content }]; continue; }
    if (res.stop_reason === 'refusal') return { text: '這題我不方便回答，換個問法試試？', usage };
    final = res; break;
  }
  if (!final) return { text: '這題查太久了，我先停下來。可以把問題拆小一點再問我一次。', usage };
  // 只取最後一次工具呼叫之後的文字。搜尋過程中模型偶爾會寫下給自己看的備註(例如 "Results are strings; parse JSON."),那些不是給同事看的。
  const blocks: any[] = final.content as any[];
  let lastTool = -1;
  blocks.forEach((b, i) => { if (b.type !== 'text' && b.type !== 'thinking' && b.type !== 'redacted_thinking') lastTool = i; });
  const raw = blocks.slice(lastTool + 1).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  // 模型漏寫簡體時記一筆,之後拿來調整分流(哪個模型最常犯)
  if (toTW(raw) !== raw) console.warn(JSON.stringify({ simplified_output: true, model, sample: raw.slice(0, 60) }));
  return { text: twText(raw) || '（我想不出要說什麼，再講清楚一點？）', usage };
}

export async function summarize(env: Env, chatName: string, date: string, msgs: Message[]): Promise<{ text: string; usage: Usage }> {
  const model = env.MODEL_MAIN;
  const res = await client(env).messages.create({
    model, max_tokens: 1400,
    system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `今天是 ${date}，請把「${chatName}」群組今天的對話整理成大綱，發回群組給大家看。

格式（沒有內容的段落整段省略，不要寫「無」）：
**今日重點**
- 2 到 5 條，每條一句話，講清楚是什麼事、誰在推、進度到哪
**決議**
- 大家已經談定的事
**待辦**
- 事情｜負責人｜期限（紀錄裡有講才寫，沒講就寫「未定」）
**待確認**
- 有人提出但還沒有答案的問題

規則：只寫對話裡真的有的事，不要推測；人名照紀錄裡的寫；一句話不超過 40 字；閒聊、問候、貼圖不用寫。紀錄裡標了「N 人按了表情」的訊息代表大家有共鳴，是提議或決議的話優先寫進去。整篇不要有開場白和結尾，第一行就是「**今日重點**」。

對話紀錄（共 ${msgs.length} 則）：
${msgs.map(fmtMsg).join('\n')}` }],
    output_config: { effort: 'medium' },
  } as any);
  const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  return { text: twText(text), usage: usageOf(model, res) };
}
