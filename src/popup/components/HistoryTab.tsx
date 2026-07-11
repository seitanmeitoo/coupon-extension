// Onglet « Historique » : les codes appliqués localement (jamais transmis).
import { t } from '../../lib/i18n'
import type { HistoryEntry } from '../../types'

function formatAmount(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function HistoryTab({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="py-10 text-center">
        <span className="text-3xl" aria-hidden="true">
          🕓
        </span>
        <p className="mt-2 text-sm text-gray-500">{t('historyEmpty')}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.map((entry, index) => (
        <li
          key={`${entry.at}-${index}`}
          className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
        >
          <div className="min-w-0">
            <code className="rounded bg-gray-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
              {entry.code}
            </code>
            <p className="mt-1 truncate text-[11px] text-gray-500">
              {t('historySavedOn', { domain: entry.domain })}
            </p>
          </div>
          {typeof entry.saved === 'number' && entry.saved > 0 && (
            <span className="shrink-0 text-sm font-semibold text-emerald-600">
              {t('historySavedAmount', { amount: formatAmount(entry.saved) })}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
