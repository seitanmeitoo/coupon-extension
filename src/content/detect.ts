// Détection des champs « code promo » sur les pages de paiement.
// Cascade : sélecteur spécifique au domaine → sélecteur de plateforme →
// heuristiques bilingues (français + anglais). Testable en jsdom.

import { selectorsForDomain, selectorsForPlatform, type DomainSelector } from './selectors'

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

/** Résout le premier champ candidat d'un sélecteur CSS (ou null). */
function firstCandidate(root: ParentNode, selector: string | undefined): HTMLInputElement | null {
  if (selector === undefined) return null
  for (const input of root.querySelectorAll<HTMLInputElement>(selector)) {
    if (isCandidateInput(input)) return input
  }
  return null
}

/**
 * Cherche le champ « code promo » le plus plausible de la page, en cascade :
 * 1. Sélecteur SPÉCIFIQUE au domaine (le plus fiable).
 * 2. Sélecteur de la PLATEFORME détectée (Shopify, WooCommerce…).
 * 3. Sélecteurs rapides génériques (attributs explicites).
 * 4. Scoring de tous les champs texte de la page.
 */
export function findCouponInput(root: ParentNode = document, domain?: string): HTMLInputElement | null {
  const domainSel = domain !== undefined ? selectorsForDomain(domain) : null
  const fromDomain = firstCandidate(root, domainSel?.field)
  if (fromDomain !== null) return fromDomain

  const platformSel = selectorsForPlatform(root)
  const fromPlatform = firstCandidate(root, platformSel?.field)
  if (fromPlatform !== null) return fromPlatform

  for (const selector of FAST_SELECTORS) {
    const input = firstCandidate(root, selector)
    if (input !== null) return input
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
 * Le bouton est-il à PROXIMITÉ du champ coupon ? On remonte jusqu'à 6 ancêtres
 * du champ (sans jamais utiliser le <form>, souvent global sur les caisses) : le
 * bouton doit être contenu dans l'un d'eux. Garde-fou contre un sélecteur de
 * bouton trop large qui viserait un submit d'en-tête ou de commande ailleurs.
 */
function isNearInput(input: HTMLInputElement, button: HTMLElement): boolean {
  const doc = input.ownerDocument
  let ancestor: HTMLElement | null = input.parentElement
  for (let depth = 0; ancestor !== null && depth < 6; depth++) {
    // On ne remonte jamais jusqu'à <body>/<html> : ils contiennent toute la page
    // et rendraient la garde inutile.
    if (ancestor === doc.body || ancestor === doc.documentElement) break
    if (ancestor.contains(button)) return true
    ancestor = ancestor.parentElement
  }
  return false
}

/**
 * Bouton d'application désigné par le sélecteur domaine/plateforme, s'il existe
 * ET s'il est proche du champ. Un bouton résolu au niveau document mais éloigné
 * du champ est rejeté (on retombe alors sur l'heuristique bornée).
 */
function targetedApplyButton(input: HTMLInputElement, domain?: string): HTMLElement | null {
  const doc = input.ownerDocument
  const sels: (DomainSelector | null)[] = [
    domain !== undefined ? selectorsForDomain(domain) : null,
    selectorsForPlatform(doc),
  ]
  for (const sel of sels) {
    if (sel?.button === undefined) continue
    for (const button of doc.querySelectorAll<HTMLElement>(sel.button)) {
      if (isNearInput(input, button)) return button
    }
  }
  return null
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
 * Cherche le bouton « Appliquer » associé au champ coupon.
 * Priorité au bouton désigné par le sélecteur domaine/plateforme ; à défaut,
 * recherche dans le même <form> puis en remontant jusqu'à 4 conteneurs ancêtres.
 */
export function findApplyButton(input: HTMLInputElement, domain?: string): HTMLElement | null {
  const targeted = targetedApplyButton(input, domain)
  if (targeted !== null) return targeted

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
