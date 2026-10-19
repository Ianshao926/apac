// 預算控制:每次呼叫記成本,整個帳號(亞太寶寶 + 競品雷達)合計跟月預算比。
import type { Env, Usage } from './types';

// 每百萬 token 的美金價;cache 讀 = 輸入價 ×0.05(Haiku ×0.1),cache 寫 = ×1.25。網路搜尋每次 US$0.01。
const PRICE: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cr: 0.2, cw: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cr: 0.01, cw: 0.125 },
};
const SEARCH_USD = 0.01;

export function costOf(u: Usage): number {
  const p = PRICE[u.model] ?? PRICE['claude-opus-5-5'];
  return (u.input * p.in + u.output * p.out + u.cache_read * p.cr + u.cache_write * p.cw) / 1e6 + u.searches * SEARCH_USD;
}

export async function recordUsage(env: Env, chatId: string | null, kind: string, u: Usage) {
  await env.DB.prepare('INSERT INTO usage (chat_id,kind,model,input,output,cache_read,cache_write,searches,cost_usd) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(chatId, kind, u.model, u.input, u.output, u.cache_read, u.cache_write, u.searches, costOf(u)).run();
}

export interface Spend { bot: number; radar: number; total: number; budget: number; ratio: number; level: 'ok' | 'tight' | 'stop'; month: string }

/** 這個月(UTC,跟 Anthropic 的帳單週期一樣)花了多少 */
export async function monthSpend(env: Env): Promise<Spend> {
  const month = new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const b = await env.DB.prepare('SELECT COALESCE(SUM(cost_usd),0) AS c FROM usage WHERE ts >= ?').bind(start).first<{ c: number }>();
  // 雷達那邊沒記 cache,用 Opus 原價估,會略高估,保守一點剛好。
  const r = await env.RADAR.prepare('SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o, COALESCE(SUM(searches),0) AS s FROM runs WHERE finished_at >= ?').bind(start).first<{ i: number; o: number; s: number }>()
    .catch(() => ({ i: 0, o: 0, s: 0 }));
  const radar = costOf({ model: 'claude-opus-5-5', input: r?.i ?? 0, output: r?.o ?? 0, cache_read: 0, cache_write: 0, searches: r?.s ?? 0 });
  const bot = b?.c ?? 0;
  const budget = Math.max(1, Number(env.BUDGET_USD || '100'));
  const total = bot + radar;
  const ratio = total / budget;
  return { bot, radar, total, budget, ratio, level: ratio >= 1 ? 'stop' : ratio >= 0.85 ? 'tight' : 'ok', month };
}

export function spendLine(s: Spend) {
  const pct = Math.round(s.ratio * 100);
  return `這個月（${s.month}）用了 **US$${s.total.toFixed(2)}**，上限 US$${s.budget}（${pct}%）。亞太寶寶 US$${s.bot.toFixed(2)}、競品雷達約 US$${s.radar.toFixed(2)}。`;
}
