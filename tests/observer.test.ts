// @vitest-environment jsdom
// Régression : un sous-total inchangé ne doit plus masquer la baisse du total.
import { beforeEach, describe, expect, it } from 'vitest'
import { priceDropped, snapshotPrices } from '../src/content/observer'

beforeEach(() => {
  document.body.innerHTML = ''
})

/** Construit une caisse avec un sous-total (fixe) et un total à payer (variable). */
function renderCart(totalText: string): void {
  document.body.innerHTML = `
    <div class="cart-subtotal"><span>Sous-total</span><span>59,99 €</span></div>
    <div class="cart-shipping"><span>Livraison</span><span>0,00 €</span></div>
    <div class="order-total"><span>Total à payer</span><span id="total">${totalText}</span></div>
  `
}

describe('snapshotPrices — sous-total vs total à payer', () => {
  it('retient le TOTAL À PAYER et ignore le sous-total plus élevé', () => {
    renderCart('59,99 €')
    const snap = snapshotPrices()
    expect(snap.total).toBe(59.99)
  })

  it('détecte la baisse du total même si le sous-total reste identique', () => {
    renderCart('59,99 €')
    const before = snapshotPrices()
    // Application d'une remise : seul le total à payer change.
    document.getElementById('total')!.textContent = '53,99 €'
    const after = snapshotPrices()
    expect(priceDropped(before, after)).toBe(true)
  })
})
