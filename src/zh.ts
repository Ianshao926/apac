// 台灣繁體中文整理:模型產出的文字送出或存檔前先過一次。
// 0. 簡體字強制轉台灣繁體;1. 中文旁的半形標點改全形;2. 中文與英數之間不留空格;3. 常見中國用語換成台灣用語。
// 用語表刻意保守:只放「在茶飲與零售語境下幾乎不會換錯」的詞。品牌或品項的官方名稱若剛好含這些詞,
// 會一起被換掉,所以不要把品名常用字(例如「奶茶」)放進來。

import * as OpenCC from 'opencc-js/cn2t';

// 簡體 → 台灣繁體(含用語),模型偶爾會漏寫成簡體,這是最後一道保險。字典初始化一次就好。
let cn2tw: ((s: string) => string) | null = null;
export function toTW(s: string): string {
  if (!s || !/[\u4e00-\u9fff]/.test(s)) return s;
  cn2tw ??= OpenCC.Converter({ from: 'cn', to: 'twp' });
  return cn2tw(s);
}

const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff\\u3000-\\u303f\\uff00-\\uffef';
const isCjk = (ch: string | undefined) => !!ch && new RegExp(`[${CJK}]`).test(ch);

const TERMS: [RegExp, string][] = [
  [/臺/g, '台'],          // OpenCC 的台灣標準用「臺」,媒體與一般書寫慣用「台」
  [/門店/g, '門市'],
  [/芝士/g, '起司'],
  [/順滑/g, '滑順'],
  [/人流/g, '人潮'],
  [/視頻/g, '影片'],
  [/信息/g, '資訊'],
  [/網絡/g, '網路'],
  [/營銷/g, '行銷'],
  [/渠道/g, '通路'],
  [/外賣/g, '外送'],
  [/小程序/g, '小程式'],
  [/積分/g, '點數'],
  [/酸奶/g, '優格'],
  [/西柚/g, '葡萄柚'],
  [/牛油果/g, '酪梨'],
  [/菠蘿/g, '鳳梨'],
  [/獼猴桃/g, '奇異果'],
  [/雪糕/g, '冰淇淋'],
  [/中國內地/g, '中國'],
  [/衝客單價?/g, '拉高客單價'],
];

/** 半形標點:前後任一邊是中文才換,數字裡的逗號(₱15,000)、時間(10:00)不動 */
function punct(s: string): string {
  const map: Record<string, string> = { ',': '，', ':': '：', ';': '；', '!': '！', '?': '？' };
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (map[ch] && (isCjk(s[i - 1]) || isCjk(s[i + 1]) || (s[i + 1] === ' ' && isCjk(s[i + 2])))) {
      out += map[ch];
      if (s[i + 1] === ' ') i++;   // 「,  下一句」的空格一起吃掉
      continue;
    }
    out += ch;
  }
  // 括號:前一個字是中文,或括號裡有中文,就用全形
  return out.replace(/\(([^()]*)\)/g, (m, inner: string, off: number) =>
    isCjk(out[off - 1]) || new RegExp(`[${CJK}]`).test(inner) ? `（${inner}）` : m);
}

/** 中文和英數之間的空格拿掉(台灣多數媒體的寫法),英文詞彼此之間的空格保留 */
function spacing(s: string): string {
  return s.replace(new RegExp(`([${CJK}]) +(?=[A-Za-z0-9#₱$])`, 'g'), '$1').replace(new RegExp(`([A-Za-z0-9%)]) +(?=[${CJK}])`, 'g'), '$1');
}

export function twText(s: string): string;
export function twText(s: string | null | undefined): string | null | undefined;
export function twText(s: string | null | undefined) {
  if (!s) return s;
  let t = toTW(s);
  for (const [re, to] of TERMS) t = t.replace(re, to);
  return spacing(punct(t));
}
