// Migrations du schéma de stockage.
// Contrainte : `chrome.storage.local.get(defaults)` complète les clés manquantes
// par les valeurs par défaut — donc lire `schemaVersion` avec un défaut MASQUERAIT
// une installation ancienne. On lit ici l'état RÉEL (`get(null)`) pour décider.

import { CURRENT_SCHEMA_VERSION } from '../types'

/**
 * Migration d'une version N vers N+1. Reçoit l'état brut du stockage et applique
 * les changements nécessaires (idempotents). L'index i correspond à la migration
 * de la version i vers i+1.
 */
type Migration = (raw: Record<string, unknown>) => Promise<void>

/** v0 → v1 : introduction de stats.savedTotal, history[] et schemaVersion. */
const migration0to1: Migration = async (raw) => {
  const stats = (raw.stats ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof stats.savedTotal !== 'number') {
    patch.stats = { applied: 0, shared: 0, ...stats, savedTotal: 0 }
  }
  if (!Array.isArray(raw.history)) {
    patch.history = []
  }
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch)
}

/** Liste ordonnée des migrations : MIGRATIONS[i] fait passer de la version i à i+1. */
const MIGRATIONS: Migration[] = [migration0to1]

/**
 * Applique les migrations en attente puis fige `schemaVersion` à la version
 * courante. Doit être appelée avant tout accès applicatif (onInstalled/onStartup).
 * Idempotente : un second appel ne fait rien.
 */
export async function runMigrations(): Promise<void> {
  const raw = await chrome.storage.local.get(null)
  const isEmpty = Object.keys(raw).length === 0

  // Installation neuve : rien à migrer, on pose simplement la version courante.
  if (isEmpty) {
    await chrome.storage.local.set({ schemaVersion: CURRENT_SCHEMA_VERSION })
    return
  }

  // Donnée présente sans version = installation antérieure au versionnage (v0).
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version]
    if (migrate === undefined) break // sécurité : pas de migration définie
    await migrate(raw)
    version++
  }

  await chrome.storage.local.set({ schemaVersion: CURRENT_SCHEMA_VERSION })
}
