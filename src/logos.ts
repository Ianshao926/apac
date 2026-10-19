// 品牌 logo(256px 方形 PNG),和 wrangler.jsonc 的 Data 規則一起打包進 Worker。新增 logo:放進 assets/logos,再補這裡兩處。
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import chagee from '../assets/logos/chagee.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import chatramue from '../assets/logos/chatramue.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import chunshuitang from '../assets/logos/chunshuitang.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import heytea from '../assets/logos/heytea.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import katinat from '../assets/logos/katinat.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import kebuke from '../assets/logos/kebuke.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import macao from '../assets/logos/macao.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import mollytea from '../assets/logos/mollytea.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import nayuki from '../assets/logos/nayuki.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import phuclong from '../assets/logos/phuclong.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import tealive from '../assets/logos/tealive.png';
// @ts-ignore .png 由 wrangler rules 以 Data(ArrayBuffer)匯入
import zus from '../assets/logos/zus.png';

export const LOGOS: Record<string, ArrayBuffer> = {
  'chagee': chagee,
  'chatramue': chatramue,
  'chunshuitang': chunshuitang,
  'heytea': heytea,
  'katinat': katinat,
  'kebuke': kebuke,
  'macao': macao,
  'mollytea': mollytea,
  'nayuki': nayuki,
  'phuclong': phuclong,
  'tealive': tealive,
  'zus': zus,
};
