// Accès typé à `chrome.storage.local` — l'unique source de vérité de l'extension.
// Contrainte MV3 : le service worker peut être tué à tout moment, donc AUCUN état
// ne vit en variable de module ; tout passe par ces helpers.

import { TIER1_TTL_MS } from '../config'
import { CURRENT_SCHEMA_VERSION, type Coupon, type HistoryEntry, type Settings, type Stats, type StorageSchema } from '../types'

/** Taille maximale de l'historique local (récent en tête). */
export const HISTORY_MAX = 50

/** Nombre maximal de coupons conservés par domaine (purge LRU par ancienneté). */
export const MAX_COUPONS_PER_DOMAIN = 30

/** Valeurs par défaut du stockage — vie privée d'abord : opt-in désactivé. */
export const STORAGE_DEFAULTS: StorageSchema = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  coupons: {},
  meta: { tier1LastFetch: 0, tier2LastScrape: {} },
  settings: { crowdsourceOptIn: false },
  stats: { applied: 0, shared: 0, savedTotal: 0 },
  history: [],
}

/** Lit l'intégralité du stockage en appliquant les valeurs par défaut. */
export async function getStorage(): Promise<StorageSchema> {
  const data = await chrome.storage.local.get(STORAGE_DEFAULTS)
  return data as StorageSchema
}

/**
 * Sérialise les écritures lecture-modification-écriture. Sans cela, deux messages
 * concurrents (ex. le content script et le popup demandant les coupons en même
 * temps) liraient tous deux l'objet `coupons`/`stats` complet, le modifieraient
 * puis le ré-écriraient — la dernière écriture écrasant l'autre. La chaîne de
 * promesses garantit un ordre au sein du cycle de vie du service worker.
 */
let writeLock: Promise<unknown> = Promise.resolve()

function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeLock.then(task, task)
  // La chaîne survit aux échecs individuels (on avale l'erreur pour le verrou,
  // mais l'appelant reçoit bien la promesse rejetée d'origine).
  writeLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Fenêtre de re-tentative courte quand le Tier 1 retombe sur le flux embarqué. */
const TIER1_FALLBACK_RETRY_MS = 15 * 60 * 1000 // 15 minutes

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
export function addCouponsForDomain(domain: string, incoming: Coupon[]): Promise<Coupon[]> {
  return withWriteLock(async () => {
    const { coupons } = await getStorage()
    const merged = mergeCoupons(coupons[domain] ?? [], incoming)
    await chrome.storage.local.set({ coupons: { ...coupons, [domain]: merged } })
    return merged
  })
}

/**
 * Remplace les coupons « community » par le contenu d'un flux Tier 1 fraîchement
 * récupéré, sans toucher aux coupons « scraped » ni « crowdsourced » des mêmes
 * domaines, ni aux domaines absents du flux.
 *
 * `fromNetwork` : sur un vrai chargement réseau, la fraîcheur est complète ; sur
 * un repli hors-ligne (flux embarqué), on antidate l'horodatage pour re-tenter
 * dans ~15 min plutôt que d'attendre le TTL complet.
 */
export function replaceCommunityCoupons(
  feed: Record<string, Coupon[]>,
  options: { fromNetwork?: boolean } = {},
): Promise<void> {
  const fromNetwork = options.fromNetwork ?? true
  return withWriteLock(async () => {
    const { coupons, meta } = await getStorage()
    const next = { ...coupons }
    for (const [domain, fresh] of Object.entries(feed)) {
      const kept = (next[domain] ?? []).filter((coupon) => coupon.source !== 'community')
      next[domain] = mergeCoupons(fresh, kept)
    }
    const tier1LastFetch = fromNetwork
      ? Date.now()
      : Date.now() - TIER1_TTL_MS + TIER1_FALLBACK_RETRY_MS
    await chrome.storage.local.set({ coupons: next, meta: { ...meta, tier1LastFetch } })
  })
}

/** Mémorise l'heure du dernier scraping Tier 2 pour un domaine (anti-boucle). */
export function markTier2Scraped(domain: string): Promise<void> {
  return withWriteLock(async () => {
    const { meta } = await getStorage()
    await chrome.storage.local.set({
      meta: { ...meta, tier2LastScrape: { ...(meta.tier2LastScrape ?? {}), [domain]: Date.now() } },
    })
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

/** Incrémente un compteur entier local (jamais transmis à l'extérieur). */
export function incrementStat(key: 'applied' | 'shared'): Promise<void> {
  return withWriteLock(async () => {
    const { stats } = await getStorage()
    await chrome.storage.local.set({ stats: { ...stats, [key]: stats[key] + 1 } })
  })
}

/** Ajoute un montant au total économisé cumulé (local uniquement). */
export function addSavings(amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return Promise.resolve()
  return withWriteLock(async () => {
    const { stats } = await getStorage()
    await chrome.storage.local.set({
      stats: { ...stats, savedTotal: Math.round((stats.savedTotal + amount) * 100) / 100 },
    })
  })
}

/** Lit l'historique local des codes appliqués (récent en tête). */
export async function getHistory(): Promise<HistoryEntry[]> {
  const { history } = await getStorage()
  return history
}

/** Ajoute une entrée d'historique en tête et borne la liste à HISTORY_MAX. */
export function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  return withWriteLock(async () => {
    const { history } = await getStorage()
    const next = [entry, ...history].slice(0, HISTORY_MAX)
    await chrome.storage.local.set({ history: next })
  })
}

/**
 * Retire les coupons périmés (`expiresAt` dépassé) et borne chaque domaine à
 * MAX_COUPONS_PER_DOMAIN (LRU : on garde les plus récemment ajoutés).
 * Retourne le nombre total de coupons supprimés. Fonction PURE d'aide testable
 * séparée (`pruneCoupons`) pour la logique de tri/filtre.
 */
export function purgeExpiredCoupons(now = Date.now()): Promise<number> {
  return withWriteLock(async () => {
    const { coupons } = await getStorage()
    let removed = 0
    const next: Record<string, Coupon[]> = {}
    for (const [domain, list] of Object.entries(coupons)) {
      const pruned = pruneCoupons(list, now)
      removed += list.length - pruned.length
      if (pruned.length > 0) next[domain] = pruned
    }
    if (removed > 0) await chrome.storage.local.set({ coupons: next })
    return removed
  })
}

/**
 * Filtre PUR (testable) : retire les coupons périmés puis borne la liste aux
 * MAX_COUPONS_PER_DOMAIN plus récents (par `addedAt` décroissant).
 */
export function pruneCoupons(list: Coupon[], now = Date.now()): Coupon[] {
  const alive = list.filter((c) => c.expiresAt === undefined || c.expiresAt > now)
  if (alive.length <= MAX_COUPONS_PER_DOMAIN) return alive
  return [...alive].sort((a, b) => b.addedAt - a.addedAt).slice(0, MAX_COUPONS_PER_DOMAIN)
}
