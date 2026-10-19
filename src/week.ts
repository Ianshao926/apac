// ISO 週計算。所有「本週」都以台北時間為準。
const DAY = 86400000;

function utcDate(y: number, m: number, d: number) { return new Date(Date.UTC(y, m, d)); }

export function isoWeekOf(d: Date): { year: number; week: number } {
  const t = utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = t.getUTCDay() || 7;           // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);    // Thursday of this week
  const yearStart = utcDate(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekId(year: number, week: number) { return `${year}-W${String(week).padStart(2, '0')}`; }

/** 給定 ISO 週,回傳週一與週日(YYYY-MM-DD) */
export function weekRange(year: number, week: number): { start: string; end: string } {
  const jan4 = utcDate(year, 0, 4);
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Day - 1) * DAY);
  const monday = new Date(mondayW1.getTime() + (week - 1) * 7 * DAY);
  const sunday = new Date(monday.getTime() + 6 * DAY);
  return { start: ymd(monday), end: ymd(sunday) };
}

export function parseWeekId(id: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

export function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 週一早上跑的時候,目標是「剛結束的那一週」。以台北時間減一天後取 ISO 週。 */
export function targetWeekFor(now = new Date()): string {
  const taipei = new Date(now.getTime() + 8 * 3600000);
  const yesterday = new Date(taipei.getTime() - DAY);
  const { year, week } = isoWeekOf(yesterday);
  return weekId(year, week);
}

export function previousWeeks(id: string, n: number): string[] {
  const p = parseWeekId(id);
  if (!p) return [];
  const { start } = weekRange(p.year, p.week);
  const out: string[] = [];
  const monday = new Date(start + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * DAY);
    const w = isoWeekOf(d);
    out.push(weekId(w.year, w.week));
  }
  return out;
}

/** '2026-10-12' -> '10.12' */
export function md(s: string | null | undefined) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}.${m[3]}` : s;
}
export function weekday(s: string | null | undefined) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
}
