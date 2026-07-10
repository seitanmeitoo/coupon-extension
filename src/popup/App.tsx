// Composant racine du popup : onglets « Coupons » / « Réglages ».
import { useCallback, useEffect, useState } from 'react'
import { domainFromUrl } from '../lib/domain'
import { sendToBackground, sendToTab } from '../lib/messaging'
import { getSettings, getStats, setSettings as persistSettings } from '../lib/storage'
import type { Coupon, Settings, Stats } from '../types'
import CouponList from './components/CouponList'
import Header from './components/Header'
import SettingsTab from './components/SettingsTab'

type Tab = 'coupons' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('coupons')
  const [domain, setDomain] = useState<string | null>(null)
  const [tabId, setTabId] = useState<number | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [settings, setSettings] = useState<Settings>({ crowdsourceOptIn: false })
  const [stats, setStats] = useState<Stats>({ applied: 0, shared: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  /** Charge domaine actif, coupons, réglages et statistiques. */
  const loadEverything = useCallback(async (): Promise<void> => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const activeDomain = activeTab?.url !== undefined ? domainFromUrl(activeTab.url) : null
    setDomain(activeDomain)
    setTabId(activeTab?.id ?? null)

    const [loadedSettings, loadedStats] = await Promise.all([getSettings(), getStats()])
    setSettings(loadedSettings)
    setStats(loadedStats)

    if (activeDomain !== null) {
      const { coupons: found } = await sendToBackground({
        type: 'GET_COUPONS',
        domain: activeDomain,
      })
      setCoupons(found)
    }
  }, [])

  useEffect(() => {
    loadEverything()
      .catch((error) => {
        console.error('[Popup] Chargement impossible :', error)
        setNotice('Impossible de contacter le service worker de l’extension.')
      })
      .finally(() => setLoading(false))
  }, [loadEverything])

  /** Bouton « Actualiser » : force le rafraîchissement du flux Tier 1. */
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    setNotice(null)
    try {
      const result = await sendToBackground({ type: 'REFRESH_TIER1' })
      await loadEverything()
      setNotice(
        result.ok
          ? `Base communautaire actualisée (${result.domains} boutiques couvertes).`
          : 'Actualisation partielle : le flux distant est resté injoignable.',
      )
    } catch {
      setNotice('Actualisation impossible pour le moment.')
    } finally {
      setRefreshing(false)
    }
  }

  /** Bouton « Tester ce code » : délègue l'essai au content script de l'onglet. */
  const testCode = async (code: string): Promise<void> => {
    if (tabId === null) return
    setNotice(null)
    try {
      const response = await sendToTab(tabId, { type: 'APPLY_CODE', code })
      setNotice(
        response.started
          ? `Essai du code « ${code} » lancé sur la page…`
          : 'Aucun champ « code promo » détecté sur cette page.',
      )
    } catch {
      setNotice('Cette page ne permet pas l’essai automatique (rechargez-la et réessayez).')
    }
  }

  /** Toggle d'opt-in : persiste immédiatement — vie privée d'abord. */
  const changeOptIn = (crowdsourceOptIn: boolean): void => {
    const next: Settings = { ...settings, crowdsourceOptIn }
    setSettings(next)
    void persistSettings(next)
  }

  return (
    <div className="flex min-h-[420px] flex-col bg-gray-50 text-gray-900">
      <Header domain={domain} />

      <nav className="flex border-b border-gray-200 bg-white text-sm font-medium">
        {(
          [
            ['coupons', 'Coupons'],
            ['settings', 'Réglages'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 px-4 py-2.5 transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-3">
        {notice !== null && (
          <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">{notice}</p>
        )}

        {tab === 'coupons' ? (
          loading ? (
            <p className="py-10 text-center text-sm text-gray-500">Recherche de coupons…</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {coupons.length > 0
                    ? `${coupons.length} code(s) pour ce site`
                    : 'Rien en stock pour ce site'}
                </p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  {refreshing ? 'Actualisation…' : '↻ Actualiser'}
                </button>
              </div>
              <CouponList
                coupons={coupons}
                domain={domain}
                onTest={tabId !== null && domain !== null ? (code) => void testCode(code) : null}
              />
            </>
          )
        ) : (
          <SettingsTab settings={settings} stats={stats} onOptInChange={changeOptIn} />
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white px-4 py-2 text-center text-[10px] text-gray-400">
        Vie privée d'abord : aucun identifiant ne quitte votre navigateur.
      </footer>
    </div>
  )
}
