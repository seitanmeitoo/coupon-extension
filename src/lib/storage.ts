// Accès typé à `chrome.storage.local` — l'unique source de vérité de l'extension.
// Contrainte MV3 : le service worker peut être tué à tout moment, donc AUCUN état
// ne vit en variable de module ; tout passe par ces helpers.

import type { Coupon, Settings, Stats, StorageSchema } from '../types'

/** Valeurs par défaut du stockage — vie privée d'abord : opt-in désactivé. */
export const STORAGE_DEFAULTS: StorageSchema = {
  coupons: {},
  meta: { tier1LastFetch: 0, tier2LastScrape: {} },
  settings: { crowdsourceOptIn: false },
  stats: { applied: 0, shared: 0 },
}

/** Lit l'intégralité du stockage en appliquant les valeurs par défaut. */
export async function getStorage(): Promise<StorageSchema> {
  const data = await chrome.storage.local.get(STORAGE_DEFAULTS)
  return data as StorageSchema
}

/** Coupons connus pour un domaine normalisé (tableau vide si aucun). */
export async function getCouponsForDomain(domain: string): Promise<Coupon[]> {
  const { coupons } = await getStorage()
  return coupons[domain] ?? []
}

/**
 * Fusionne deux listes de coupons en dédoublonnant par code (insensible à la casse).
 * Fonction PURE (unité-testable) : les entrées existantes gagnent — un code déjà
 * connu n'est pas écrasé par une source moins fiable ; seuls sa description et son
 * taux de réussite sont complétés s'ils manquaient.
 */
export function mergeCoupons(existing: Coupon[], incoming: Coupon[]): Coupon[] {
  const byCode = new Map<string, Coupon>()
  for (const coupon of existing) {
    byCode.set(coupon.code.trim().toUpperCase(), coupon)
  }
  for (const coupon of incoming) {
    const key = coupon.code.trim().toUpperCase()
    const known = byCode.get(key)
    if (known === undefined) {
      byCode.set(key, coupon)
    } else {
      byCode.set(key, {
        ...known,
        description: known.description ?? coupon.description,
        successRate: known.successRate ?? coupon.successRate,
      })
    }
  }
  return [...byCode.values()]
}

/** Ajoute (fusion + dédoublonnage) des coupons pour un domaine et persiste. */
export async function addCouponsForDomain(domain: string, incoming: Coupon[]): Promise<Coupon[]> {
  const { coupons } = await getStorage()
  const merged = mergeCoupons(coupons[domain] ?? [], incoming)
  await chrome.storage.local.set({ coupons: { ...coupons, [domain]: merged } })
  return merged
}

/**
 * Remplace les coupons « community » par le contenu d'un flux Tier 1 fraîchement
 * récupéré, sans toucher aux coupons « scraped » ni « crowdsourced » des mêmes
 * domaines, ni aux domaines absents du flux.
 */
export async function replaceCommunityCoupons(feed: Record<string, Coupon[]>): Promise<void> {
  const { coupons, meta } = await getStorage()
  const next = { ...coupons }
  for (const [domain, fresh] of Object.entries(feed)) {
    const kept = (next[domain] ?? []).filter((coupon) => coupon.source !== 'community')
    next[domain] = mergeCoupons(fresh, kept)
  }
  await chrome.storage.local.set({ coupons: next, meta: { ...meta, tier1LastFetch: Date.now() } })
}

/** Mémorise l'heure du dernier scraping Tier 2 pour un domaine (anti-boucle). */
export async function markTier2Scraped(domain: string): Promise<void> {
  const { meta } = await getStorage()
  await chrome.storage.local.set({
    meta: { ...meta, tier2LastScrape: { ...(meta.tier2LastScrape ?? {}), [domain]: Date.now() } },
  })
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await getStorage()
  return settings
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

export async function getMeta(): Promise<StorageSchema['meta']> {
  const { meta } = await getStorage()
  return meta
}

export async function getStats(): Promise<Stats> {
  const { stats } = await getStorage()
  return stats
}

/** Incrémente un compteur local (jamais transmis à l'extérieur). */
export async function incrementStat(key: keyof Stats): Promise<void> {
  const { stats } = await getStorage()
  await chrome.storage.local.set({ stats: { ...stats, [key]: stats[key] + 1 } })
}
