// Service worker MV3 — cœur du moteur de sourcing hybride à 3 niveaux.
//
// Règles de survie MV3 :
//   - le worker peut être tué après ~30 s d'inactivité : AUCUN état applicatif
//     en variable de module, tout vit dans chrome.storage.local (voir lib/storage) ;
//   - tous les listeners sont enregistrés de façon SYNCHRONE au niveau module,
//     sinon Chrome ne réveille pas le worker pour les événements concernés ;
//   - les réponses aux messages sont asynchrones : le listener retourne `true`.

import { reportCouponResult } from '../api/crowdsource'
import { MOCK_CROWDSOURCE, TIER1_REFRESH_ALARM, TIER1_REFRESH_PERIOD_MIN } from '../config'
import { normalizeDomain } from '../lib/domain'
import { runMigrations } from '../lib/migrations'
import type {
  BgRequest,
  GetCouponsResponse,
  RefreshTier1Response,
  ReportResultRequest,
  ReportResultResponse,
} from '../lib/messaging'
import {
  addCouponsForDomain,
  addHistoryEntry,
  addSavings,
  getCouponsForDomain,
  getMeta,
  getSettings,
  getStorage,
  incrementStat,
  markTier2Scraped,
  purgeExpiredCoupons,
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
 *
 * Vie privée : le Tier 2 envoie le domaine visité à un annuaire tiers. Il n'est
 * donc lancé QUE si l'appelant confirme la présence d'un vrai champ coupon
 * (`couponFieldPresent`, posé par le content script sur une page de paiement).
 * Une simple ouverture du popup (sans ce drapeau) ne déclenche aucun scraping.
 */
async function handleGetCoupons(
  rawDomain: string,
  couponFieldPresent: boolean,
  tabId?: number,
): Promise<GetCouponsResponse> {
  const domain = normalizeDomain(rawDomain)

  try {
    await ensureTier1Fresh()
  } catch (error) {
    console.warn('[Worker] Rafraîchissement Tier 1 impossible :', error)
  }

  let coupons = await getCouponsForDomain(domain)

  if (coupons.length === 0 && couponFieldPresent) {
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

  // Badge d'icône : signale le nombre de coupons disponibles sur cet onglet.
  if (tabId !== undefined) void updateBadge(tabId, coupons.length)

  return { coupons }
}

/** Met à jour la pastille de l'icône pour un onglet (aucune permission requise). */
async function updateBadge(tabId: number, count: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' })
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4f46e5' })
  } catch {
    // L'onglet a pu se fermer entre-temps : sans conséquence.
  }
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
  if (code.length === 0) return { shared: false, simulated: false }

  if (request.success) {
    const coupon: Coupon = {
      code,
      description: 'Code vérifié sur la page de paiement',
      source: 'crowdsourced',
      addedAt: Date.now(),
    }
    await addCouponsForDomain(domain, [coupon])
    await incrementStat('applied')
    if (typeof request.saved === 'number') await addSavings(request.saved)
    await addHistoryEntry({ domain, code, saved: request.saved, at: Date.now() })
  }

  let shared = false
  const simulated = MOCK_CROWDSOURCE
  if (request.manual) {
    const settings = await getSettings()
    if (settings.crowdsourceOptIn) {
      shared = await reportCouponResult({ domain, code, success: request.success })
      // On ne comptabilise un « partage » que s'il a réellement été transmis :
      // en mode démonstration (simulé), rien n'a quitté le navigateur.
      if (shared && !simulated) await incrementStat('shared')
    }
  }

  return { shared, simulated }
}

/** REFRESH_TIER1 : rafraîchissement forcé depuis le popup. */
async function handleRefreshTier1(): Promise<RefreshTier1Response> {
  try {
    // ok = remote : n'annonce « à jour » que si le flux vient réellement du réseau.
    const { domains, remote } = await refreshTier1()
    return { ok: remote, domains }
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      return respond(
        handleGetCoupons(message.domain, message.couponFieldPresent === true, sender.tab?.id),
      )
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

/* ------------------------------------------------------------------ */
/* Rafraîchissement périodique (chrome.alarms)                          */
/* ------------------------------------------------------------------ */

/**
 * Crée l'alarme périodique du Tier 1 UNIQUEMENT si elle n'existe pas déjà.
 * Les alarmes MV3 persistent entre les redémarrages : la recréer sans garde à
 * chaque onStartup réarmerait son premier tir à « démarrage + période », si bien
 * qu'un profil dont les sessions durent moins que la période ne verrait JAMAIS
 * l'alarme se déclencher (donc ni rafraîchissement ni purge). La garde évite ça.
 */
async function scheduleRefreshAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(TIER1_REFRESH_ALARM)
  if (existing === undefined) {
    chrome.alarms.create(TIER1_REFRESH_ALARM, { periodInMinutes: TIER1_REFRESH_PERIOD_MIN })
  }
}

// Listener enregistré au top-level (obligatoire MV3 pour réveiller le worker).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TIER1_REFRESH_ALARM) return
  void (async () => {
    try {
      await refreshTier1()
      // Hygiène : on profite du réveil pour purger les coupons périmés/en excès.
      const removed = await purgeExpiredCoupons()
      if (removed > 0) console.info(`[Worker] ${removed} coupon(s) périmé(s) purgé(s).`)
    } catch (error) {
      console.warn('[Worker] Rafraîchissement périodique échoué :', error)
    }
  })()
})

chrome.runtime.onInstalled.addListener(() => {
  registerDeclarativeContentRule()
  void scheduleRefreshAlarm()
  void (async () => {
    // Migrations AVANT tout accès, pour ne pas persister sur un vieux schéma.
    try {
      await runMigrations()
    } catch (error) {
      console.warn('[Worker] Migration du stockage échouée :', error)
    }
    // Premier remplissage du Tier 1 (avec repli sur le flux embarqué) :
    // l'extension est utilisable immédiatement, même hors-ligne.
    await refreshTier1()
  })()
})

chrome.runtime.onStartup.addListener(() => {
  void scheduleRefreshAlarm()
  void (async () => {
    try {
      await runMigrations()
    } catch (error) {
      console.warn('[Worker] Migration du stockage échouée :', error)
    }
    await ensureTier1Fresh()
  })().catch((error) =>
    console.warn('[Worker] Vérification de fraîcheur au démarrage échouée :', error),
  )
})
