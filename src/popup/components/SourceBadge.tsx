// Badge de provenance d'un coupon — rend visible l'architecture à 3 niveaux.
import { t, type MessageKey } from '../../lib/i18n'
import type { CouponSource } from '../../types'

const BADGES: Record<CouponSource, { key: MessageKey; classes: string }> = {
  community: { key: 'sourceCommunity', classes: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  scraped: { key: 'sourceScraped', classes: 'bg-amber-100 text-amber-800 ring-amber-200' },
  crowdsourced: {
    key: 'sourceCrowdsourced',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
}

export default function SourceBadge({ source }: { source: CouponSource }) {
  const badge = BADGES[source]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${badge.classes}`}
    >
      {t(badge.key)}
    </span>
  )
}
