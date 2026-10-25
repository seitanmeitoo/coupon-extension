# 🎟️ Chasseur de Coupons — extension Chrome « vie privée d'abord »

Extension de navigateur (**Manifest V3**) qui trouve et applique automatiquement des codes promo au moment du paiement — une alternative respectueuse de la vie privée aux applications type Honey. Construite en **React + TypeScript + Tailwind CSS**, compilée avec **Vite**.

> **Projet archivé — usage personnel / expérimental.** Ce projet a été entièrement « vibe coded » et n'a pas été complètement vérifié. Le code est partagé tel quel, sans garantie de fonctionnement, de sécurité ou de compatibilité. Il n'est plus maintenu activement.

Le projet est distribué sous licence **MIT**. Voir [`LICENSE`](LICENSE).

## Architecture hybride à 3 niveaux

Le moteur de sourcing des coupons interroge trois sources, de la plus fiable à la plus opportuniste :

| Niveau | Source | Fichier | Fonctionnement |
|---|---|---|---|
| **Tier 1** | Base open-source | `src/background/tiers/tier1-community.ts` | Récupère un flux JSON depuis des URLs GitHub brutes **en cascade** — d'abord le flux **auto-hébergé** dans ce dépôt (`data/coupons.json`, aucune dépendance tierce), puis un flux communautaire externe en repli — et le stocke dans `chrome.storage.local`. En cas d'échec réseau total, un flux embarqué (`src/mocks/coupons.json`) prend le relais : l'extension fonctionne hors-ligne dès l'installation. Rafraîchissement automatique toutes les 6 h via `chrome.alarms`. |
| **Tier 2** | Scraping localisé | `src/background/tiers/tier2-scraper.ts` | Si le Tier 1 ne connaît pas le domaine actif, récupère la page d'un annuaire public de coupons et en extrait les codes **par regex** (`src/background/extractor.ts`) — les service workers MV3 n'ont pas de `DOMParser`. Refroidissement de 6 h par domaine. |
| **Tier 3** | Crowdsourcing éthique | `src/api/crowdsource.ts` | Quand un code **tapé à la main** par l'utilisateur fait baisser le prix, il est proposé à la communauté via un `POST` **strictement anonyme** : `{ domain, code, success }` — rien d'autre, jamais. Soumis à un opt-in explicite, désactivé par défaut. |

### Vie privée — les garanties

- **Opt-in explicite** : aucun partage communautaire tant que l'interrupteur « Partage communautaire anonyme » (onglet Réglages) n'est pas activé. Il est **désactivé par défaut**.
- **Payload minimal** : le Tier 3 transmet exactement trois champs — `domain`, `code`, `success`. Pas d'identifiant, pas de cookie (`credentials: 'omit'`), pas d'empreinte navigateur, pas d'historique.
- **Préférences locales** : les réglages vivent dans `chrome.storage.local` (et non `sync`) — ils ne transitent pas par votre compte Google.
- **Statistiques locales** : les compteurs affichés dans le popup ne quittent jamais votre appareil.
- **Recherche de coupons (Tiers 1 & 2)** : le Tier 1 lit un flux public GitHub (aucune donnée vous concernant). Le Tier 2 n'est déclenché **que lorsqu'un vrai champ « code promo » est détecté** sur une page de paiement — jamais à la simple ouverture du popup — et transmet alors le **nom du site visité** (le domaine) à un annuaire public pour y chercher des codes. Aucun identifiant personnel n'accompagne cette requête (`credentials: 'omit'`). Pour désactiver totalement toute requête sortante, il suffit de retirer les URLs de `src/config/index.ts`.
- **Mode simulation** : `MOCK_CROWDSOURCE = true` dans `src/config/index.ts` — aucun envoi réseau du Tier 3 tant que vous n'avez pas configuré votre propre backend (`CROWDSOURCE_ENDPOINT`, REST type Supabase).

## Fonctionnement du content script

`src/content/inject.ts` orchestre, sur chaque page marchande :

1. **Détection** (`detect.ts` + `selectors.ts`) — cascade **sélecteur spécifique au domaine → plateforme e-commerce détectée (Shopify, WooCommerce, Magento, PrestaShop, via marqueurs DOM) → heuristiques bilingues FR/EN** (attributs `name`/`id`/`placeholder`/`aria-label`/`label`), avec re-scan sur mutation pour les caisses chargées tardivement (SPA).
2. **Injection** (`applier.ts`) — écriture via le setter natif de `HTMLInputElement` + événements `bubbles` pour réveiller React/Vue, puis clic sur le bouton « Appliquer ».
3. **Verdict** (`observer.ts` + `price.ts`) — un `MutationObserver` tranche : baisse du total (formats `1 234,56 €` comme `$12.99`) ou message de succès → **succès** ; message « code invalide / expiré » → **échec**, on essaie le code suivant.
4. **Crowdsourcing** — la distinction saisie **manuelle** / injection **programmatique** repose sur une double garde : `event.isTrusted` **et** un drapeau levé pendant toute injection. Seul un code réellement tapé par l'utilisateur, dont le succès est observé, est proposé au partage (si opt-in).

## Structure du projet

```
├── public/manifest.json         # MV3 : storage, activeTab, declarativeContent, scripting, alarms
├── public/_locales/fr/          # Catalogue i18n (messages.json) — default_locale = fr
├── data/coupons.json            # Flux Tier 1 auto-hébergé (source primaire, curé)
├── index.html                   # Entrée du popup (lang="fr")
├── src/
│   ├── background/              # Service worker : routeur, tiers 1-2, alarme, badge
│   ├── content/                 # Content script : détection, sélecteurs, injection, observation
│   ├── popup/                   # UI React + Tailwind (onglets Coupons / Historique / Réglages)
│   ├── api/crowdsource.ts       # Tier 3 : POST anonyme (mode mock par défaut)
│   ├── lib/                     # storage, migrations, messaging, i18n, domaine
│   ├── config/                  # Toutes les URLs externes, auditables en un coup d'œil
│   ├── mocks/coupons.json       # Flux embarqué (repli hors-ligne)
│   └── types/                   # Coupon, StorageSchema versionné, HistoryEntry…
├── tests/                       # 104 tests unitaires (vitest)
└── scripts/                     # Smoke test Playwright + boutique de démonstration
```

Le popup affiche la **provenance de chaque coupon** par un badge : « Source : Base communautaire », « Source : Web scrapé » ou « Source : Crowdsourcé ».

## Fonctionnalités de la v2

- **Autonomie des données** : flux Tier 1 auto-hébergé (`data/coupons.json`) en source primaire, rafraîchi automatiquement toutes les 6 h (`chrome.alarms`), avec repli hors-ligne embarqué.
- **Détection fiabilisée** : base de sélecteurs par domaine et détection de plateforme (Shopify, WooCommerce, Magento, PrestaShop), en amont des heuristiques génériques.
- **Économies visibles** : le montant économisé (baisse de prix constatée) est mesuré, cumulé (`stats.savedTotal`) et affiché ; chaque application alimente un **onglet Historique** local.
- **Badge d'icône** : le nombre de coupons disponibles s'affiche en pastille sur l'icône de l'onglet actif (sans permission supplémentaire).
- **Internationalisation** : toutes les chaînes du popup passent par `chrome.i18n` (`public/_locales/fr/messages.json`) — ajouter une langue = déposer un `_locales/<lang>/messages.json`.
- **Robustesse du stockage** : schéma **versionné** avec migrations idempotentes (`src/lib/migrations.ts`), et **péremption/purge** des coupons (`expiresAt`, plafond par domaine).

Compatibilité : Chrome et Edge (Manifest V3). Le portage Firefox (via `webextension-polyfill`) n'est pas inclus dans cette version.

## Installation et développement

```bash
npm install
npm run build        # tsc --noEmit + 2 passes Vite → dist/
```

Le build se fait en **deux passes** : d'abord le popup et le service worker (modules ES), puis le content script en **IIFE autonome** (`dist/content.js`) — un content script MV3 déclaré au manifest ne peut pas être un module ES.

**Charger l'extension dans Chrome :**

1. Ouvrez `chrome://extensions`.
2. Activez le « Mode développeur » (en haut à droite).
3. Cliquez sur « Charger l'extension non empaquetée » et sélectionnez le dossier `dist/`.

> Le manifest inclut `http://localhost/*` dans les `matches` du content script : uniquement pour la boutique de démonstration locale du smoke test. Retirez-le pour une publication.

## Tests

```bash
npm test             # 104 tests unitaires : extracteur regex, prix FR/EN, détection
                     # des champs et sélecteurs (jsdom), domaine, stockage, migrations, i18n
npm run smoke        # Bout en bout (6 étapes) : charge dist/ dans Chromium headless,
                     # vérifie le popup i18n, l'opt-in, l'application automatique, la
                     # chaîne saisie manuelle → Tier 3, les économies, l'historique et le badge
```

Le smoke test lance une boutique factice (`scripts/fixtures/checkout.html`, total `59,99 €`, champ « Code promo ») et vérifie notamment que la **frappe humaine simulée** (événements `isTrusted`) déclenche bien le partage communautaire en mode mock, tandis que les injections automatiques ne le déclenchent jamais.

## Configuration

Tout est centralisé dans `src/config/index.ts` :

- `TIER1_SOURCES` — URLs des flux JSON en cascade (auto-hébergé `data/coupons.json` puis flux tiers).
- `TIER1_REFRESH_ALARM` / `TIER1_REFRESH_PERIOD_MIN` — rafraîchissement périodique (`chrome.alarms`).
- `tier2DirectoryUrl(domain)` — gabarit d'URL de l'annuaire public à scraper.
- `CROWDSOURCE_ENDPOINT` / `MOCK_CROWDSOURCE` — backend du Tier 3 (placeholder + mode simulation).
- `TIER1_TTL_MS`, `FETCH_TIMEOUT_MS`, `TIER2_MAX_CODES` — réglages de fraîcheur et de prudence.

Pour **enrichir la base de coupons sans dépendre d'un tiers**, éditez `data/coupons.json` (format `{ "domaine.com": [{ code, description, successRate }] }`). Pour **activer le Tier 3 réel**, renseignez `CROWDSOURCE_ENDPOINT` et passez `MOCK_CROWDSOURCE` à `false`.
