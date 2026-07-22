// Content script — orchestration sur la page marchande :
//   1. déclare son domaine au service worker et récupère les coupons connus ;
//   2. détecte le champ « code promo » (y compris chargé tardivement en SPA) ;
//   3. essaie automatiquement les codes et observe le DOM pour trancher ;
//   4. repère les codes tapés MANUELLEMENT qui fonctionnent et les remonte
//      au worker (Tier 3 — crowdsourcing anonyme, soumis à l'opt-in).

import { normalizeDomain } from '../lib/domain'
import { sendToBackground, type ContentCommand } from '../lib/messaging'
import type { Coupon } from '../types'
import { applyCode, clearInput, isProgrammaticInjection } from './applier'
import { findApplyButton, findCouponInput } from './detect'
import { startOutcomeWatch, type OutcomeWatch } from './observer'

const domain = normalizeDomain(location.hostname)

/** État local de la page (le content script vit avec elle, contrairement au worker). */
const state = {
  input: null as HTMLInputElement | null,
  autoTried: false,
  /** La valeur actuelle du champ a-t-elle été tapée par l'utilisateur ? */
  manuallyTyped: false,
  /** Codes déjà remontés au worker sur cette page (anti-doublon). */
  reportedCodes: new Set<string>(),
  /** Surveillance en cours d'un code tapé manuellement (avec le code armé). */
  manualWatch: null as { code: string; watch: OutcomeWatch } | null,
}

/**
 * Retourne le champ coupon vivant. Après un re-rendu SPA, `state.input` peut
 * pointer un nœud détaché (isConnected === false) : on re-détecte alors et on
 * ré-attache les écouteurs (dédoublonnés par `wired`).
 */
function liveInput(): HTMLInputElement | null {
  if (state.input !== null && state.input.isConnected) return state.input
  const fresh = findCouponInput(document, domain)
  if (fresh !== null) {
    state.input = fresh
    attachManualListeners(fresh)
  } else {
    state.input = null
  }
  return state.input
}

/* ------------------------------------------------------------------ */
/* Petit toast en français, sans dépendance                            */
/* ------------------------------------------------------------------ */

/** Formate un montant économisé (devise inconnue côté page → format neutre FR). */
function formatAmount(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function showToast(message: string): void {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'max-width:320px',
    'padding:12px 16px',
    'border-radius:10px',
    'background:#312e81',
    'color:#fff',
    'font:14px/1.4 system-ui,sans-serif',
    'box-shadow:0 6px 24px rgba(0,0,0,.25)',
  ].join(';')
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 5000)
}

/* ------------------------------------------------------------------ */
/* Application automatique des codes connus                            */
/* ------------------------------------------------------------------ */

/** Ordonne les coupons du plus prometteur au moins prometteur. */
function byPromise(a: Coupon, b: Coupon): number {
  return (b.successRate ?? 0.4) - (a.successRate ?? 0.4)
}

async function tryCodesAutomatically(coupons: Coupon[]): Promise<void> {
  const input = state.input
  if (input === null || coupons.length === 0 || state.autoTried) return
  state.autoTried = true

  const button = findApplyButton(input, domain)
  for (const coupon of [...coupons].sort(byPromise)) {
    // L'observation démarre AVANT le clic : les pages qui recalculent leur
    // total de façon synchrone seraient sinon jugées « sans verdict ».
    const watch = startOutcomeWatch()
    applyCode(input, button, coupon.code)
    state.manuallyTyped = false // la valeur en place vient de nous, pas de l'utilisateur
    const { outcome, saved } = await watch.result

    if (outcome === 'success') {
      state.reportedCodes.add(coupon.code)
      void sendToBackground({
        type: 'REPORT_RESULT',
        domain,
        code: coupon.code,
        success: true,
        manual: false,
        saved: saved ?? undefined,
      })
      showToast(
        saved !== null
          ? `✓ Code « ${coupon.code} » appliqué — le prix a baissé de ${formatAmount(saved)} !`
          : `✓ Code « ${coupon.code} » appliqué — le prix a baissé !`,
      )
      return
    }
  }

  // Aucun code retenu : on rend le champ propre plutôt que d'y laisser un échec.
  applyCleanup(input)
  showToast('Aucun des codes connus n’a fonctionné sur cette page.')
}

/** Vide le champ de façon programmatique, SANS soumettre (voir clearInput). */
function applyCleanup(input: HTMLInputElement): void {
  clearInput(input)
  state.manuallyTyped = false
}

/* ------------------------------------------------------------------ */
/* Détection des saisies manuelles → Tier 3                            */
/* ------------------------------------------------------------------ */

/**
 * Arme une fenêtre d'observation après un geste de soumission de l'utilisateur.
 * Si le prix baisse (ou qu'un message de succès apparaît), le code TAPÉ À LA
 * MAIN est remonté au worker, qui ne le partagera que si l'opt-in est actif.
 *
 * Un nouveau geste avec un code DIFFÉRENT annule la surveillance précédente et
 * la remplace : sans cela, l'utilisateur qui essaie « FAUX » puis « BON » dans
 * la même fenêtre verrait la baisse de prix attribuée au mauvais code.
 */
function armManualWatch(code: string): void {
  if (state.reportedCodes.has(code)) return
  if (state.manualWatch !== null) {
    if (state.manualWatch.code === code) return // déjà armé pour ce code
    state.manualWatch.watch.cancel() // code différent : on abandonne l'ancienne surveillance
  }
  // Appelé en phase de CAPTURE du clic : la photographie des prix est prise
  // avant que la page ne réagisse et ne recalcule son total.
  const watch = startOutcomeWatch({ windowMs: 15000 })
  state.manualWatch = { code, watch }

  void watch.result.then(async ({ outcome, saved }) => {
    // Une surveillance annulée (remplacée) résout en 'timeout' : on l'ignore.
    if (state.manualWatch?.watch !== watch) return
    state.manualWatch = null
    if (outcome !== 'success' || state.reportedCodes.has(code)) return
    // Garde-fou : le champ contient-il toujours le code armé au moment du
    // verdict ? Évite d'attribuer une baisse de prix à un code déjà remplacé.
    const current = liveInput()?.value.trim().toUpperCase()
    if (current !== undefined && current !== '' && current !== code) return
    state.reportedCodes.add(code)
    const response = await sendToBackground({
      type: 'REPORT_RESULT',
      domain,
      code,
      success: true,
      manual: true,
      saved: saved ?? undefined,
    })
    if (response?.shared && response.simulated) {
      // Mode démonstration : le pipeline Tier 3 a tourné mais rien n'a été envoyé.
      showToast(`✓ Code « ${code} » vérifié — envoi communautaire simulé (mode démonstration).`)
    } else if (response?.shared) {
      showToast(`✓ Code « ${code} » vérifié et partagé anonymement avec la communauté. Merci !`)
    } else {
      showToast(`✓ Code « ${code} » vérifié — il fonctionne sur cette boutique.`)
    }
  })
}

/** Bouton « Appliquer » et conteneur du champ coupon, pour délimiter les gestes. */
let applyButtonRef: HTMLElement | null = null
let couponScope: HTMLElement | null = null

/**
 * Le geste vise-t-il réellement la zone coupon ? Sans cette borne, un clic
 * n'importe où (ex. « Supprimer » un article, qui fait AUSSI baisser le total)
 * armerait la surveillance et attribuerait la baisse à un code jamais soumis.
 */
function withinCouponScope(event: Event): boolean {
  const path = event.composedPath()
  if (state.input !== null && path.includes(state.input)) return true
  if (applyButtonRef !== null && path.includes(applyButtonRef)) return true
  if (couponScope !== null && path.includes(couponScope)) return true
  return false
}

/** Geste de soumission détecté (clic ou Entrée) — uniquement s'il est humain et ciblé. */
function onSubmitGesture(event: Event): void {
  if (!event.isTrusted || isProgrammaticInjection()) return
  if (!withinCouponScope(event)) return
  const input = liveInput()
  if (input === null || !state.manuallyTyped) return
  const code = input.value.trim().toUpperCase()
  if (code.length >= 3) armManualWatch(code)
}

/** Éléments déjà munis de leurs écouteurs (évite les doublons après re-détection). */
const wired = new WeakSet<HTMLInputElement>()

function attachManualListeners(input: HTMLInputElement): void {
  applyButtonRef = findApplyButton(input, domain)
  // Conteneur coupon (jamais le <form> entier, souvent global) pour borner les clics.
  couponScope =
    input.closest<HTMLElement>(
      '[id*="coupon" i], [class*="coupon" i], [id*="promo" i], [class*="promo" i], fieldset',
    ) ?? input.parentElement

  if (wired.has(input)) return
  wired.add(input)

  // Saisie : seul un événement `isTrusted` hors injection marque une frappe humaine.
  input.addEventListener('input', (event) => {
    state.manuallyTyped = event.isTrusted && !isProgrammaticInjection()
  })

  // Soumission : Entrée dans le champ.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onSubmitGesture(event)
  })
}

// Un unique écouteur de clic au niveau document, en phase de CAPTURE : la
// photographie des prix est prise AVANT que la page ne recalcule son total.
// `withinCouponScope` filtre pour ne réagir qu'aux clics de la zone coupon.
document.addEventListener('click', onSubmitGesture, { capture: true })

/* ------------------------------------------------------------------ */
/* Commandes du popup (« Tester ce code »)                             */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message: ContentCommand, _sender, sendResponse) => {
  if (message?.type !== 'APPLY_CODE') return false

  const input = liveInput()
  if (input === null) {
    sendResponse({ started: false })
    return false
  }

  const watch = startOutcomeWatch()
  applyCode(input, findApplyButton(input, domain), message.code)
  state.manuallyTyped = false
  void watch.result.then(({ outcome, saved }) => {
    if (outcome === 'success') {
      void sendToBackground({
        type: 'REPORT_RESULT',
        domain,
        code: message.code,
        success: true,
        manual: false,
        saved: saved ?? undefined,
      })
      showToast(
        saved !== null
          ? `✓ Code « ${message.code} » appliqué — le prix a baissé de ${formatAmount(saved)} !`
          : `✓ Code « ${message.code} » appliqué — le prix a baissé !`,
      )
    } else if (outcome === 'failure') {
      showToast(`✗ Code « ${message.code} » refusé par la boutique.`)
    }
  })

  sendResponse({ started: true })
  return false
})

/* ------------------------------------------------------------------ */
/* Démarrage : détection (avec re-scan SPA) puis application           */
/* ------------------------------------------------------------------ */

async function onInputFound(input: HTMLInputElement): Promise<void> {
  state.input = input
  attachManualListeners(input)

  try {
    // couponFieldPresent = true : signale au worker qu'un vrai champ coupon
    // existe ici. Le Tier 2 (scraping, qui révèle le domaine à l'annuaire tiers)
    // n'est autorisé que dans ce cas — jamais sur simple ouverture du popup.
    const { coupons } = await sendToBackground({
      type: 'GET_COUPONS',
      domain,
      couponFieldPresent: true,
    })
    if (coupons.length > 0) {
      showToast(`${coupons.length} code(s) promo connu(s) pour ce site — essai en cours…`)
      await tryCodesAutomatically(coupons)
    }
  } catch (error) {
    console.warn('[Coupons] Service worker injoignable :', error)
  }
}

function startDetection(): void {
  const immediate = findCouponInput(document, domain)
  if (immediate !== null) {
    void onInputFound(immediate)
    return
  }

  // Les caisses des SPA apparaissent souvent après coup : on re-scanne aux
  // mutations, avec un débounce de 500 ms pour rester léger.
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let lastAttempt = Date.now()

  const attempt = (): void => {
    lastAttempt = Date.now()
    const input = findCouponInput(document, domain)
    if (input !== null) {
      rescanner.disconnect()
      clearInterval(guaranteed)
      clearTimeout(safety)
      void onInputFound(input)
    }
  }

  const rescanner = new MutationObserver(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(attempt, 500)
  })
  rescanner.observe(document.body, { childList: true, subtree: true })

  // Échéance maximale : sous des mutations continues (< 500 ms), le débounce
  // pur repousserait la détection indéfiniment. On garantit un scan toutes les 2 s.
  const guaranteed = setInterval(() => {
    if (Date.now() - lastAttempt >= 2000) attempt()
  }, 2000)

  // Arrêt de sécurité : ne pas observer indéfiniment une page sans champ coupon.
  const safety = setTimeout(() => {
    rescanner.disconnect()
    clearInterval(guaranteed)
  }, 60000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDetection)
} else {
  startDetection()
}
