// 亞太寶寶的成長:不用版本號,用稱號。@名字永遠是「亞太寶寶」,稱號跟著世代走。
// 每次更新在 CHANGELOG 加一筆;部署後她會自己在群組宣布(排程或 /admin/announce 觸發一次)。
export const STAGES = ['寶寶', '妹妹', '姐姐', '阿姨', '阿婆'] as const;

export interface Change {
  id: number;             // 遞增,不重複
  date: string;           // YYYY-MM-DD
  stage: number;          // 0 = 寶寶
  kind: 'birth' | 'skill' | 'grow';
  text: string;           // skill:一句話;grow:每行一項新本事
}

export const CHANGELOG: Change[] = [
  { id: 1, date: '2026-10-20', stage: 0, kind: 'birth', text: '會回答問題、看圖、找對話紀錄，每天 18:00 整理大綱，說「記住」就存進知識庫；回覆她的訊息也算在叫她；看得懂大家對她按的表情，大綱會參考被按讚的訊息' },
];

export const currentStage = () => CHANGELOG[CHANGELOG.length - 1].stage;
export const stageName = (i = currentStage()) => `亞太${STAGES[Math.min(i, STAGES.length - 1)]}`;
export const nextStageName = (i = currentStage()) => (i + 1 < STAGES.length ? `亞太${STAGES[i + 1]}` : null);
/** 這一代學會了幾件新事(不含出生、不含升級那一筆本身) */
export const skillsThisStage = () => CHANGELOG.filter(c => c.stage === currentStage() && c.kind === 'skill').length;
export const grownAt = () => CHANGELOG.find(c => c.stage === currentStage() && (c.kind === 'grow' || c.kind === 'birth'))?.date ?? CHANGELOG[0].date;

const md = (d: string) => d.replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1/$2');

/** 「幫助」結尾那句 */
export function selfLine(joinDate: string): string {
  const n = skillsThisStage();
  const learned = n ? `到目前學會 ${n} 件新事` : '還在學';
  if (currentStage() === 0) return `我是亞太寶寶，${md(joinDate)} 加入這個群組，${learned}。`;
  return `我是亞太寶寶，已經長成${stageName()}了（${md(grownAt())}）。${md(joinDate)} 加入這個群組，這個階段${learned}。`;
}

/** 給模型看的一行自我資料,讓她知道自己幾歲、什麼時候來的 */
export function aboutMe(joinDate: string): string {
  return `你的稱號是${stageName()}（第 ${currentStage() + 1} 代），${md(joinDate)} 加入這個群組；稱號會隨著學會的事變多而長大：${STAGES.map(s => '亞太' + s).join('→')}。`;
}

/** 某一筆更新要在群組說的話 */
export function announcement(c: Change): string {
  if (c.kind === 'skill') return `我又學會一件事 ✅ ${c.text}`;
  if (c.kind === 'grow') {
    const lines = c.text.split('\n').map(s => s.trim()).filter(Boolean).map(s => `- ${s.replace(/^[-•]\s*/, '')}`);
    return `🎉 我長大了！從今天起我是**${stageName(c.stage)}**。\n新學會的：\n${lines.join('\n')}\n叫我的方式不變，還是 @亞太寶寶。`;
  }
  return '';
}

/** 加入群組後,每個月的同一天結算一次。回 null 代表今天不是結算日。 */
export function monthsSince(joinDate: string, today: string): number | null {
  const j = new Date(joinDate + 'T00:00:00Z'); const t = new Date(today + 'T00:00:00Z');
  // 31 號加入的,遇到沒有 31 號的月份就用月底
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  if (t.getUTCDate() !== Math.min(j.getUTCDate(), lastDay)) return null;
  const months = (t.getUTCFullYear() - j.getUTCFullYear()) * 12 + (t.getUTCMonth() - j.getUTCMonth());
  return months >= 1 ? months : null;
}

export interface MonthStats { answers: number; digests: number; kb: number; askers: number }

/** 月結算要說的話。stats 是這一個月的數字,不是累計。 */
export function monthlyNote(months: number, s: MonthStats): string {
  const tally = `回答了 ${s.answers} 個問題（${s.askers} 位同事問過我）、整理了 ${s.digests} 天大綱、記住了 ${s.kb} 份資料`;
  if (months === 1) return `我滿月了 🍼 這一個月${tally}。謝謝大家餵我，繼續丟東西給我吧。`;
  if (months === 12) return `我一歲了 🎂 這個月${tally}。謝謝大家一路餵我長大，接下來也請多指教。`;
  return `我來這裡滿 ${months} 個月了。這個月${tally}。`;
}
