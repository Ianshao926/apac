import { z } from 'zod';

export const SourceSchema = z.object({
  url: z.string().describe('完整網址,必須是搜尋或抓取時實際看到的'),
  publisher: z.string().describe('媒體或網站名稱,例如 Eatbook、官方 Instagram'),
  title: z.string().describe('該頁標題'),
  published_at: z.string().nullable().describe('YYYY-MM-DD,不確定給 null'),
  is_official: z.boolean().describe('是否為品牌官方來源(官網、官方社群、官方新聞稿)'),
});

export const ItemSchema = z.object({
  category: z.enum(['new_product', 'campaign', 'loyalty']).describe('new_product 新品與菜單 / campaign 行銷檔期 / loyalty 會員經營'),
  market: z.string().describe('市場,繁體中文,例如 新加坡、馬來西亞、全球同步、台灣'),
  title: z.string().describe('繁體中文標題,24 到 38 字,像報紙標題,寫出「發生了什麼 + 怎麼做」,不要用驚嘆號'),
  summary: z.string().describe('繁體中文摘要,90 到 170 字,只寫事實:日期、品項、價格、機制、地點;不要評論'),
  observation: z.string().nullable().describe('對吃茶三千的一句觀察,30 到 60 字,只有真的有洞見才寫,否則 null'),
  date_start: z.string().nullable().describe('YYYY-MM-DD'),
  date_end: z.string().nullable().describe('YYYY-MM-DD,單日或不確定給 null'),
  status_note: z.string().nullable().describe('例如 持續中、已結束、中期財報;沒有給 null'),
  sources: z.array(SourceSchema).min(1).describe('至少一個,找得到兩個以上就全部列'),
  image_urls: z.array(z.string()).describe('直接指向圖片檔(jpg/png/webp)的網址,官方素材優先,其次是報導主圖;最多 4 個;找不到給空陣列'),
  image_credit: z.string().nullable().describe('圖片出處,例如 官方 Instagram、Eatbook'),
});

export const BrandReportSchema = z.object({
  items: z.array(ItemSchema).max(5).describe('這個品牌在這一週值得記錄的動態,最多 5 則;沒有就空陣列'),
  quiet_reason: z.string().nullable().describe('如果 items 為空,用一句繁體中文說明查了哪些地方沒有動態'),
});

export type BrandReport = z.infer<typeof BrandReportSchema>;
export type ReportItem = z.infer<typeof ItemSchema>;
