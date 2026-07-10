// Onglet « Réglages » — le cœur de la promesse « vie privée d'abord » :
// le partage communautaire est un OPT-IN explicite, désactivé par défaut.
import type { Settings, Stats } from '../../types'
import Toggle from './Toggle'

interface SettingsTabProps {
  settings: Settings
  stats: Stats
  onOptInChange: (optIn: boolean) => void
}

export default function SettingsTab({ settings, stats, onOptInChange }: SettingsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="optin-label" className="text-sm font-semibold text-gray-800">
              Partage communautaire anonyme
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Quand un code que vous avez tapé vous-même fait baisser le prix, il est proposé à la
              communauté — de façon strictement anonyme.
            </p>
          </div>
          <Toggle
            checked={settings.crowdsourceOptIn}
            onChange={onOptInChange}
            labelledBy="optin-label"
          />
        </div>
        <p
          className={`mt-2 text-xs font-medium ${
            settings.crowdsourceOptIn ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          {settings.crowdsourceOptIn ? 'Partage activé — merci pour la communauté !' : 'Partage désactivé (par défaut).'}
        </p>
      </section>

      <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          🔒 Vie privée
        </h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-indigo-900">
          <li>
            Seuls trois champs sont transmis : <code className="font-mono">domaine</code>,{' '}
            <code className="font-mono">code</code>, <code className="font-mono">succès</code>.
          </li>
          <li>Jamais d'identifiant, de cookie, d'historique ni d'adresse e-mail.</li>
          <li>Rien n'est envoyé tant que ce réglage est désactivé.</li>
          <li>Vos statistiques ci-dessous restent sur votre appareil.</li>
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-bold text-gray-900">{stats.applied}</p>
          <p className="text-[11px] text-gray-500">codes appliqués avec succès</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-bold text-gray-900">{stats.shared}</p>
          <p className="text-[11px] text-gray-500">codes partagés anonymement</p>
        </div>
      </section>
    </div>
  )
}
