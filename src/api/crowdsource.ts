// Tier 3 — Crowdsourcing éthique.
// Envoie un compte-rendu ANONYME au backend communautaire (REST type Supabase).
// Garanties « vie privée d'abord » :
//   1. Le payload contient STRICTEMENT { domain, code, success } — aucun
//      identifiant utilisateur, cookie, empreinte navigateur ou horodatage client.
//   2. `credentials: 'omit'` : aucun cookie n'accompagne jamais la requête.
//   3. L'appelant (service worker) ne déclenche cet envoi que si l'utilisateur
//      a explicitement activé l'opt-in dans les réglages (désactivé par défaut).

import { CROWDSOURCE_ENDPOINT, MOCK_CROWDSOURCE } from '../config'

/** Payload anonyme du Tier 3 — ne JAMAIS y ajouter de champ identifiant. */
export interface CrowdsourcePayload {
  domain: string
  code: string
  success: boolean
}

/**
 * Transmet un résultat de coupon à la communauté.
 * En mode simulation (MOCK_CROWDSOURCE), journalise le payload au lieu de
 * l'envoyer — pratique pour le développement et les démonstrations.
 * Retourne `true` si le compte-rendu a été accepté.
 */
export async function reportCouponResult(payload: CrowdsourcePayload): Promise<boolean> {
  // Reconstruction champ à champ : garantit qu'aucune propriété parasite
  // (par ex. ajoutée par un appelant futur) ne peut fuiter vers le réseau.
  const anonymous: CrowdsourcePayload = {
    domain: payload.domain,
    code: payload.code,
    success: payload.success,
  }

  if (MOCK_CROWDSOURCE) {
    console.info('[MOCK] Envoi anonyme :', JSON.stringify(anonymous))
    return true
  }

  try {
    const response = await fetch(CROWDSOURCE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(anonymous),
    })
    return response.ok
  } catch (error) {
    console.warn('[Tier 3] Envoi communautaire impossible :', error)
    return false
  }
}
