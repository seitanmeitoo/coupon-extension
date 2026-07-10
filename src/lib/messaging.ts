// Contrats de messages entre les trois contextes de l'extension.
// Unions discriminées : le routeur du service worker fait un `switch` exhaustif,
// et TypeScript garantit que chaque requête reçoit la réponse du bon type.

import type { Coupon } from '../types'

/* ------------------------------------------------------------------ */
/* Requêtes vers le service worker (chrome.runtime.sendMessage)        */
/* ------------------------------------------------------------------ */

/** Demande des coupons pour un domaine (émise par le content script et le popup). */
export interface GetCouponsRequest {
  type: 'GET_COUPONS'
  domain: string
}

/**
 * Compte-rendu d'application d'un code (émis par le content script).
 * `manual: true` signifie que le code a été TAPÉ PAR L'UTILISATEUR
 * (événements `isTrusted`, hors injection programmatique) — c'est la seule
 * porte d'entrée du Tier 3 (crowdsourcing anonyme, soumis à l'opt-in).
 */
export interface ReportResultRequest {
  type: 'REPORT_RESULT'
  domain: string
  code: string
  success: boolean
  manual: boolean
}

/** Force un rafraîchissement du flux Tier 1 (bouton « Actualiser » du popup). */
export interface RefreshTier1Request {
  type: 'REFRESH_TIER1'
}

export type BgRequest = GetCouponsRequest | ReportResultRequest | RefreshTier1Request

export interface GetCouponsResponse {
  coupons: Coupon[]
}

export interface ReportResultResponse {
  /** `true` si le code a été transmis anonymement à la communauté (opt-in actif). */
  shared: boolean
}

export interface RefreshTier1Response {
  ok: boolean
  /** Nombre de domaines couverts par le flux après rafraîchissement. */
  domains: number
}

/** Associe à chaque requête le type de sa réponse. */
export type BgResponseFor<R extends BgRequest> = R extends GetCouponsRequest
  ? GetCouponsResponse
  : R extends ReportResultRequest
    ? ReportResultResponse
    : RefreshTier1Response

/** Envoi typé vers le service worker (MV3 : sendMessage retourne une Promise). */
export function sendToBackground<R extends BgRequest>(request: R): Promise<BgResponseFor<R>> {
  return chrome.runtime.sendMessage(request)
}

/* ------------------------------------------------------------------ */
/* Commandes vers le content script (chrome.tabs.sendMessage)          */
/* ------------------------------------------------------------------ */

/** Demande au content script d'essayer un code précis (bouton « Tester ce code »). */
export interface ApplyCodeCommand {
  type: 'APPLY_CODE'
  code: string
}

export type ContentCommand = ApplyCodeCommand

export interface ApplyCodeResponse {
  /** `false` si aucun champ coupon n'a été détecté sur la page. */
  started: boolean
}

/** Envoi typé d'une commande au content script d'un onglet donné. */
export function sendToTab(tabId: number, command: ContentCommand): Promise<ApplyCodeResponse> {
  return chrome.tabs.sendMessage(tabId, command)
}
