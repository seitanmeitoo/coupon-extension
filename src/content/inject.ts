// Content script — orchestration sur la page marchande :
//   1. déclare son domaine au service worker et récupère les coupons connus ;
//   2. détecte le champ « code promo » (y compris chargé tardivement en SPA) ;
//   3. essaie automatiquement les codes et observe le DOM pour trancher ;
//   4. repère les codes tapés MANUELLEMENT qui fonctionnent et les remonte
//      au worker (Tier 3 — crowdsourcing anonyme, soumis à l'opt-in).

import { normalizeDomain } from '../lib/domain'
import { sendToBackground, type ContentCommand } from '../lib/messaging'
import type { Coupon } from '../types'
import { applyCode, isProgrammaticInjection } from './applier'
import { findApplyButton, findCouponInput } from './detect'
import { startOutcomeWatch } from './observer'

const domain = normalizeDomain(location.hostname)

/** État local de la page (le content script vit avec elle, contrairement au worker). */
const state = {
  input: null as HTMLInputElement | null,
  autoTried: false,
  /** La valeur actuelle du champ a-t-elle été tapée par l'utilisateur ? */
  manuallyTyped: false,
  /** Codes déjà remontés au worker sur cette page (anti-doublon). */
  reportedCodes: new Set<string>(),
  manualWatchActive: false,
}

/* ------------------------------------------------------------------ */
/* Petit toast en français, sans dépendance                            */
/* ------------------------------------------------------------------ */

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

  const button = findApplyButton(input)
  for (const coupon of [...coupons].sort(byPromise)) {
    // L'observation démarre AVANT le clic : les pages qui recalculent leur
    // total de façon synchrone seraient sinon jugées « sans verdict ».
    const watch = startOutcomeWatch()
    applyCode(input, button, coupon.code)
    state.manuallyTyped = false // la valeur en place vient de nous, pas de l'utilisateur
    const outcome = await watch.result

    if (outcome === 'success') {
      state.reportedCodes.add(coupon.code)
      void sendToBackground({
        type: 'REPORT_RESULT',
        domain,
        code: coupon.code,
        success: true,
        manual: false,
      })
      showToast(`✓ Code « ${coupon.code} » appliqué — le prix a baissé !`)
      return
    }
  }

  // Aucun code retenu : on rend le champ propre plutôt que d'y laisser un échec.
  applyCleanup(input)
  showToast('Aucun des codes connus n’a fonctionné sur cette page.')
}

/** Vide le champ de façon programmatique (le drapeau couvre l'événement émis). */
function applyCleanup(input: HTMLInputElement): void {
  applyCode(input, null, '')
  state.manuallyTyped = false
}

/* ------------------------------------------------------------------ */
/* Détection des saisies manuelles → Tier 3                            */
/* ------------------------------------------------------------------ */

/**
 * Arme une fenêtre d'observation après un geste de soumission de l'utilisateur.
 * Si le prix baisse (ou qu'un message de succès apparaît), le code TAPÉ À LA
 * MAIN est remonté au worker, qui ne le partagera que si l'opt-in est actif.
 */
function armManualWatch(code: string): void {
  if (state.manualWatchActive || state.reportedCodes.has(code)) return
  state.manualWatchActive = true
  // Appelé en phase de CAPTURE du clic : la photographie des prix est prise
  // avant que la page ne réagisse et ne recalcule son total.
  const watch = startOutcomeWatch({ windowMs: 15000 })

  void watch.result.then(async (outcome) => {
    state.manualWatchActive = false
    if (outcome !== 'success' || state.reportedCodes.has(code)) return
    state.reportedCodes.add(code)
    const response = await sendToBackground({
      type: 'REPORT_RESULT',
      domain,
      code,
      success: true,
      manual: true,
    })
    showToast(
      response?.shared
        ? `✓ Code « ${code} » vérifié et partagé anonymement avec la communauté. Merci !`
        : `✓ Code « ${code} » vérifié — il fonctionne sur cette boutique.`,
    )
  })
}

/** Geste de soumission détecté (clic ou Entrée) — uniquement s'il est humain. */
function onSubmitGesture(event: Event): void {
  if (!event.isTrusted || isProgrammaticInjection()) return
  const input = state.input
  if (input === null || !state.manuallyTyped) return
  const code = input.value.trim().toUpperCase()
  if (code.length >= 3) armManualWatch(code)
}

function attachManualListeners(input: HTMLInputElement): void {
  // Saisie : seul un événement `isTrusted` hors injection marque une frappe humaine.
  input.addEventListener('input', (event) => {
    state.manuallyTyped = event.isTrusted && !isProgrammaticInjection()
  })

  // Soumission : Entrée dans le champ…
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onSubmitGesture(event)
  })

  // …ou clic n'importe où dans le conteneur (bouton « Appliquer » compris).
  // Phase de capture : la photographie des prix est prise AVANT que la page
  // ne réagisse au clic et ne recalcule son total.
  document.addEventListener('click', onSubmitGesture, { capture: true })
}

/* ------------------------------------------------------------------ */
/* Commandes du popup (« Tester ce code »)                             */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message: ContentCommand, _sender, sendResponse) => {
  if (message?.type !== 'APPLY_CODE') return false

  const input = state.input ?? findCouponInput()
  if (input === null) {
    sendResponse({ started: false })
    return false
  }
  state.input = input

  const watch = startOutcomeWatch()
  applyCode(input, findApplyButton(input), message.code)
  state.manuallyTyped = false
  void watch.result.then((outcome) => {
    if (outcome === 'success') {
      void sendToBackground({
        type: 'REPORT_RESULT',
        domain,
        code: message.code,
        success: true,
        manual: false,
      })
      showToast(`✓ Code « ${message.code} » appliqué — le prix a baissé !`)
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
    const { coupons } = await sendToBackground({ type: 'GET_COUPONS', domain })
    if (coupons.length > 0) {
      showToast(`${coupons.length} code(s) promo connu(s) pour ce site — essai en cours…`)
      await tryCodesAutomatically(coupons)
    }
  } catch (error) {
    console.warn('[Coupons] Service worker injoignable :', error)
  }
}

function startDetection(): void {
  const immediate = findCouponInput()
  if (immediate !== null) {
    void onInputFound(immediate)
    return
  }

  // Les caisses des SPA apparaissent souvent après coup : on re-scanne aux
  // mutations, avec un débounce de 500 ms pour rester léger.
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const rescanner = new MutationObserver(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const input = findCouponInput()
      if (input !== null) {
        rescanner.disconnect()
        void onInputFound(input)
      }
    }, 500)
  })
  rescanner.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDetection)
} else {
  startDetection()
}
