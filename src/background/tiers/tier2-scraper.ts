// Tier 2 — Scraping localisé, en repli quand le Tier 1 ne connaît pas le domaine.
// Récupère la page d'un annuaire public de coupons et en extrait les codes par
// regex (pas de DOMParser dans un service worker MV3 — voir extractor.ts).

import { FETCH_TIMEOUT_MS, TIER2_MAX_CODES, tier2DirectoryUrl } from '../../config'
import type { Coupon } from '../../types'
import { extractCodesFromHtml } from '../extractor'

/** Refroidissement : ne pas re-scraper un domaine plus d'une fois par période. */
export const TIER2_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6 heures

/**
 * Les domaines sans point (localhost, noms de machines) et les adresses IP ne
 * correspondent à aucune boutique répertoriée : inutile d'interroger l'annuaire.
 */
export function isScrapableDomain(domain: string): boolean {
  if (!domain.includes('.')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return false
  return true
}

/**
 * Scrape l'annuaire public pour un domaine et retourne les coupons extraits
 * (souvent vide : l'annuaire ne connaît pas toutes les boutiques).
 * Ne lève jamais : un échec réseau retourne simplement un tableau vide.
 */
export async function scrapeTier2(domain: string): Promise<Coupon[]> {
  if (!isScrapableDomain(domain)) return []
  try {
    const url = tier2DirectoryUrl(domain)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      credentials: 'omit',
    })
    if (!response.ok) return []
    const html = await response.text()
    const codes = extractCodesFromHtml(html, TIER2_MAX_CODES)
    return codes.map(
      (code): Coupon => ({
        code,
        description: `Trouvé sur le web pour ${domain}`,
        source: 'scraped',
        addedAt: Date.now(),
      }),
    )
  } catch (error) {
    console.warn(`[Tier 2] Scraping impossible pour ${domain} :`, error)
    return []
  }
}
