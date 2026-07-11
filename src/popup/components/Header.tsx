// En-tête du popup : identité de l'extension + domaine actif.
import { t } from '../../lib/i18n'

interface HeaderProps {
  domain: string | null
}

export default function Header({ domain }: HeaderProps) {
  return (
    <header className="bg-indigo-600 px-4 py-3 text-white">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🎟️
        </span>
        <h1 className="text-base font-bold">{t('appTitle')}</h1>
      </div>
      <p className="mt-0.5 text-xs text-indigo-200">
        {domain !== null ? (
          <>
            {t('headerActiveSite')} <span className="font-semibold text-white">{domain}</span>
          </>
        ) : (
          t('headerNoSite')
        )}
      </p>
    </header>
  )
}
