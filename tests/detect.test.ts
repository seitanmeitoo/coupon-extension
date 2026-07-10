// @vitest-environment jsdom
// Tests des heuristiques de détection des champs « code promo » (FR + EN).
import { beforeEach, describe, expect, it } from 'vitest'
import { findApplyButton, findCouponInput, scoreInput } from '../src/content/detect'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('findCouponInput', () => {
  it('trouve un champ via le sélecteur rapide name*=coupon', () => {
    document.body.innerHTML = `
      <input type="text" name="email" />
      <input type="text" name="coupon_code" />
    `
    const input = findCouponInput()
    expect(input?.name).toBe('coupon_code')
  })

  it('trouve un champ français par placeholder « Code promo »', () => {
    document.body.innerHTML = `
      <input type="text" id="champ-mystere" placeholder="Code promo" />
    `
    const input = findCouponInput()
    expect(input?.id).toBe('champ-mystere')
  })

  it('trouve un champ via son <label for=…> en français', () => {
    document.body.innerHTML = `
      <label for="xyz">Bon de réduction</label>
      <input type="text" id="xyz" />
    `
    const input = findCouponInput()
    expect(input?.id).toBe('xyz')
  })

  it('ignore les champs cachés, désactivés ou non texte', () => {
    document.body.innerHTML = `
      <input type="hidden" name="coupon_token" />
      <input type="text" name="promo" disabled />
      <input type="email" name="coupon-email" />
    `
    expect(findCouponInput()).toBeNull()
  })

  it('retourne null sur une page sans champ pertinent', () => {
    document.body.innerHTML = `
      <input type="text" name="prenom" placeholder="Votre prénom" />
    `
    expect(findCouponInput()).toBeNull()
  })

  it('ne détecte PAS un champ carte cadeau comme champ coupon (vie privée)', () => {
    document.body.innerHTML = `
      <input type="text" name="gift-card" placeholder="Carte cadeau" />
    `
    expect(findCouponInput()).toBeNull()
  })
})

describe('scoreInput', () => {
  it('donne un meilleur score aux expressions complètes qu’aux mots isolés', () => {
    document.body.innerHTML = `
      <input type="text" id="a" placeholder="Code promo" />
      <input type="text" id="b" placeholder="promotion du moment" />
    `
    const a = document.getElementById('a') as HTMLInputElement
    const b = document.getElementById('b') as HTMLInputElement
    expect(scoreInput(a)).toBeGreaterThan(0)
    expect(scoreInput(b)).toBeGreaterThan(0)
    expect(scoreInput(a)).toBeGreaterThanOrEqual(scoreInput(b))
  })
})

describe('findApplyButton', () => {
  it('trouve le bouton « Appliquer » dans le même formulaire', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="coupon" />
        <button type="button">Appliquer</button>
      </form>
    `
    const input = findCouponInput()!
    expect(findApplyButton(input)?.textContent).toBe('Appliquer')
  })

  it('retombe sur l’unique bouton submit du formulaire, quel que soit son libellé', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="promo" />
        <button type="submit">→</button>
      </form>
    `
    const input = findCouponInput()!
    expect(findApplyButton(input)).not.toBeNull()
  })

  it('cherche dans les conteneurs ancêtres hors formulaire', () => {
    document.body.innerHTML = `
      <div class="coupon-box">
        <div><input type="text" name="coupon" /></div>
        <span role="button">Apply</span>
      </div>
    `
    const input = findCouponInput()!
    expect(findApplyButton(input)?.textContent).toBe('Apply')
  })

  it('retourne null quand rien ne ressemble à un bouton d’application', () => {
    document.body.innerHTML = `<div><input type="text" name="coupon" /></div>`
    const input = findCouponInput()!
    expect(findApplyButton(input)).toBeNull()
  })

  it('n’élit pas « Ajouter au panier » et préfère le vrai « OK » adjacent (frontières de mots)', () => {
    document.body.innerHTML = `
      <form>
        <button type="button">Ajouter au panier</button>
        <div class="coupon"><input type="text" name="coupon" /><button type="button">OK</button></div>
      </form>
    `
    const input = findCouponInput()!
    expect(findApplyButton(input)?.textContent).toBe('OK')
  })

  it('ne confond pas « Edit address » avec un bouton d’application (add ⊄ address)', () => {
    document.body.innerHTML = `
      <div class="coupon-box">
        <input type="text" name="coupon" />
        <button type="button">Edit address</button>
      </div>
    `
    const input = findCouponInput()!
    expect(findApplyButton(input)).toBeNull()
  })
})
