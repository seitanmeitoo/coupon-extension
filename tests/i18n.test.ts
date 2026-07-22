// Tests du wrapper i18n : en environnement de test, chrome.i18n est absent,
// donc t() lit le catalogue français importé (source unique de vérité).
import { describe, expect, it } from 'vitest'
import { t } from '../src/lib/i18n'

describe('t (i18n)', () => {
  it('renvoie le message français d’une clé statique', () => {
    expect(t('appTitle')).toBe('Chasseur de Coupons')
  })

  it('interpole les marqueurs {nom}', () => {
    expect(t('successRate', { percent: 80 })).toBe('80 % de réussite')
    expect(t('emptyWithDomain', { domain: 'boutique.fr' })).toContain('boutique.fr')
  })

  it('laisse les marqueurs non fournis intacts', () => {
    expect(t('couponsForSite')).toBe('{count} code(s) pour ce site')
  })

  it('renvoie la clé pour une entrée inconnue (jamais de crash)', () => {
    // @ts-expect-error clé volontairement invalide
    expect(t('cleQuiNexistePas')).toBe('cleQuiNexistePas')
  })
})
