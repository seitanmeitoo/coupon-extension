// Types partagés par le popup, le service worker et le content script.

/**
 * Provenance d'un coupon dans l'architecture hybride à 3 niveaux :
 * - 'community'     → Tier 1 : base open-source (JSON récupéré depuis GitHub)
 * - 'scraped'       → Tier 2 : extraction regex depuis un annuaire public
 * - 'crowdsourced'  → Tier 3 : partagé anonymement par la communauté
 */
export type CouponSource = 'community' | 'scraped' | 'crowdsourced'

export interface Coupon {
  /** Le code à saisir en caisse (ex. « BIENVENUE10 »). */
  code: string
  /** Description lisible (offre, conditions). */
  description?: string
  /** Taux de réussite estimé, entre 0 et 1. */
  successRate?: number
  /** Provenance du coupon (affichée en badge dans le popup). */
  source: CouponSource
  /** Date d'ajout local (epoch ms). */
  addedAt: number
}

/** Réglages utilisateur — vie privée d'abord : tout est désactivé par défaut. */
export interface Settings {
  /** Opt-in au partage communautaire anonyme (Tier 3). Défaut : false. */
  crowdsourceOptIn: boolean
}

/** Compteurs locaux affichés dans le popup (jamais transmis). */
export interface Stats {
  /** Nombre de codes appliqués avec succès. */
  applied: number
  /** Nombre de codes partagés anonymement avec la communauté. */
  shared: number
}

/** Schéma complet de `chrome.storage.local`. */
export interface StorageSchema {
  /** Coupons connus, indexés par domaine normalisé (ex. « boutique.fr »). */
  coupons: Record<string, Coupon[]>
  /** Métadonnées internes (fraîcheur du Tier 1, refroidissement du Tier 2). */
  meta: {
    tier1LastFetch: number
    /** Dernier scraping Tier 2 par domaine (epoch ms) — évite de re-scraper en boucle. */
    tier2LastScrape: Record<string, number>
  }
  settings: Settings
  stats: Stats
}

/** Entrée brute du flux communautaire (format du dépôt GitHub coupon-feed). */
export interface CommunityFeedEntry {
  code: string
  description?: string
  successRate?: number
}

/** Flux communautaire complet : domaine → liste d'entrées. */
export type CommunityFeed = Record<string, CommunityFeedEntry[]>
