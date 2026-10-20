export interface Env {
  DB: D1Database;
  RADAR: D1Database;
  AI: Ai;
  VEC: VectorizeIndex;
  RADAR_WORKER: Fetcher;
  ANTHROPIC_API_KEY: string;
  MS_APP_ID: string;
  MS_APP_SECRET: string;
  MS_TENANT_ID: string;
  ADMIN_TOKEN: string;
  BOT_NAME: string;
  ORG_NAME: string;
  ALLOWED_CHATS: string;
  BUDGET_USD: string;
  RADAR_URL: string;
  MODEL_FAST: string;
  MODEL_MAIN: string;
  MODEL_DEEP: string;
}

/** Bot Framework activity,只列用得到的欄位 */
export interface Activity {
  type: string;
  id?: string;
  timestamp?: string;
  serviceUrl: string;
  channelId?: string;
  from: { id: string; name?: string; aadObjectId?: string };
  recipient: { id: string; name?: string };
  conversation: { id: string; conversationType?: string; tenantId?: string; name?: string; isGroup?: boolean };
  text?: string;
  textFormat?: string;
  attachments?: { contentType: string; contentUrl?: string; content?: unknown; name?: string }[];
  entities?: { type: string; mentioned?: { id: string; name?: string }; text?: string }[];
  channelData?: { tenant?: { id: string }; eventType?: string };
  membersAdded?: { id: string; name?: string }[];
  membersRemoved?: { id: string; name?: string }[];
  action?: string;
  replyToId?: string;
  reactionsAdded?: { type: string }[];
  reactionsRemoved?: { type: string }[];
  locale?: string;
}

export interface Chat {
  id: string;
  kind: string;
  name: string | null;
  service_url: string;
  tenant_id: string | null;
  installed_at: string;
  last_seen: string;
  active: number;
  summary_enabled: number;
  last_summary_date: string | null;
}

export interface Message {
  rowid: number;
  teams_id: string;
  chat_id: string;
  ts: string;
  from_id: string | null;
  from_name: string | null;
  is_bot: number;
  text: string;
  images: number;
  source: string;
  reactions: number;
}

export interface KbDoc {
  id: number;
  title: string;
  kind: string;
  source_url: string | null;
  chat_id: string | null;
  added_by: string | null;
  chars: number;
  chunks: number;
  created_at: string;
}

export interface KbHit {
  id: string;
  doc_id: number;
  score: number;
  title: string;
  kind: string;
  source_url: string | null;
  text: string;
}

export interface Usage {
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  searches: number;
}

/** 收到的一張圖(已抓下來) */
export interface ImageData {
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;   // base64
}
