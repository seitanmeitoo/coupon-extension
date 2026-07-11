// Petit utilitaire d'internationalisation, source unique = _locales/fr/messages.json.
//
// À l'exécution dans l'extension, `chrome.i18n.getMessage` lit le catalogue de la
// locale active (aujourd'hui : français). En repli (tests, contexte hors-extension),
// on lit le même fichier importé directement — une seule source de vérité.
//
// Interpolation maison `{nom}` (plus lisible que le système `$1` de chrome.i18n) :
// le template contient des marqueurs `{nom}` qu'on remplace par `params`.

import frMessages from '../../public/_locales/fr/messages.json'

type Catalog = Record<string, { message: string }>
const FR = frMessages as Catalog

/** Type des clés connues (autocomplétion + vérification à la compilation). */
export type MessageKey = keyof typeof frMessages

/** Récupère le template d'une clé (chrome.i18n si dispo, sinon catalogue importé). */
function template(key: string): string {
  const fromChrome = globalThis.chrome?.i18n?.getMessage?.(key)
  if (typeof fromChrome === 'string' && fromChrome.length > 0) return fromChrome
  return FR[key]?.message ?? key
}

/** Traduit une clé et substitue les marqueurs `{nom}` par `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const raw = template(key)
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  )
}
