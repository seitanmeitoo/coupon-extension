// Sélecteurs ciblés par domaine et par plateforme e-commerce.
// Complètent (ne remplacent pas) les heuristiques génériques de detect.ts :
// la cascade est domaine spécifique → plateforme → heuristiques.

export interface DomainSelector {
  /** Sélecteur CSS du champ « code promo ». */
  field: string
  /** Sélecteur CSS du bouton « Appliquer » (optionnel). */
  button?: string
}

/**
 * Sélecteurs connus des grandes boutiques (clé = domaine normalisé, sans www.).
 * Table volontairement évolutive : à enrichir au fil des observations.
 */
export const DOMAIN_SELECTORS: Record<string, DomainSelector> = {
  'amazon.fr': {
    field: 'input#spc-gcpromoinput, input[name="ppw-claimCode"], input#gcpromoinput',
    button: '#gcApplyButtonId input, input[name="ppw-claimCode-announce"]',
  },
  'cdiscount.com': {
    // Pas de sélecteur de bouton : « button[type=submit] » viserait le premier
    // submit de la page (recherche d'en-tête, voire bouton de commande). On laisse
    // l'heuristique bornée de detect.ts trouver le bouton voisin du champ.
    field: 'input[name*="promo" i], input#voucherCode',
  },
  'fnac.com': {
    field: 'input[name*="coupon" i], input[id*="promo" i]',
  },
  'zalando.fr': {
    field: 'input[name="voucherCode"], input[id*="voucher" i]',
  },
  'asos.com': {
    field: 'input#promo-code-input, input[name*="promo" i]',
  },
}

export type Platform = 'shopify' | 'woocommerce' | 'magento' | 'prestashop'

/** Sélecteurs standard par plateforme (structure DOM stable d'une boutique à l'autre). */
const PLATFORM_SELECTORS: Record<Platform, DomainSelector> = {
  woocommerce: { field: 'input#coupon_code', button: 'button[name="apply_coupon"]' },
  shopify: {
    field: 'input#checkout_reduction_code, input[name="reductions"], input[name="discount"]',
    // Bouton ADJACENT au champ uniquement — surtout pas « checkout[submit] »
    // (le bouton « Payer maintenant » de toute la page).
    button: '#checkout_reduction_code + button',
  },
  magento: { field: 'input#coupon_code', button: '.action.apply, button.action-apply' },
  prestashop: { field: 'input[name="discount_name"], #promo-code input', button: 'button[name="submitAddDiscount"]' },
}

/**
 * Détecte la plateforme via des MARQUEURS DOM (le content script est en monde
 * isolé : pas d'accès à `window.Shopify`, on s'appuie donc sur des balises et
 * classes stables). Retourne `null` si aucune plateforme n'est reconnue.
 */
export function detectPlatform(root: ParentNode = document): Platform | null {
  if (root.querySelector('body.woocommerce, body.woocommerce-page, .woocommerce-checkout')) {
    return 'woocommerce'
  }
  if (
    root.querySelector(
      'link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"], meta[name="shopify-checkout-api-token"]',
    )
  ) {
    return 'shopify'
  }
  if (root.querySelector('[data-mage-init], script[src*="/mage/"], body[class*="checkout-index"]')) {
    return 'magento'
  }
  if (root.querySelector('[name="submitAddDiscount"], [name="discount_name"], #cart_voucher')) {
    return 'prestashop'
  }
  return null
}

/** Sélecteurs spécifiques au domaine, ou `null`. */
export function selectorsForDomain(domain: string): DomainSelector | null {
  return DOMAIN_SELECTORS[domain] ?? null
}

/** Sélecteurs de la plateforme détectée sur la page, ou `null`. */
export function selectorsForPlatform(root: ParentNode = document): DomainSelector | null {
  const platform = detectPlatform(root)
  return platform === null ? null : PLATFORM_SELECTORS[platform]
}
