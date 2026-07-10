// Normalisation de domaine — fonction pure, partagée par les trois contextes
// (le content script auto-déclare son hostname, le popup lit l'URL de l'onglet actif,
// le background indexe le stockage) : tout le monde doit produire la même clé.

/**
 * Normalise un nom d'hôte en clé de stockage : minuscules, sans point final DNS,
 * sans préfixe « www. ». On conserve les autres sous-domaines (ex. « boutique.exemple.fr »)
 * car les coupons sont souvent propres à une boutique précise.
 */
export function normalizeDomain(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '')
}

/** Extrait le domaine normalisé d'une URL complète ; `null` si l'URL est invalide ou non http(s). */
export function domainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return normalizeDomain(parsed.hostname)
  } catch {
    return null
  }
}
