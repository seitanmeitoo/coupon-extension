// Observation du DOM après application d'un code : c'est le MutationObserver
// qui tranche entre succès (baisse de prix, message positif) et échec
// (message « code invalide »).

import {
  containsFailureMessage,
  containsSuccessMessage,
  findPrices,
  isFinalTotalContext,
  isSubtotalContext,
  isTotalContext,
} from './price'

export type Outcome = 'success' | 'failure' | 'timeout'

export interface PriceSnapshot {
  /** Meilleur candidat « total de commande » (max des prix en contexte total). */
  total: number | null
  /** Plus grand prix de la page, tous contextes confondus. */
  maxPrice: number | null
}

/** Remonte 4 ancêtres au plus et concatène classes, ids et libellés proches. */
function contextOf(node: Node): string {
  const parts: string[] = []
  let current: HTMLElement | null =
    node instanceof HTMLElement ? node : node.parentElement
  for (let depth = 0; current !== null && depth < 4; depth++) {
    parts.push(current.className, current.id, current.getAttribute('aria-label') ?? '')
    current = current.parentElement
  }
  return parts.join(' ')
}

/**
 * Photographie les prix de la page : parcourt les nœuds texte porteurs de
 * devise et retient le « total à payer » le plus plausible.
 *
 * Deux pièges évités :
 * - Les lignes SOUS-TOTAL matchent « total » mais ne bougent pas avec la remise :
 *   on les EXCLUT des candidats total (sinon elles masqueraient la baisse).
 * - Une page peut avoir plusieurs lignes « total » : on préfère un marqueur de
 *   total FINAL (« à payer », « grand total »…) ; à défaut on retient la DERNIÈRE
 *   ligne total rencontrée (ordre DOM ≈ total final en bas), pas le maximum.
 */
export function snapshotPrices(root: Node = document.body): PriceSnapshot {
  const doc = root.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let maxPrice: number | null = null
  let total: number | null = null
  let finalTotal: number | null = null

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (text.length > 200) continue // paragraphe entier : jamais une ligne de total
    const prices = findPrices(text)
    if (prices.length === 0) continue
    const localMax = Math.max(...prices)
    if (maxPrice === null || localMax > maxPrice) maxPrice = localMax

    const ctx = `${text} ${contextOf(node)}`
    if (isSubtotalContext(ctx)) continue // jamais un « total à payer »
    if (isFinalTotalContext(ctx)) {
      finalTotal = localMax // marqueur fort : la dernière occurrence gagne
    } else if (isTotalContext(ctx)) {
      total = localMax // total générique : la dernière occurrence gagne
    }
  }
  return { total: finalTotal ?? total, maxPrice }
}

/** Une baisse est significative au-delà d'un demi-centime (bruit d'arrondi). */
function hasDropped(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after < before - 0.005
}

/** Compare deux photographies : le total (ou à défaut le prix max) a-t-il baissé ? */
export function priceDropped(before: PriceSnapshot, after: PriceSnapshot): boolean {
  if (before.total !== null) return hasDropped(before.total, after.total)
  return hasDropped(before.maxPrice, after.maxPrice)
}

/**
 * Montant économisé entre deux photographies (positif), ou `null` si non mesurable.
 * Utilise le total quand il est identifié, sinon le prix max.
 */
export function savingsFrom(before: PriceSnapshot, after: PriceSnapshot): number | null {
  const b = before.total ?? before.maxPrice
  const a = after.total ?? after.maxPrice
  if (b === null || a === null || a >= b) return null
  return Math.round((b - a) * 100) / 100
}

/** Verdict enrichi du montant économisé estimé. */
export interface OutcomeResult {
  outcome: Outcome
  /** Montant économisé si mesurable (baisse de prix constatée), sinon null. */
  saved: number | null
}

export interface WatchOptions {
  /** Durée maximale d'observation (défaut : 6 s). */
  windowMs?: number
  /** Délai d'accalmie après la dernière mutation avant de comparer (défaut : 800 ms). */
  debounceMs?: number
  /** Période de la vérification de secours du prix (défaut : 1 s). */
  checkIntervalMs?: number
}

export interface OutcomeWatch {
  /** Résout avec le verdict et le montant économisé estimé. */
  result: Promise<OutcomeResult>
  /** Interrompt l'observation immédiatement (résout en 'timeout'). */
  cancel: () => void
}

/**
 * Démarre l'observation du DOM et retourne immédiatement : la photographie des
 * prix ET la connexion du MutationObserver précèdent le retour, donc l'appelant
 * doit démarrer l'observation AVANT de déclencher l'action (clic, soumission) —
 * sinon les mutations synchrones de la page seraient manquées.
 *
 * Verdicts :
 * - 'failure' : un nœud ajouté/modifié contient un message « code invalide » ;
 * - 'success' : message de succès explicite OU baisse du total ;
 * - 'timeout' : rien de concluant dans la fenêtre d'observation.
 *
 * Une vérification périodique du prix double le MutationObserver : elle attrape
 * les changements survenus de façon synchrone, avant que l'observation ne soit
 * effective (certaines pages recalculent leur total dans le gestionnaire de clic).
 */
export function startOutcomeWatch(options: WatchOptions = {}): OutcomeWatch {
  const { windowMs = 6000, debounceMs = 800, checkIntervalMs = 1000 } = options
  const before = snapshotPrices()

  // Assignée dans l'exécuteur ; permet à l'appelant d'interrompre la surveillance
  // (ex. un nouveau geste de soumission remplace le code en cours d'observation).
  let cancel = (): void => {}

  const result = new Promise<OutcomeResult>((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const finish = (outcome: Outcome, saved: number | null = null): void => {
      clearTimeout(debounceTimer)
      clearTimeout(deadlineTimer)
      clearInterval(checkTimer)
      observer.disconnect()
      resolve({ outcome, saved })
    }

    cancel = () => finish('timeout')

    const evaluate = (): void => {
      const after = snapshotPrices()
      if (priceDropped(before, after)) finish('success', savingsFrom(before, after))
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          const text = added.textContent ?? ''
          if (containsFailureMessage(text)) {
            finish('failure')
            return
          }
          if (containsSuccessMessage(text)) {
            // Succès annoncé par message : le montant peut ne pas être mesurable.
            finish('success', savingsFrom(before, snapshotPrices()))
            return
          }
        }
        if (mutation.type === 'characterData') {
          const text = mutation.target.textContent ?? ''
          if (containsFailureMessage(text)) {
            finish('failure')
            return
          }
        }
      }
      // Accalmie : on laisse la page finir de se recalculer avant de comparer.
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(evaluate, debounceMs)
    })

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })

    const checkTimer = setInterval(evaluate, checkIntervalMs)

    const deadlineTimer = setTimeout(() => {
      // Dernière chance avant le verdict « timeout ».
      const after = snapshotPrices()
      if (priceDropped(before, after)) {
        finish('success', savingsFrom(before, after))
        return
      }
      finish('timeout')
    }, windowMs)
  })

  return { result, cancel }
}
