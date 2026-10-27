import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { BrandReportSchema, type BrandReport } from './schema';
import type { Brand, Env } from './types';

const SYSTEM = `你是「亞太競品雷達」的資深情報編輯,服務對象是吃茶三千(CHICHA San Chen,台灣茶飲品牌)的管理層與亞太事業部。
你的工作:針對指定品牌、指定的一週,用網路搜尋與網頁抓取,找出三類值得記錄的動態,整理成結構化資料。

三個類別:
- new_product 新品與菜單:新飲品、季節系列、菜單改版、品項下架、價格調整。
- campaign 行銷檔期:聯名、快閃、促銷(買一送一、限時價)、節慶活動、名人合作、開幕檔期的促銷機制(開幕本身不算,促銷機制才算)。
- loyalty 會員經營:App 改版、點數與等級規則、訂閱制、生日禮、入會禮、會員專屬活動、財報或公開場合揭露的會員數字。

紀律:
1. 只收錄「發生日期落在指定週內」或「指定週內仍在進行中」的事。更早的事只有在能和本週對照時才收,並在 status_note 註明。
2. 每一則至少一個真實來源。找到兩個以上獨立來源就全部列出。來源網址必須是你實際搜尋或抓取到的,不可以憑印象拼湊。
3. 單純展店、新店開幕、人事、融資不收,除非附帶行銷機制或會員機制。
4. 標題、摘要、觀察、狀態說明一律用台灣繁體中文,語氣像財經週報:具體、克制、有數字。摘要只寫事實,觀察另外寫在 observation。
   用字以台灣習慣為準:門市(不是門店)、起司(不是芝士)、行銷、通路、點數、外送、影片、資訊、滑順、人潮、中國(不寫中國內地)。
   標點一律全形:,。、:;「」()!?;中文與英文、數字之間不加空格。外文品名、店名可保留原文。
5. observation 只在真的有洞見時寫:這件事對一個做高品質茶飲、重視茶葉敘事的台灣品牌有什麼參考價值。沒有就 null,不要硬湊。
6. 圖片:優先找品牌官方素材(官網、官方 Instagram/Facebook 貼文的圖、官方新聞稿配圖),其次用報導的主圖。image_urls 要是直接指向圖片檔的網址;找不到就給空陣列,不要編造。
7. 中國品牌的海外分部優先;中國本土的動態只在全球同步或特別重要時納入。
8. 不確定的事寧可不收。寧缺勿濫,一個品牌一週通常是 0 到 3 則。`;

export interface ResearchResult {
  report: BrandReport;
  usage: { input: number; output: number; searches: number; cache_read: number; cache_write: number };
  model: string;
}

export async function researchBrand(env: Env, brand: Brand, week: string, start: string, end: string, prevTitles: string[] = []): Promise<ResearchResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 9 * 60 * 1000 });
  const markets: string[] = JSON.parse(brand.markets);
  const domains: string[] = JSON.parse(brand.domains);
  const today = new Date().toISOString().slice(0, 10);

  const user = `品牌:${brand.name_zh}${brand.name_en ? `(${brand.name_en})` : ''}
關注市場:${markets.join('、')}
搜尋重點:${brand.focus}
官方網域提示:${domains.join('、')}
指定週:${week},${start} 至 ${end}(週一至週日)。今天是 ${today}。
${prevTitles.length ? `\n前兩期已經收錄過(同一件事不要再收;只有本週有明確新進展時才收,而且標題要寫出新進展,不是重講原本的事):\n${prevTitles.map(t => '- ' + t).join('\n')}\n` : ''}
請用多種語言與關鍵字搜尋(品牌中英文名 + 新品 / new / launch / promo / 會員 / loyalty / app / 聯名 / collab,以及各市場當地語言),必要時抓取官方頁面確認。
找到候選後逐一確認日期與來源,最後只輸出符合紀律的條目。`;

  const tools: any[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6, max_content_tokens: 20000 },
  ];

  let messages: any[] = [{ role: 'user', content: user }];
  let final: Anthropic.Message | null = null;
  let input = 0, output = 0, searches = 0, cacheRead = 0, cacheWrite = 0;

  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create({
      model: env.MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      messages,
      tools,
      output_config: { format: zodOutputFormat(BrandReportSchema) },
    } as any);
    input += res.usage.input_tokens; output += res.usage.output_tokens;
    cacheRead += (res.usage as any).cache_read_input_tokens ?? 0; cacheWrite += (res.usage as any).cache_creation_input_tokens ?? 0;
    searches += (res.usage as any).server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: res.content }];
      continue;
    }
    if (res.stop_reason === 'refusal') throw new Error('model refused: ' + JSON.stringify((res as any).stop_details ?? {}));
    final = res; break;
  }
  if (!final) throw new Error('research did not finish after 4 turns');

  const text = [...final.content].reverse().find((b: any) => b.type === 'text') as any;
  if (!text) throw new Error('no text block in final response');
  let parsed: unknown;
  try { parsed = JSON.parse(text.text); } catch { throw new Error('final text is not JSON: ' + text.text.slice(0, 200)); }
  const report = BrandReportSchema.parse(parsed);
  return { report, usage: { input, output, searches, cache_read: cacheRead, cache_write: cacheWrite }, model: final.model };
}
