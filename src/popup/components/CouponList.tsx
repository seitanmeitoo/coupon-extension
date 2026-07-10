// Liste des coupons du domaine actif.
import type { Coupon } from '../../types'
import CouponCard from './CouponCard'
import EmptyState from './EmptyState'

interface CouponListProps {
  coupons: Coupon[]
  domain: string | null
  onTest: ((code: string) => void) | null
}

export default function CouponList({ coupons, domain, onTest }: CouponListProps) {
  if (coupons.length === 0) {
    return <EmptyState domain={domain} />
  }
  return (
    <ul className="flex flex-col gap-2">
      {coupons.map((coupon) => (
        <CouponCard key={`${coupon.source}-${coupon.code}`} coupon={coupon} onTest={onTest} />
      ))}
    </ul>
  )
}
