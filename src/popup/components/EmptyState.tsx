// État vide de la liste de coupons.
import { t } from '../../lib/i18n'

export default function EmptyState({ domain }: { domain: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-3xl" aria-hidden="true">
        🏷️
      </span>
      <p className="text-sm font-medium text-gray-700">{t('emptyTitle')}</p>
      <p className="px-6 text-xs text-gray-500">
        {domain !== null ? t('emptyWithDomain', { domain }) : t('emptyNoDomain')}
      </p>
    </div>
  )
}
