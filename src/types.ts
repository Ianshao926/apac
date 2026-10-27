export interface Env {
  DB: D1Database;
  IMG: KVNamespace;
  ANTHROPIC_API_KEY: string;
  TEAMS_WEBHOOK_URL: string;
  ADMIN_TOKEN: string;
  SITE_NAME: string;
  ORG_NAME: string;
  BRANDS_PER_BATCH: string;
  MODEL: string;
  PUBLIC_URL?: string;
}

export interface Brand {
  id: string;
  name_zh: string;
  name_en: string | null;
  markets: string;   // JSON
  focus: string;
  domains: string;   // JSON
  tier: string;
  active: number;
  sort: number;
}

export interface Issue {
  week: string;
  no: number | null;
  range_start: string;
  range_end: string;
  status: string;
  theme_line: string | null;
  created_at: string;
  published_at: string | null;
}

export interface Item {
  id: string;
  week: string;
  brand_id: string;
  category: 'new_product' | 'campaign' | 'loyalty';
  market: string;
  title: string;
  summary: string;
  observation: string | null;
  date_start: string | null;
  date_end: string | null;
  status_note: string | null;
  confidence: 'verified' | 'single';
  is_lead: number;
  rank: number;
  hidden: number;
  created_at: string;
}

export interface ItemSource {
  item_id: string;
  url: string;
  publisher: string | null;
  title: string | null;
  published_at: string | null;
  is_official: number;
}

export interface ItemImage {
  item_id: string;
  kv_key: string;
  content_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  source_url: string;
  page_url: string | null;
  credit: string;
  is_official: number;
  sort: number;
}

export interface IssueBundle {
  issue: Issue;
  brands: Brand[];
  items: Item[];
  sources: Record<string, ItemSource[]>;
  images: Record<string, ItemImage[]>;
  activity: Record<string, string[]>;   // brand_id -> weeks with items (last 8)
  weeks8: string[];
  quiet: Brand[];
  runs: { brand_id: string; status: string; items_found: number }[];
}

export const CATEGORY_ZH: Record<Item['category'], string> = {
  new_product: '新品與菜單',
  campaign: '行銷檔期',
  loyalty: '會員經營',
};
export const CATEGORY_SHORT: Record<Item['category'], string> = {
  new_product: '新品',
  campaign: '行銷',
  loyalty: '會員',
};

/** 往期列表用:每一期的摘要 */
export interface IssueSummary extends Issue {
  items: number;
  brands: number;
  lead_title: string | null;
  lead_brand: string | null;
  cover_key: string | null;   // 封面用的圖:本期檔案最大(通常解析度最高)的一張
}

/** 跨期頁面(品牌頁、分類頁)用的一組動態 */
export interface ItemsBundle {
  items: Item[];
  sources: Record<string, ItemSource[]>;
  images: Record<string, ItemImage[]>;
}

export interface BrandStat { brand_id: string; items: number; weeks: number; last_week: string | null }

export const CATEGORY_EN: Record<Item['category'], string> = {
  new_product: 'New Products',
  campaign: 'Campaigns',
  loyalty: 'Loyalty',
};
export const CATEGORIES = ['new_product', 'campaign', 'loyalty'] as const;
