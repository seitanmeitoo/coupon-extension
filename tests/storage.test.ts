// Tests des helpers de stockage : fusion pure + persistance avec une API
// chrome.storage.local simulée en mémoire (sémantique get(defaults) respectée).
import { beforeEach, describe, expect, it } from 'vitest'
import type { Coupon } from '../src/types'

/* ------------------------------------------------------------------ */
/* Mock minimal de chrome.storage.local                                */
/* ------------------------------------------------------------------ */

let store: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    local: {
      async get(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
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

// Injecté AVANT l'import du module testé (les helpers lisent chrome.* à l'appel).
;(globalThis as Record<string, unknown>).chrome = chromeMock

const {
  addCouponsForDomain,
  addHistoryEntry,
  addSavings,
  getCouponsForDomain,
  getSettings,
  getStats,
  HISTORY_MAX,
  incrementStat,
  MAX_COUPONS_PER_DOMAIN,
  mergeCoupons,
  pruneCoupons,
  purgeExpiredCoupons,
  replaceCommunityCoupons,
  setSettings,
} = await import('../src/lib/storage')

const coupon = (code: string, source: Coupon['source'], extra: Partial<Coupon> = {}): Coupon => ({
  code,
  source,
  addedAt: 1,
  ...extra,
})

beforeEach(() => {
  store = {}
})

/* ------------------------------------------------------------------ */
/* mergeCoupons — fonction pure                                        */
/* ------------------------------------------------------------------ */

describe('mergeCoupons', () => {
  it('dédoublonne par code, insensible à la casse et aux espaces', () => {
    const merged = mergeCoupons(
      [coupon('PROMO10', 'community')],
      [coupon(' promo10 ', 'scraped')],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('community') // l'existant gagne
  })

  it('complète description et taux manquants sans écraser l’existant', () => {
    const merged = mergeCoupons(
      [coupon('A1B2C', 'community', { description: undefined, successRate: undefined })],
      [coupon('A1B2C', 'crowdsourced', { description: 'Nouvelle description', successRate: 0.7 })],
    )
    expect(merged[0]).toMatchObject({
      source: 'community',
      description: 'Nouvelle description',
      successRate: 0.7,
    })
  })

  it('concatène les codes distincts', () => {
    const merged = mergeCoupons([coupon('AAA11', 'community')], [coupon('BBB22', 'scraped')])
    expect(merged.map((c) => c.code)).toEqual(['AAA11', 'BBB22'])
  })
})

/* ------------------------------------------------------------------ */
/* Persistance                                                          */
/* ------------------------------------------------------------------ */

describe('addCouponsForDomain / getCouponsForDomain', () => {
  it('persiste puis relit les coupons d’un domaine', async () => {
    await addCouponsForDomain('boutique.fr', [coupon('XYZ99', 'scraped')])
    const list = await getCouponsForDomain('boutique.fr')
    expect(list).toHaveLength(1)
    expect(list[0].code).toBe('XYZ99')
  })

  it('retourne un tableau vide pour un domaine inconnu', async () => {
    expect(await getCouponsForDomain('inconnu.fr')).toEqual([])
  })
})

describe('replaceCommunityCoupons', () => {
  it('remplace les coupons community mais préserve les autres sources', async () => {
    await addCouponsForDomain('shop.fr', [
      coupon('VIEUX10', 'community'),
      coupon('LOCAL5', 'crowdsourced'),
    ])
    await replaceCommunityCoupons({ 'shop.fr': [coupon('NEUF20', 'community')] })

    const list = await getCouponsForDomain('shop.fr')
    const codes = list.map((c) => c.code).sort()
    expect(codes).toEqual(['LOCAL5', 'NEUF20'])
  })

  it('met à jour l’horodatage de fraîcheur du Tier 1', async () => {
    await replaceCommunityCoupons({})
    const meta = store.meta as { tier1LastFetch: number }
    expect(meta.tier1LastFetch).toBeGreaterThan(0)
  })

  it('ne touche pas aux domaines absents du flux', async () => {
    await addCouponsForDomain('autre.fr', [coupon('GARDE1', 'community')])
    await replaceCommunityCoupons({ 'shop.fr': [coupon('NEUF20', 'community')] })
    expect(await getCouponsForDomain('autre.fr')).toHaveLength(1)
  })
})

describe('settings — vie privée d’abord', () => {
  it('l’opt-in de partage est DÉSACTIVÉ par défaut', async () => {
    const settings = await getSettings()
    expect(settings.crowdsourceOptIn).toBe(false)
  })

  it('persiste le choix explicite de l’utilisateur', async () => {
    await setSettings({ crowdsourceOptIn: true })
    expect((await getSettings()).crowdsourceOptIn).toBe(true)
  })
})

describe('incrementStat', () => {
  it('incrémente les compteurs locaux', async () => {
    await incrementStat('applied')
    await incrementStat('applied')
    await incrementStat('shared')
    expect(store.stats).toEqual({ applied: 2, shared: 1, savedTotal: 0 })
  })
})

describe('addSavings', () => {
  it('accumule les montants économisés (arrondi au centime)', async () => {
    await addSavings(5.5)
    await addSavings(4.25)
    expect((store.stats as { savedTotal: number }).savedTotal).toBe(9.75)
  })

  it('ignore les montants non finis ou négatifs', async () => {
    await addSavings(-3)
    await addSavings(Number.NaN)
    expect((await getStats()).savedTotal).toBe(0)
  })
})

describe('addHistoryEntry', () => {
  it('ajoute en tête et borne la liste à HISTORY_MAX', async () => {
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      await addHistoryEntry({ domain: 'x.fr', code: `C${i}`, at: i })
    }
    const history = store.history as Array<{ code: string }>
    expect(history).toHaveLength(HISTORY_MAX)
    expect(history[0].code).toBe(`C${HISTORY_MAX + 4}`) // le plus récent en tête
  })
})

describe('pruneCoupons (pur)', () => {
  it('retire les coupons périmés', () => {
    const list = [
      coupon('VALIDE', 'community', { expiresAt: 2000 }),
      coupon('PERIME', 'community', { expiresAt: 500 }),
      coupon('SANS_EXP', 'community'),
    ]
    const kept = pruneCoupons(list, 1000).map((c) => c.code)
    expect(kept).toEqual(['VALIDE', 'SANS_EXP'])
  })

  it('borne au plus MAX_COUPONS_PER_DOMAIN en gardant les plus récents', () => {
    const list = Array.from({ length: MAX_COUPONS_PER_DOMAIN + 10 }, (_, i) =>
      coupon(`C${i}`, 'scraped', { addedAt: i }),
    )
    const kept = pruneCoupons(list, 0)
    expect(kept).toHaveLength(MAX_COUPONS_PER_DOMAIN)
    // Les addedAt les plus élevés (récents) sont conservés.
    expect(Math.min(...kept.map((c) => c.addedAt))).toBe(10)
  })
})

describe('purgeExpiredCoupons', () => {
  it('supprime les coupons périmés et retire les domaines vidés', async () => {
    await addCouponsForDomain('a.fr', [coupon('OLD', 'community', { expiresAt: 100 })])
    await addCouponsForDomain('b.fr', [coupon('KEEP', 'community', { expiresAt: 9999 })])
    const removed = await purgeExpiredCoupons(1000)
    expect(removed).toBe(1)
    expect(store.coupons).toEqual({ 'b.fr': [expect.objectContaining({ code: 'KEEP' })] })
  })
})
