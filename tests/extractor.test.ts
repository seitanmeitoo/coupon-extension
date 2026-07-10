// Tests de l'extracteur regex du Tier 2 (pas de DOMParser en service worker).
import { describe, expect, it } from 'vitest'
import { extractCodesFromHtml } from '../src/background/extractor'

describe('extractCodesFromHtml', () => {
  it('extrait un code proche d’un mot-clé « code / coupon / promo »', () => {
    const html = '<div class="offer">Utilisez le code <strong>SOLDES25</strong> en caisse</div>'
    expect(extractCodesFromHtml(html)).toEqual(['SOLDES25'])
  })

  it('extrait plusieurs codes en préservant l’ordre et sans doublon', () => {
    const html = `
      <li>Coupon : <span>PROMO10A</span></li>
      <li>Coupon : <span>NOEL2026</span></li>
      <li>Coupon : <span>PROMO10A</span></li>
    `
    expect(extractCodesFromHtml(html)).toEqual(['PROMO10A', 'NOEL2026'])
  })

  it('ignore les tokens sans contexte de mot-clé', () => {
    const html = '<p>Livraison GRATUITE dès 49 € — référence ABC123XYZ sans rapport</p>'
    expect(extractCodesFromHtml(html)).toEqual([])
  })

  it('filtre la liste noire des constantes techniques', () => {
    const html = 'Le code HTML5 de la page… coupon code "HTTPS" invalide'
    expect(extractCodesFromHtml(html)).toEqual([])
  })

  it('ignore le contenu des blocs <script> et <style>', () => {
    const html = `
      <script>var promoCode = "FAKE1234";</script>
      <style>.promo-code::after { content: "CSS99"; }</style>
      <p>Aucun vrai code ici</p>
    `
    expect(extractCodesFromHtml(html)).toEqual([])
  })

  it('rejette les tokens tout-lettres trop courts (bruit d’attributs)', () => {
    const html = 'code promo "ABCD" — trop court pour être crédible sans chiffre'
    expect(extractCodesFromHtml(html)).toEqual([])
  })

  it('accepte les tokens tout-lettres de longueur plausible', () => {
    const html = 'Entrez le coupon "BIENVENUE" à la caisse'
    expect(extractCodesFromHtml(html)).toEqual(['BIENVENUE'])
  })

  it('plafonne le nombre de codes retournés', () => {
    const items = Array.from({ length: 20 }, (_, i) => `code : CODE${100 + i}`).join('<br>')
    expect(extractCodesFromHtml(items, 10)).toHaveLength(10)
  })
})
