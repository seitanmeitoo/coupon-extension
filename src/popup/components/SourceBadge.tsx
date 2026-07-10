// Badge de provenance d'un coupon — rend visible l'architecture à 3 niveaux.
import type { CouponSource } from '../../types'

const BADGES: Record<CouponSource, { label: string; classes: string }> = {
  community: {
    label: 'Source : Base communautaire',
    classes: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  },
  scraped: {
    label: 'Source : Web scrapé',
    classes: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  crowdsourced: {
    label: 'Source : Crowdsourcé',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
}

export default function SourceBadge({ source }: { source: CouponSource }) {
  const badge = BADGES[source]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${badge.classes}`}
    >
      {badge.label}
    </span>
  )
}
