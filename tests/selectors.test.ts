// @vitest-environment jsdom
// Tests de la détection par domaine et par plateforme e-commerce.
import { beforeEach, describe, expect, it } from 'vitest'
import { detectPlatform, selectorsForDomain, selectorsForPlatform } from '../src/content/selectors'
import { findCouponInput } from '../src/content/detect'

beforeEach(() => {
  document.body.className = ''
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('selectorsForDomain', () => {
  it('renvoie les sélecteurs connus pour un domaine référencé', () => {
    expect(selectorsForDomain('zalando.fr')?.field).toContain('voucher')
  })

  it('renvoie null pour un domaine inconnu', () => {
    expect(selectorsForDomain('site-inconnu.xyz')).toBeNull()
  })
})

describe('detectPlatform', () => {
  it('reconnaît WooCommerce via la classe body', () => {
    document.body.className = 'woocommerce-checkout'
    expect(detectPlatform()).toBe('woocommerce')
  })

  it('reconnaît Shopify via un script CDN', () => {
    const s = document.createElement('script')
    s.src = 'https://cdn.shopify.com/s/files/app.js'
    document.head.appendChild(s)
    expect(detectPlatform()).toBe('shopify')
  })

  it('reconnaît PrestaShop via le bouton d’ajout de remise', () => {
    document.body.innerHTML = '<button name="submitAddDiscount">Ajouter</button>'
    expect(detectPlatform()).toBe('prestashop')
  })

  it('renvoie null sur une page quelconque', () => {
    document.body.innerHTML = '<div>rien de spécial</div>'
    expect(detectPlatform()).toBeNull()
    expect(selectorsForPlatform()).toBeNull()
  })
})

describe('findCouponInput — cascade domaine → plateforme → heuristique', () => {
  it('le sélecteur WooCommerce (#coupon_code) est prioritaire sur le scoring', () => {
    document.body.className = 'woocommerce'
    document.body.innerHTML = `
      <input type="text" name="autre" placeholder="promo bidon" />
      <input type="text" id="coupon_code" name="coupon_code" />
    `
    expect(findCouponInput(document)?.id).toBe('coupon_code')
  })

  it('le sélecteur spécifique au domaine est prioritaire', () => {
    document.body.innerHTML = `<input type="text" name="voucherCode" id="cible" />`
    expect(findCouponInput(document, 'zalando.fr')?.id).toBe('cible')
  })

  it('retombe sur les heuristiques quand ni domaine ni plateforme ne matchent', () => {
    document.body.innerHTML = `<input type="text" name="coupon_code_generic" placeholder="Code promo" />`
    expect(findCouponInput(document, 'site-inconnu.xyz')).not.toBeNull()
  })
})
