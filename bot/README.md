# 亞太寶寶（apac-bot）

Teams 群組裡的 AI 同事。跟競品雷達（`apac-radar`）同一個 repo、同一個 Cloudflare 帳號，但是獨立的 Worker 和資料庫。

## 她會做的事

- **@亞太寶寶 問問題**：群組裡的事、競品動態、市場資訊、翻譯、整理；附圖片也看得懂。
- **找對話紀錄**：「上週誰說要跟泰國代理商聯絡？」
- **每天 18:00 整理大綱**：重點、決議、待辦、待確認，貼回群組，同時存進她的記憶。
- **記住 + 網址或文字**：存進知識庫，之後回答會引用並附出處。
- **今天的大綱**：現在就整理今天到目前為止的對話。
- **額度**：看這個月的 AI 花費（含競品雷達）。
- **幫助**：以上說明。

## 怎麼分工、怎麼省錢

每則問題先由 Haiku 分流，再派給適合的模型：

| 工作 | 模型 |
|---|---|
| 分流、閒聊、簡單找紀錄 | claude-haiku-5-5 |
| 一般問答、每日大綱 | claude-sonnet-5-5 |
| 競品分析、要上網查、看圖判讀 | claude-opus-5-5 |

月預算 `BUDGET_USD`（預設 100，含競品雷達）：到 85% 她不上網查、不用 Opus；到 100% 停止回答，等下個月。Anthropic console 的 Spend limit 是真正的硬鎖。

## 成長與稱號

不用版本號。@名字永遠是「亞太寶寶」，稱號跟著世代走：寶寶 → 妹妹 → 姐姐 → 阿姨 → 阿婆。每次更新在 `src/growth.ts` 的 `CHANGELOG` 加一筆（`skill` 學會一件事、`grow` 升一代），部署後她會自己在群組宣布。加入群組後每個月同一天她會報這個月的數字（滿月、一歲有特別版）。

## 架構

- `src/index.ts` 路由：`/api/messages`（Teams 進來）、`/admin/*`、每日排程。
- `src/teams.ts` 驗證 Teams 的 JWT、拿 token、回話、抓圖、Graph 補抓紀錄。
- `src/brain.ts` 分流、回答、大綱（Anthropic SDK）。
- `src/kb.ts` 知識庫：拆段 → Workers AI `bge-m3` 向量 → Vectorize；原文在 D1。
- `src/db.ts` D1 讀寫；`src/budget.ts` 成本與預算。
- `manifest/` Teams 安裝包；`node scripts/pack-manifest.mjs` 重新打包成 `apac-baby.zip`。

資料：D1 `apac-bot`（對話、大綱、知識庫原文、用量）、Vectorize `apac-bot-kb`（語意索引）。對話紀錄只在那個對話裡用；共用知識庫（namespace `kb`）大家都查得到。

## 第一次部署（PowerShell，在 repo 根目錄）

```powershell
git pull origin claude/availability-check-7vo48i
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue   # 這台電腦有另一個帳號的 token,每開新視窗都要拿掉

npx wrangler vectorize create apac-bot-kb --dimensions=1024 --metric=cosine
npm run migrate:bot
npx wrangler secret put ANTHROPIC_API_KEY -c bot/wrangler.jsonc
npx wrangler secret put MS_APP_SECRET -c bot/wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN -c bot/wrangler.jsonc
npm run deploy:bot
```

之後改程式只要 `git pull` 再 `npm run deploy:bot`。

## Teams 那邊

1. Developer Portal → 工具 → 機器人 → 亞太寶寶：終結點地址 `https://apac-bot.ccsc.workers.dev/api/messages`，頻道啟用 Microsoft Teams，客戶端密碼產生一組（只顯示一次，貼進上面的 `MS_APP_SECRET`）。
2. Teams → 應用程式 → 管理您的應用程式 → 上傳應用程式 → 將應用程式提交給您的組織，選 `bot/manifest/apac-baby.zip`，請管理員核准。
3. 核准後把亞太寶寶加進群組，安裝時同意「讀取這個聊天的訊息」。她會自我介紹。

## 管理

- `GET  /admin/status?k=…` 稱號、更新紀錄、花費、對話、知識庫。
- `POST /admin/announce?k=…` 部署後立刻讓她在群組宣布新學會的事（不呼叫的話每天 18:00 也會自己說）。
- `POST /admin/summary?k=…&date=YYYY-MM-DD&post=1` 手動跑大綱（`post=0` 只回傳不貼）。
- `POST /admin/backfill?k=…&since=ISO` 從 Graph 補抓紀錄。
- `POST /admin/send?k=…&text=…` 測試主動發話。
- `POST /admin/kb?k=…` body `{"url":"…"}` 或 `{"title":"…","text":"…"}`；`POST /admin/kb-delete?k=…&id=N`；`POST /admin/kb-search?k=…&q=…`。
