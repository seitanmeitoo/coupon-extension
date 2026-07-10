// Analyse de prix — fonctions PURES sur du texte, unité-testables sans DOM.
// Gère les formats français (« 1 234,56 € », « 59,99€ ») et anglo-saxons
// (« $1,234.56 », « USD 12.99 »).

/** Séparateurs de milliers possibles : espace, espace insécable (fine ou non). */
const AMOUNT = String.raw`\d{1,5}(?:[   .,]\d{3})*(?:[.,]\d{2})?`
const CURRENCY = String.raw`€|EUR|\$|USD|£|GBP`

/** Prix avec devise après (« 59,99 € ») ou avant (« $12.99 »). */
const PRICE_RE = new RegExp(
  String.raw`(?:(${AMOUNT})\s*(?:${CURRENCY}))|(?:(?:${CURRENCY})\s*(${AMOUNT}))`,
  'gi',
)

/**
 * Convertit une chaîne de montant en nombre.
 * Règle : un séparateur suivi d'exactement 2 chiffres en fin de chaîne est la
 * virgule décimale ; tous les autres séparateurs sont des milliers.
 * Retourne `null` si la chaîne n'est pas un montant plausible.
 */
export function normalizeAmount(raw: string): number | null {
  const cleaned = raw.replace(/[   ]/g, '')
  const match = cleaned.match(/^(\d+(?:[.,]\d{3})*)(?:[.,](\d{2}))?$/)
  if (!match) return null
  const integerPart = match[1].replace(/[.,]/g, '')
  const decimalPart = match[2] ?? '00'
  const value = Number(`${integerPart}.${decimalPart}`)
  return Number.isFinite(value) ? value : null
}

/** Extrait tous les montants (avec devise) présents dans un texte. */
export function findPrices(text: string): number[] {
  const prices: number[] = []
  for (const match of text.matchAll(PRICE_RE)) {
    const raw = match[1] ?? match[2]
    if (raw === undefined) continue
    const value = normalizeAmount(raw)
    if (value !== null && value > 0) prices.push(value)
  }
  return prices
}

/** Le contexte (classe, id, texte voisin) évoque-t-il un TOTAL de commande ? */
export function isTotalContext(context: string): boolean {
  return /total|à payer|a payer|montant d[ûu]|sous-total|subtotal|grand total|order total|amount due/i.test(
    context,
  )
}

/** Le texte contient-il un message d'échec de code promo ? (FR + EN) */
export function containsFailureMessage(text: string): boolean {
  return /(?:code|coupon|bon)?\s*(?:promo(?:tionnel)?\s*)?(?:invalide|non valide|expir[ée]|incorrect|inconnu|refus[ée]|introuvable|invalid|not valid|expired|does\s?n[o']t (?:work|exist)|no longer valid|unrecognized)/i.test(
    text,
  )
}

/** Le texte contient-il un message de succès explicite ? (renfort de la baisse de prix) */
export function containsSuccessMessage(text: string): boolean {
  return /(?:code|coupon|réduction|remise|discount)\s*(?:promo\s*)?(?:appliqué[ée]?s?|ajouté[ée]?s?|activé[ée]?s?|applied|added|activated)|économisez|you saved/i.test(
    text,
  )
}
