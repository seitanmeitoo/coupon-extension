// Tests des migrations de schéma avec un chrome.storage.local simulé en mémoire.
// Point crucial : get(null) doit renvoyer l'état RÉEL (sans valeurs par défaut),
// sinon la détection de version serait faussée.
import { beforeEach, describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../src/types'

let store: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    local: {
      async get(arg: unknown): Promise<Record<string, unknown>> {
        if (arg === null) return { ...store } // état réel, sans défaut
        const defaults = arg as Record<string, unknown>
        const result: Record<string, unknown> = {}
        for (const [key, fallback] of Object.entries(defaults)) {
          result[key] = key in store ? store[key] : fallback
        }
        return result
      },
      async set(values: Record<string, unknown>): Promise<void> {
        Object.assign(store, values)
      },
    },
  },
}
;(globalThis as Record<string, unknown>).chrome = chromeMock

const { runMigrations } = await import('../src/lib/migrations')

beforeEach(() => {
  store = {}
})

describe('runMigrations', () => {
  it('installation neuve (storage vide) : pose la version courante sans rien casser', async () => {
    await runMigrations()
    expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(store.coupons).toBeUndefined() // aucune donnée fabriquée
  })

  it('installation v0 (données présentes, pas de version) : migre sans perte', async () => {
    store = {
      coupons: { 'boutique.fr': [{ code: 'A1', source: 'community', addedAt: 1 }] },
      settings: { crowdsourceOptIn: true },
      stats: { applied: 3, shared: 1 }, // ancien schéma : pas de savedTotal
    }
    await runMigrations()

    expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    // Les coupons et réglages existants sont préservés.
    expect((store.coupons as Record<string, unknown[]>)['boutique.fr']).toHaveLength(1)
    expect((store.settings as { crowdsourceOptIn: boolean }).crowdsourceOptIn).toBe(true)
    // Les nouveaux champs sont ajoutés.
    expect((store.stats as { savedTotal: number }).savedTotal).toBe(0)
    expect((store.stats as { applied: number }).applied).toBe(3) // valeur conservée
    expect(store.history).toEqual([])
  })

  it('est idempotente : un second appel ne change rien', async () => {
    store = { coupons: {}, stats: { applied: 0, shared: 0 } }
    await runMigrations()
    const snapshot = JSON.stringify(store)
    await runMigrations()
    expect(JSON.stringify(store)).toBe(snapshot)
  })
})
