// Configuration centralisée : toutes les URLs externes sont regroupées ici
// pour être auditables et remplaçables d'un coup d'œil.

/**
 * Tier 1 — Sources JSON open-source (URLs GitHub brutes).
 * Le format attendu est celui du dépôt public `fityanos/coupon-feed` :
 * `{ "domaine.com": [{ "code": "...", "description": "...", "successRate": 0.6 }] }`.
 * Les URLs sont essayées dans l'ordre ; en cas d'échec total, le flux simulé
 * embarqué (`src/mocks/coupons.json`) sert de repli hors-ligne.
 */
export const TIER1_SOURCES: readonly string[] = [
  'https://raw.githubusercontent.com/fityanos/coupon-feed/main/coupons.json',
]

/** Durée de fraîcheur du Tier 1 : au-delà, un re-fetch est tenté à la demande. */
export const TIER1_TTL_MS = 6 * 60 * 60 * 1000 // 6 heures

/**
 * Tier 2 — Annuaire public de coupons à scraper en repli.
 * Le gabarit reçoit le domaine actif et retourne l'URL de la page marchand.
 * (Exemple réel : les pages « discount-codes » d'AlCoupon, indexées par slug.)
 */
export function tier2DirectoryUrl(domain: string): string {
  const slug = domain.split('.')[0]
  return `https://uae.alcoupon.com/en/discount-codes/${encodeURIComponent(slug)}`
}

/** Délai maximal accordé aux fetchs réseau des Tiers 1 et 2. */
export const FETCH_TIMEOUT_MS = 8000

/**
 * Tier 3 — Point d'entrée du backend de crowdsourcing (REST type Supabase).
 * Placeholder volontaire : remplacez-le par votre propre endpoint.
 */
export const CROWDSOURCE_ENDPOINT = 'https://votre-projet.supabase.co/rest/v1/coupon_reports'

/**
 * Mode simulation du Tier 3 : tant que ce drapeau vaut `true`, aucun POST réseau
 * n'est émis — le payload anonyme est simplement journalisé en console.
 * Passez-le à `false` une fois `CROWDSOURCE_ENDPOINT` configuré.
 */
export const MOCK_CROWDSOURCE = true

/** Nombre maximal de codes retenus par extraction Tier 2 (anti-bruit). */
export const TIER2_MAX_CODES = 10
