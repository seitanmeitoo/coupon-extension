// Service worker MV3 — cœur du moteur de sourcing hybride à 3 niveaux.
//
// Règles de survie MV3 :
//   - le worker peut être tué après ~30 s d'inactivité : AUCUN état applicatif
//     en variable de module, tout vit dans chrome.storage.local (voir lib/storage) ;
//   - tous les listeners sont enregistrés de façon SYNCHRONE au niveau module,
//     sinon Chrome ne réveille pas le worker pour les événements concernés ;
//   - les réponses aux messages sont asynchrones : le listener retourne `true`.

import { reportCouponResult } from '../api/crowdsource'
import { normalizeDomain } from '../lib/domain'
import type {
  BgRequest,
  GetCouponsResponse,
  RefreshTier1Response,
  ReportResultRequest,
  ReportResultResponse,
} from '../lib/messaging'
import {
  addCouponsForDomain,
  getCouponsForDomain,
  getMeta,
  getSettings,
  getStorage,
  incrementStat,
  markTier2Scraped,
} from '../lib/storage'
import type { Coupon } from '../types'
import { ensureTier1Fresh, refreshTier1 } from './tiers/tier1-community'
import { scrapeTier2, TIER2_COOLDOWN_MS } from './tiers/tier2-scraper'

/* ------------------------------------------------------------------ */
/* Traitement des requêtes                                             */
/* ------------------------------------------------------------------ */

/**
 * GET_COUPONS : répond avec les coupons connus pour le domaine.
 * Cascade des tiers : fraîcheur du Tier 1 vérifiée d'abord, puis repli sur le
 * Tier 2 (scraping + regex) si le domaine est totalement inconnu.
 */
async function handleGetCoupons(rawDomain: string): Promise<GetCouponsResponse> {
  const domain = normalizeDomain(rawDomain)

  try {
    await ensureTier1Fresh()
  } catch (error) {
    console.warn('[Worker] Rafraîchissement Tier 1 impossible :', error)
  }

  let coupons = await getCouponsForDomain(domain)

  if (coupons.length === 0) {
    const meta = await getMeta()
    const lastScrape = meta.tier2LastScrape?.[domain] ?? 0
    if (Date.now() - lastScrape > TIER2_COOLDOWN_MS) {
      // Marqué AVANT le scraping : même en cas d'échec, on n'insiste pas
      // avant la fin du refroidissement (le worker peut mourir entre-temps).
      await markTier2Scraped(domain)
      const scraped = await scrapeTier2(domain)
      if (scraped.length > 0) {
        coupons = await addCouponsForDomain(domain, scraped)
      }
    }
  }

  return { coupons }
}

/**
 * REPORT_RESULT : compte-rendu d'application d'un code par le content script.
 * Un succès est toujours mémorisé LOCALEMENT (source « crowdsourced »).
 * L'envoi communautaire (Tier 3) n'a lieu que si :
 *   1. le code a été tapé MANUELLEMENT par l'utilisateur (`manual: true`), et
 *   2. l'opt-in de partage anonyme est actif — relu au moment de l'envoi,
 *      jamais mis en cache (le worker redémarre sans cesse).
 */
async function handleReportResult(request: ReportResultRequest): Promise<ReportResultResponse> {
  const domain = normalizeDomain(request.domain)
  const code = request.code.trim().toUpperCase()
  if (code.length === 0) return { shared: false }

  if (request.success) {
    const coupon: Coupon = {
      code,
      description: 'Code vérifié sur la page de paiement',
      source: 'crowdsourced',
      addedAt: Date.now(),
    }
    await addCouponsForDomain(domain, [coupon])
    await incrementStat('applied')
  }

  let shared = false
  if (request.manual) {
    const settings = await getSettings()
    if (settings.crowdsourceOptIn) {
      shared = await reportCouponResult({ domain, code, success: request.success })
      if (shared) await incrementStat('shared')
    }
  }

  return { shared }
}

/** REFRESH_TIER1 : rafraîchissement forcé depuis le popup. */
async function handleRefreshTier1(): Promise<RefreshTier1Response> {
  try {
    const domains = await refreshTier1()
    return { ok: true, domains }
  } catch (error) {
    console.error('[Worker] Rafraîchissement forcé échoué :', error)
    const { coupons } = await getStorage()
    return { ok: false, domains: Object.keys(coupons).length }
  }
}

/* ------------------------------------------------------------------ */
/* Routeur de messages                                                 */
/* ------------------------------------------------------------------ */

function isBgRequest(message: unknown): message is BgRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string'
  )
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isBgRequest(message)) return false

  const respond = (work: Promise<unknown>): true => {
    work
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[Worker] Erreur de traitement :', error)
        sendResponse(undefined)
      })
    return true // réponse asynchrone : garde le canal ouvert
  }

  switch (message.type) {
    case 'GET_COUPONS':
      return respond(handleGetCoupons(message.domain))
    case 'REPORT_RESULT':
      return respond(handleReportResult(message))
    case 'REFRESH_TIER1':
      return respond(handleRefreshTier1())
    default:
      return false
  }
})

/* ------------------------------------------------------------------ */
/* Cycle de vie                                                        */
/* ------------------------------------------------------------------ */

/**
 * Règle declarativeContent : l'icône de l'extension est active sur les pages
 * https. Usage minimal mais réel de la permission « declarativeContent »
 * exigée par le cahier des charges.
 */
function registerDeclarativeContentRule(): void {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({ pageUrl: { schemes: ['https'] } }),
        ],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ])
  })
}

chrome.runtime.onInstalled.addListener(() => {
  registerDeclarativeContentRule()
  // Premier remplissage du Tier 1 (avec repli sur le flux embarqué) :
  // l'extension est utilisable immédiatement, même hors-ligne.
  void refreshTier1()
})

chrome.runtime.onStartup.addListener(() => {
  void ensureTier1Fresh().catch((error) =>
    console.warn('[Worker] Vérification de fraîcheur au démarrage échouée :', error),
  )
})
