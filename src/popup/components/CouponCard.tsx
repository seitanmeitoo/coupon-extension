// Carte d'un coupon : code, description, taux de réussite, provenance, actions.
import { useState } from 'react'
import { t } from '../../lib/i18n'
import type { Coupon } from '../../types'
import SourceBadge from './SourceBadge'

interface CouponCardProps {
  coupon: Coupon
  /** Lance l'essai du code sur l'onglet actif ; absent si la page ne s'y prête pas. */
  onTest: ((code: string) => void) | null
}

export default function CouponCard({ coupon, onTest }: CouponCardProps) {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(coupon.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Presse-papiers indisponible : sélection manuelle toujours possible.
    }
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <code className="rounded-lg bg-gray-900 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-white">
          {coupon.code}
        </code>
        {coupon.successRate !== undefined && (
          <span className="shrink-0 text-xs font-medium text-gray-500">
            {t('successRate', { percent: Math.round(coupon.successRate * 100) })}
          </span>
        )}
      </div>

      {coupon.description !== undefined && (
        <p className="mt-2 text-xs text-gray-600">{coupon.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <SourceBadge source={coupon.source} />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {copied ? t('copied') : t('copy')}
          </button>
          {onTest !== null && (
            <button
              type="button"
              onClick={() => onTest(coupon.code)}
              className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
            >
              {t('testCode')}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
