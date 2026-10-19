// Teams Adaptive Card(經 Power Automate Webhook 貼到頻道)
import { CATEGORY_SHORT, type Env, type IssueBundle, type Item } from './types';
import { md } from './week';

export function pickHighlights(b: IssueBundle): Item[] {
  const byCat: Record<string, Item[]> = {};
  for (const it of b.items) (byCat[it.category] ??= []).push(it);
  const score = (it: Item) => (it.is_lead ? -100 : 0) + it.rank - (b.images[it.id]?.length ? 20 : 0);
  const out: Item[] = [];
  for (const c of ['new_product', 'campaign', 'loyalty']) {
    const list = (byCat[c] ?? []).slice().sort((a, b2) => score(a) - score(b2));
    if (list[0]) out.push(list[0]);
  }
  return out;
}

export function buildCard(b: IssueBundle, origin: string) {
  const { issue } = b;
  const brandName = (id: string) => b.brands.find(x => x.id === id)?.name_zh ?? id;
  const counts = { new_product: 0, campaign: 0, loyalty: 0 } as Record<string, number>;
  for (const it of b.items) counts[it.category]++;
  const active = new Set(b.items.map(i => i.brand_id)).size;
  const hl = pickHighlights(b);
  const weekUrl = `${origin}/w/${issue.week}`;

  const itemBlock = (it: Item) => {
    const img = b.images[it.id]?.[0];
    const src = b.sources[it.id] ?? [];
    const conf = it.confidence === 'verified' ? `${src.length} sources,已佐證` : '1 source,待佐證';
    const text = [
      { type: 'TextBlock', text: `**${brandName(it.brand_id)}** · ${it.market} · ${CATEGORY_SHORT[it.category]}`, size: 'Small', isSubtle: true, wrap: true, spacing: 'None' },
      { type: 'TextBlock', text: it.title, weight: 'Bolder', wrap: true, spacing: 'Small' },
      { type: 'TextBlock', text: it.summary.length > 110 ? it.summary.slice(0, 108) + '…' : it.summary, wrap: true, size: 'Small', spacing: 'Small' },
      { type: 'TextBlock', text: `${md(it.date_start)}${it.date_end ? ' – ' + md(it.date_end) : ''} · ${conf}`, size: 'Small', isSubtle: true, spacing: 'Small' },
    ];
    if (!img) return { type: 'Container', separator: true, spacing: 'Medium', items: text };
    return {
      type: 'ColumnSet', separator: true, spacing: 'Medium',
      columns: [
        { type: 'Column', width: '72px', items: [{ type: 'Image', url: `${origin}/img/${img.kv_key}`, size: 'Medium', style: 'Default', altText: it.title, selectAction: { type: 'Action.OpenUrl', url: `${weekUrl}#${it.id}` } }] },
        { type: 'Column', width: 'stretch', items: text },
      ],
    };
  };

  const quietNames = b.quiet.map(q => q.name_zh).join('、');
  return {
    type: 'AdaptiveCard', version: '1.4', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    msteams: { width: 'Full' },
    body: [
      { type: 'Image', url: `${origin}/banner/${issue.week}.png`, altText: `W${issue.week.slice(-2)} 亞太競品週報`, selectAction: { type: 'Action.OpenUrl', url: weekUrl } },
      { type: 'TextBlock', wrap: true, text: `本週 **${active}** 個品牌有動態:新品 **${counts.new_product}** 則、行銷 **${counts.campaign}** 則、會員 **${counts.loyalty}** 則。` },
      { type: 'TextBlock', wrap: true, size: 'Small', isSubtle: true, spacing: 'None', text: `三則重點,各類別取一;完整 ${b.items.length} 則在網站版。` },
      ...hl.map(itemBlock),
      { type: 'TextBlock', wrap: true, size: 'Small', isSubtle: true, separator: true, spacing: 'Medium', text: `**本週安靜 ${b.quiet.length} 個:**${quietNames || '無'}。` },
    ],
    actions: [
      { type: 'Action.OpenUrl', title: '看完整週報', url: weekUrl },
      { type: 'Action.OpenUrl', title: '報紙版', url: weekUrl },
    ],
  };
}

export async function postToTeams(env: Env, card: unknown) {
  const body = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] };
  const res = await fetch(env.TEAMS_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text().catch(() => '');
  if (!res.ok && res.status !== 202) throw new Error(`Teams webhook ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, body: text.slice(0, 300) };
}
