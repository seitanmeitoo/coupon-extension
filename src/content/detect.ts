// Détection des champs « code promo » sur les pages de paiement.
// Heuristiques bilingues (français + anglais), testables en jsdom.

/** Sélecteurs rapides : attributs explicites, essayés en premier. */
const FAST_SELECTORS = [
  'input[autocomplete="coupon-code" i]',
  'input[name*="coupon" i]',
  'input[id*="coupon" i]',
  'input[name*="promo" i]',
  'input[id*="promo" i]',
  'input[name*="discount" i]',
  'input[id*="discount" i]',
  'input[name*="voucher" i]',
  'input[id*="reduction" i]',
]

/**
 * Mots-clés pesés pour le scoring des champs texte (FR + EN).
 * Volontairement SANS « carte cadeau » / « gift card » : un numéro de carte
 * cadeau est un secret à valeur monétaire (un identifiant, pas un code promo).
 * Le détecter risquerait de le remplir/partager par erreur — vie privée d'abord.
 */
const KEYWORDS = [
  'code promo',
  'code de réduction',
  'coupon',
  'promo',
  'rabais',
  'réduction',
  'reduction',
  'remise',
  'bon de réduction',
  'discount',
  'voucher',
  'promotion',
]

/** Un input est-il candidat (champ texte libre, ni caché ni désactivé) ? */
function isCandidateInput(input: HTMLInputElement): boolean {
  const type = (input.getAttribute('type') ?? 'text').toLowerCase()
  if (type !== 'text' && type !== 'search') return false
  return !input.disabled && !input.readOnly
}

/** Texte des <label> associés (attribut for= ou label ancêtre). */
function labelText(input: HTMLInputElement): string {
  const labels = input.labels
  if (labels !== null && labels.length > 0) {
    return Array.from(labels)
      .map((label) => label.textContent ?? '')
      .join(' ')
  }
  return input.closest('label')?.textContent ?? ''
}

/** Score d'un champ : nombre de mots-clés retrouvés dans ses attributs descriptifs. */
export function scoreInput(input: HTMLInputElement): number {
  const haystack = [
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute('aria-label') ?? '',
    input.className,
    labelText(input),
  ]
    .join(' ')
    .toLowerCase()

  let score = 0
  for (const keyword of KEYWORDS) {
    if (haystack.includes(keyword)) score += keyword.includes(' ') ? 2 : 1
  }
  return score
}

/**
 * Cherche le champ « code promo » le plus plausible de la page.
 * 1. Sélecteurs rapides (attributs explicites).
 * 2. À défaut, scoring de tous les champs texte de la page.
 */
export function findCouponInput(root: ParentNode = document): HTMLInputElement | null {
  for (const selector of FAST_SELECTORS) {
    const input = root.querySelector<HTMLInputElement>(selector)
    if (input !== null && isCandidateInput(input)) return input
  }

  let best: HTMLInputElement | null = null
  let bestScore = 0
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    if (!isCandidateInput(input)) continue
    const score = scoreInput(input)
    if (score > bestScore) {
      best = input
      bestScore = score
    }
  }
  return best
}

/**
 * Texte d'un bouton évoquant l'application d'un code (FR + EN).
 * Frontières de mots `\b` OBLIGATOIRES : sans elles, « add » matchait « address »
 * et « ok » matchait « book », faisant cliquer des boutons arbitraires. On exclut
 * aussi « ajouter » / « add » (trop proches de « Ajouter au panier » / « add to
 * cart ») : cliquer ces boutons ajouterait des articles au lieu d'appliquer le code.
 */
const APPLY_BUTTON_RE = /\b(?:appliquer|valider|utiliser|activer|ok|apply|submit|redeem|activate)\b/i

/**
 * Cherche le bouton « Appliquer » associé au champ coupon : d'abord dans le
 * même <form>, puis en remontant jusqu'à 4 conteneurs ancêtres.
 */
export function findApplyButton(input: HTMLInputElement): HTMLElement | null {
  const scopes: ParentNode[] = []
  if (input.form !== null) scopes.push(input.form)
  let ancestor: HTMLElement | null = input.parentElement
  for (let depth = 0; ancestor !== null && depth < 4; depth++) {
    scopes.push(ancestor)
    ancestor = ancestor.parentElement
  }

  for (const scope of scopes) {
    const candidates = scope.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="button"], [role="button"]',
    )
    for (const candidate of candidates) {
      const text =
        candidate instanceof HTMLInputElement
          ? candidate.value
          : (candidate.textContent ?? '')
      if (APPLY_BUTTON_RE.test(text.trim())) return candidate
    }
    // Un <form> avec un unique bouton submit : c'est lui, quel que soit son libellé.
    const submits = scope.querySelectorAll<HTMLElement>('button[type="submit"], input[type="submit"]')
    if (submits.length === 1) return submits[0]
  }
  return null
}
