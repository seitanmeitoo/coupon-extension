// Analyse de prix — fonctions PURES sur du texte, unité-testables sans DOM.
// Gère les formats français (« 1 234,56 € », « 59,99€ ») et anglo-saxons
// (« $1,234.56 », « USD 12.99 »).

/** Séparateurs de milliers possibles : espace, espace insécable (fine ou non). */
const AMOUNT = String.raw`\d{1,5}(?:[   .,]\d{3})*(?:[.,]\d{2})?`
/**
 * Symboles monétaires (non alphabétiques) + codes ISO alphabétiques.
 * Les codes alphabétiques exigent des frontières de mots `\b` et sont
 * SENSIBLES À LA CASSE (pas de drapeau `i`) : sinon « eur » à l'intérieur de
 * « meilleur » ou la prose minuscule seraient pris pour une devise.
 */
const CURRENCY = String.raw`€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b`

/** Prix avec devise après (« 59,99 € ») ou avant (« $12.99 »). Pas de drapeau `i`. */
const PRICE_RE = new RegExp(
  String.raw`(?:(${AMOUNT})\s*(?:${CURRENCY}))|(?:(?:${CURRENCY})\s*(${AMOUNT}))`,
  'g',
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

/**
 * Longueur maximale de texte analysée par les détecteurs de message.
 * Ces fonctions sont appelées par le MutationObserver sur le texte de nœuds
 * potentiellement énormes ; borner l'entrée garantit un temps linéaire et évite
 * tout gel de l'onglet sur une page hostile (protection anti-ReDoS).
 */
const MAX_SCAN = 2000

// Mots-clés d'échec, sans préfixe optionnel `\s*` (source du ReDoS quadratique) :
// les termes eux-mêmes sont assez distinctifs pour ancrer la détection.
const FAILURE_RE =
  /invalide|non valide|expir[ée]|incorrect|inconnu|refus[ée]|introuvable|invalid|not valid|expired|no longer valid|unrecognized|does ?n['o]t (?:work|exist)/i

// Succès : un mot-clé suivi d'une action, avec des quantificateurs BORNÉS
// (`\s{0,3}` au lieu de `\s*`) pour éliminer le retour arrière catastrophique.
const SUCCESS_RE =
  /(?:code|coupon|réduction|remise|discount)\s{0,3}(?:promo\s{0,3})?(?:appliqué[ée]?s?|ajouté[ée]?s?|activé[ée]?s?|applied|added|activated)|économisez|you saved/i

/** Le texte contient-il un message d'échec de code promo ? (FR + EN) */
export function containsFailureMessage(text: string): boolean {
  return FAILURE_RE.test(text.slice(0, MAX_SCAN))
}

/** Le texte contient-il un message de succès explicite ? (renfort de la baisse de prix) */
export function containsSuccessMessage(text: string): boolean {
  return SUCCESS_RE.test(text.slice(0, MAX_SCAN))
}
