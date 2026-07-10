// Extraction de codes promo depuis du HTML brut — fonction PURE, unité-testable.
// Contrainte MV3 : les service workers n'ont pas de DOM (pas de DOMParser),
// l'extraction se fait donc entièrement par expressions régulières.

/**
 * Un token n'est candidat que s'il apparaît à proximité d'un mot-clé « code /
 * coupon / promo » (contexte), pour éviter de ramasser n'importe quelle
 * constante en majuscules présente dans la page.
 *
 * IMPORTANT : le mot-clé est rendu insensible à la casse par des classes de
 * caractères, MAIS la capture reste strictement `[A-Z0-9]`. On n'utilise donc
 * PAS le drapeau `i` — sinon il rendrait aussi la capture insensible à la casse,
 * et la prose minuscule après « code » (« code livraison offerte ») serait
 * extraite comme un faux code (« LIVRAISON »). Les vrais codes sont en majuscules.
 */
const CONTEXTUAL_CODE_RE =
  /(?:[Cc][Oo][Dd][Ee]|[Cc][Oo][Uu][Pp][Oo][Nn]|[Pp][Rr][Oo][Mm][Oo])[^A-Za-z0-9]{0,40}["'>\s]([A-Z0-9]{4,15})\b/g

/** Tokens techniques fréquents dans le HTML, jamais des codes promo. */
const BLACKLIST = new Set([
  'HTML',
  'HTML5',
  'HTTP',
  'HTTPS',
  'HTTP2',
  'JSON',
  'AJAX',
  'ARIA',
  'CDATA',
  'DOCTYPE',
  'WIDTH',
  'HEIGHT',
  'UTF8',
  'ASCII',
  'FALSE',
  'TRUE',
  'NULL',
  'ADMIN',
  'INDEX',
  'ERROR',
  // Mots français courants rencontrés en capitales dans les pages marchandes.
  'ACCUEIL',
  'PROMO',
  'PROMOS',
  'CODES',
  'COUPON',
  'COUPONS',
  'SOLDES',
  'OFFRE',
  'OFFRES',
  'GRATUIT',
  'BOUTIQUE',
])

/** Retire les blocs <script> et <style>, pleins de constantes trompeuses. */
function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
}

/**
 * Vraisemblance d'un code promo : au moins un chiffre OU une longueur de 5 à 12
 * caractères hors liste noire. Les tokens tout-lettres très courts ou très longs
 * sont presque toujours du bruit (attributs, classes CSS, acronymes).
 */
function looksLikeCoupon(token: string): boolean {
  if (BLACKLIST.has(token)) return false
  if (/\d/.test(token)) return true
  return token.length >= 5 && token.length <= 12
}

/**
 * Extrait au plus `maxCodes` codes plausibles d'une page HTML.
 * Deux passes complémentaires :
 *   1. le texte débarrassé des balises — un « code <strong>SOLDES25</strong> »
 *      redevient « code SOLDES25 », sinon la balise casserait la proximité ;
 *   2. le HTML brut — attrape les codes portés par des attributs
 *      (`data-coupon="XYZ12"`, `class="coupon-code">XYZ12`).
 * Dédoublonne en préservant l'ordre d'apparition (les premiers codes d'une
 * page d'annuaire sont généralement les plus récents).
 */
export function extractCodesFromHtml(html: string, maxCodes = 10): string[] {
  const cleaned = stripScriptsAndStyles(html)
  const textOnly = cleaned.replace(/<[^>]*>/g, ' ')
  const found: string[] = []
  const seen = new Set<string>()

  const collect = (haystack: string): void => {
    for (const match of haystack.matchAll(CONTEXTUAL_CODE_RE)) {
      const token = match[1].toUpperCase()
      if (seen.has(token) || !looksLikeCoupon(token)) continue
      seen.add(token)
      found.push(token)
      if (found.length >= maxCodes) return
    }
  }

  collect(textOnly)
  if (found.length < maxCodes) collect(cleaned)
  return found
}
