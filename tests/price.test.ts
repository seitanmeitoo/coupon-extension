// Tests de l'analyse de prix (formats français et anglo-saxons) et des
// messages de succès/échec détectés par le MutationObserver.
import { describe, expect, it } from 'vitest'
import {
  containsFailureMessage,
  containsSuccessMessage,
  findPrices,
  isTotalContext,
  normalizeAmount,
} from '../src/content/price'
import { priceDropped } from '../src/content/observer'

describe('normalizeAmount', () => {
  it('lit un montant français simple', () => {
    expect(normalizeAmount('59,99')).toBe(59.99)
  })

  it('lit un montant français avec milliers à espace insécable', () => {
    expect(normalizeAmount('1 234,56')).toBe(1234.56)
  })

  it('lit un montant anglo-saxon avec milliers à virgule', () => {
    expect(normalizeAmount('1,234.56')).toBe(1234.56)
  })

  it('lit un entier avec milliers sans décimales', () => {
    expect(normalizeAmount('1.234')).toBe(1234)
  })

  it('rejette une chaîne non numérique', () => {
    expect(normalizeAmount('12,3,4')).toBeNull()
  })
})

describe('findPrices', () => {
  it('trouve un prix français avec devise après', () => {
    expect(findPrices('Total à payer : 59,99 €')).toEqual([59.99])
  })

  it('trouve un prix avec symbole avant', () => {
    expect(findPrices('Order total: $12.99')).toEqual([12.99])
  })

  it('trouve plusieurs prix dans une même ligne', () => {
    expect(findPrices('Avant : 100,00 € — Après : 90,00 €')).toEqual([100, 90])
  })

  it('ignore les nombres sans devise', () => {
    expect(findPrices('Article 42, quantité 3')).toEqual([])
  })

  it('ne prend PAS « eur » à l’intérieur d’un mot pour une devise (régression \\b + casse)', () => {
    expect(findPrices('Meilleur 3 choix disponibles')).toEqual([])
  })

  it('ignore un code devise en minuscules (prose)', () => {
    expect(findPrices('environ 40 eur selon la source')).toEqual([])
  })

  it('reconnaît toujours un code devise ISO en majuscules', () => {
    expect(findPrices('USD 12.99')).toEqual([12.99])
  })
})

describe('containsFailureMessage / containsSuccessMessage — robustesse (anti-ReDoS)', () => {
  it('reste rapide et sans faux positif sur un très long texte hostile', () => {
    const hostile = 'code ' + ' '.repeat(50000) + 'x'
    const start = performance.now()
    expect(containsFailureMessage(hostile)).toBe(false)
    expect(containsSuccessMessage(hostile)).toBe(false)
    expect(performance.now() - start).toBeLessThan(50) // linéaire, pas de gel
  })
})

describe('isTotalContext', () => {
  it.each(['Total', 'total à payer', 'Sous-total', 'Order Total', 'Montant dû'])(
    'reconnaît « %s »',
    (context) => {
      expect(isTotalContext(context)).toBe(true)
    },
  )

  it('rejette un contexte sans rapport', () => {
    expect(isTotalContext('frais de livraison estimés')).toBe(false)
  })
})

describe('containsFailureMessage', () => {
  it.each([
    'Code promo invalide.',
    'Ce coupon a expiré',
    'Code incorrect, veuillez réessayer',
    'This coupon is invalid',
    'Code expired',
  ])('détecte « %s »', (message) => {
    expect(containsFailureMessage(message)).toBe(true)
  })

  it('ne se déclenche pas sur un texte neutre', () => {
    expect(containsFailureMessage('Votre panier contient 3 articles')).toBe(false)
  })
})

describe('containsSuccessMessage', () => {
  it.each(['Code promo appliqué !', 'Réduction appliquée', 'Coupon applied successfully'])(
    'détecte « %s »',
    (message) => {
      expect(containsSuccessMessage(message)).toBe(true)
    },
  )

  it('ne se déclenche pas sur un texte neutre', () => {
    expect(containsSuccessMessage('Appliquer')).toBe(false)
  })
})

describe('priceDropped', () => {
  it('détecte une baisse du total', () => {
    expect(
      priceDropped({ total: 59.99, maxPrice: 59.99 }, { total: 53.99, maxPrice: 59.99 }),
    ).toBe(true)
  })

  it('retombe sur le prix max quand aucun total n’est identifié', () => {
    expect(priceDropped({ total: null, maxPrice: 100 }, { total: null, maxPrice: 90 })).toBe(true)
  })

  it('ignore le bruit d’arrondi sub-centime', () => {
    expect(
      priceDropped({ total: 59.99, maxPrice: 59.99 }, { total: 59.988, maxPrice: 59.99 }),
    ).toBe(false)
  })

  it('ne signale rien quand le prix monte ou stagne', () => {
    expect(priceDropped({ total: 50, maxPrice: 50 }, { total: 50, maxPrice: 50 })).toBe(false)
    expect(priceDropped({ total: 50, maxPrice: 50 }, { total: 55, maxPrice: 55 })).toBe(false)
  })

  it('reste muet quand une photographie est vide', () => {
    expect(priceDropped({ total: null, maxPrice: null }, { total: 10, maxPrice: 10 })).toBe(false)
  })
})
