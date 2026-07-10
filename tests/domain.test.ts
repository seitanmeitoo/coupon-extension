// Tests de la normalisation de domaine.
import { describe, expect, it } from 'vitest'
import { domainFromUrl, normalizeDomain } from '../src/lib/domain'

describe('normalizeDomain', () => {
  it('passe en minuscules et retire le préfixe www.', () => {
    expect(normalizeDomain('WWW.Boutique.FR')).toBe('boutique.fr')
  })

  it('retire le point final DNS et les espaces parasites', () => {
    expect(normalizeDomain('  exemple.com.  ')).toBe('exemple.com')
  })

  it('conserve les sous-domaines non triviaux', () => {
    expect(normalizeDomain('shop.exemple.fr')).toBe('shop.exemple.fr')
  })

  it('laisse localhost inchangé', () => {
    expect(normalizeDomain('localhost')).toBe('localhost')
  })
})

describe('domainFromUrl', () => {
  it('extrait le domaine normalisé d’une URL https', () => {
    expect(domainFromUrl('https://www.Amazon.fr/panier?ref=x')).toBe('amazon.fr')
  })

  it('accepte http (page de démonstration locale)', () => {
    expect(domainFromUrl('http://localhost:5173/checkout.html')).toBe('localhost')
  })

  it('rejette les URLs non web (chrome://, about:)', () => {
    expect(domainFromUrl('chrome://extensions')).toBeNull()
    expect(domainFromUrl('about:blank')).toBeNull()
  })

  it('rejette les chaînes invalides', () => {
    expect(domainFromUrl('pas une url')).toBeNull()
  })
})
