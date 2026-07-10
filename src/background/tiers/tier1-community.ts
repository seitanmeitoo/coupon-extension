// Tier 1 — Base de données open-source.
// Récupère un flux JSON de coupons depuis des URLs GitHub brutes (format du
// dépôt public `fityanos/coupon-feed`) et le persiste dans chrome.storage.local.
// En cas d'échec réseau total, le flux simulé embarqué sert de repli, ce qui
// garantit une extension fonctionnelle hors-ligne dès l'installation.

import { FETCH_TIMEOUT_MS, TIER1_SOURCES, TIER1_TTL_MS } from '../../config'
import bundledFeed from '../../mocks/coupons.json'
import type { CommunityFeed, Coupon } from '../../types'
import { normalizeDomain } from '../../lib/domain'
import { getMeta, replaceCommunityCoupons } from '../../lib/storage'

/** Convertit un flux communautaire brut en coupons typés, indexés par domaine normalisé. */
export function feedToCoupons(feed: CommunityFeed): Record<string, Coupon[]> {
  const result: Record<string, Coupon[]> = {}
  for (const [rawDomain, entries] of Object.entries(feed)) {
    if (!Array.isArray(entries)) continue
    const domain = normalizeDomain(rawDomain)
    const coupons = entries
      .filter((entry) => typeof entry?.code === 'string' && entry.code.trim().length > 0)
      .map(
        (entry): Coupon => ({
          code: entry.code.trim().toUpperCase(),
          description: typeof entry.description === 'string' ? entry.description : undefined,
          successRate: typeof entry.successRate === 'number' ? entry.successRate : undefined,
          source: 'community',
          addedAt: Date.now(),
        }),
      )
    if (coupons.length > 0) {
      result[domain] = [...(result[domain] ?? []), ...coupons]
    }
  }
  return result
}

/** Tente une source distante ; lève en cas d'échec HTTP, de timeout ou de JSON invalide. */
async function fetchFeed(url: string): Promise<CommunityFeed> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    credentials: 'omit',
  })
  if (!response.ok) {
    throw new Error(`Réponse HTTP ${response.status} pour ${url}`)
  }
  return (await response.json()) as CommunityFeed
}

/** Résultat d'un rafraîchissement Tier 1. */
export interface RefreshResult {
  /** Nombre de domaines couverts après rafraîchissement. */
  domains: number
  /** `true` si le flux a réellement été chargé depuis le réseau (et non le repli). */
  remote: boolean
}

/**
 * Rafraîchit le Tier 1 : essaie chaque source dans l'ordre, persiste la première
 * qui répond ; à défaut, retombe sur le flux embarqué.
 *
 * `remote` distingue un vrai chargement réseau d'un repli hors-ligne : sur repli,
 * la fraîcheur n'est PAS marquée comme complète (re-tentative rapide via un TTL
 * court), et le popup peut afficher un message honnête au lieu de « à jour ».
 */
export async function refreshTier1(): Promise<RefreshResult> {
  for (const url of TIER1_SOURCES) {
    try {
      const feed = await fetchFeed(url)
      const coupons = feedToCoupons(feed)
      if (Object.keys(coupons).length === 0) continue
      // Le flux embarqué complète le flux distant : les domaines de démonstration
      // (dont « localhost ») restent couverts même quand le distant répond.
      const seeded = feedToCoupons(bundledFeed as CommunityFeed)
      for (const [domain, list] of Object.entries(seeded)) {
        coupons[domain] = [...(coupons[domain] ?? []), ...list]
      }
      await replaceCommunityCoupons(coupons, { fromNetwork: true })
      console.info(`[Tier 1] Flux communautaire chargé depuis ${url}`)
      return { domains: Object.keys(coupons).length, remote: true }
    } catch (error) {
      console.warn(`[Tier 1] Échec de la source ${url} :`, error)
    }
  }
  // Repli hors-ligne : le flux simulé embarqué dans l'extension.
  const fallback = feedToCoupons(bundledFeed as CommunityFeed)
  await replaceCommunityCoupons(fallback, { fromNetwork: false })
  console.info('[Tier 1] Repli sur le flux embarqué (réseau indisponible).')
  return { domains: Object.keys(fallback).length, remote: false }
}

/** Rafraîchit le Tier 1 seulement si les données sont plus vieilles que le TTL. */
export async function ensureTier1Fresh(): Promise<void> {
  const meta = await getMeta()
  if (Date.now() - meta.tier1LastFetch < TIER1_TTL_MS) return
  await refreshTier1()
}
