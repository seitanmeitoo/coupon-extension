# 🎟️ Chasseur de Coupons — extension Chrome « vie privée d'abord »

Extension de navigateur (**Manifest V3**) qui trouve et applique automatiquement des codes promo au moment du paiement — une alternative respectueuse de la vie privée aux applications type Honey. Construite en **React + TypeScript + Tailwind CSS**, compilée avec **Vite**.

## Architecture hybride à 3 niveaux

Le moteur de sourcing des coupons interroge trois sources, de la plus fiable à la plus opportuniste :

| Niveau | Source | Fichier | Fonctionnement |
|---|---|---|---|
| **Tier 1** | Base open-source | `src/background/tiers/tier1-community.ts` | Récupère un flux JSON depuis des URLs GitHub brutes (format du dépôt public `fityanos/coupon-feed`) et le stocke dans `chrome.storage.local`. En cas d'échec réseau, un flux simulé embarqué (`src/mocks/coupons.json`) sert de repli : l'extension fonctionne hors-ligne dès l'installation. |
| **Tier 2** | Scraping localisé | `src/background/tiers/tier2-scraper.ts` | Si le Tier 1 ne connaît pas le domaine actif, récupère la page d'un annuaire public de coupons et en extrait les codes **par regex** (`src/background/extractor.ts`) — les service workers MV3 n'ont pas de `DOMParser`. Refroidissement de 6 h par domaine. |
| **Tier 3** | Crowdsourcing éthique | `src/api/crowdsource.ts` | Quand un code **tapé à la main** par l'utilisateur fait baisser le prix, il est proposé à la communauté via un `POST` **strictement anonyme** : `{ domain, code, success }` — rien d'autre, jamais. Soumis à un opt-in explicite, désactivé par défaut. |

### Vie privée — les garanties

- **Opt-in explicite** : aucun partage communautaire tant que l'interrupteur « Partage communautaire anonyme » (onglet Réglages) n'est pas activé. Il est **désactivé par défaut**.
- **Payload minimal** : le Tier 3 transmet exactement trois champs — `domain`, `code`, `success`. Pas d'identifiant, pas de cookie (`credentials: 'omit'`), pas d'empreinte navigateur, pas d'historique.
- **Préférences locales** : les réglages vivent dans `chrome.storage.local` (et non `sync`) — ils ne transitent pas par votre compte Google.
- **Statistiques locales** : les compteurs affichés dans le popup ne quittent jamais votre appareil.
- Les fetchs des Tiers 1 et 2 (flux GitHub, annuaire public) ne contiennent **aucune donnée utilisateur** — ce sont de simples lectures publiques, sans cookies.
- **Mode simulation** : `MOCK_CROWDSOURCE = true` dans `src/config/index.ts` — aucun envoi réseau du Tier 3 tant que vous n'avez pas configuré votre propre backend (`CROWDSOURCE_ENDPOINT`, REST type Supabase).

## Fonctionnement du content script

`src/content/inject.ts` orchestre, sur chaque page marchande :

1. **Détection** (`detect.ts`) — heuristiques bilingues FR/EN (attributs `name`/`id`/`placeholder`/`aria-label`/`label` : « code promo », « coupon », « rabais », « réduction », « discount », « voucher »…), avec re-scan sur mutation pour les caisses chargées tardivement (SPA).
2. **Injection** (`applier.ts`) — écriture via le setter natif de `HTMLInputElement` + événements `bubbles` pour réveiller React/Vue, puis clic sur le bouton « Appliquer ».
3. **Verdict** (`observer.ts` + `price.ts`) — un `MutationObserver` tranche : baisse du total (formats `1 234,56 €` comme `$12.99`) ou message de succès → **succès** ; message « code invalide / expiré » → **échec**, on essaie le code suivant.
4. **Crowdsourcing** — la distinction saisie **manuelle** / injection **programmatique** repose sur une double garde : `event.isTrusted` **et** un drapeau levé pendant toute injection. Seul un code réellement tapé par l'utilisateur, dont le succès est observé, est proposé au partage (si opt-in).

## Structure du projet

```
├── public/manifest.json         # MV3 : storage, activeTab, declarativeContent, scripting
├── index.html                   # Entrée du popup (lang="fr")
├── src/
│   ├── background/              # Service worker : routeur de messages + tiers 1-2
│   ├── content/                 # Content script : détection, injection, observation
│   ├── popup/                   # UI React + Tailwind (onglets Coupons / Réglages)
│   ├── api/crowdsource.ts       # Tier 3 : POST anonyme (mode mock par défaut)
│   ├── lib/                     # storage, messaging (unions discriminées), domaine
│   ├── config/                  # Toutes les URLs externes, auditables en un coup d'œil
│   ├── mocks/coupons.json       # Flux communautaire simulé (repli hors-ligne)
│   └── types/                   # Coupon { source: community | scraped | crowdsourced }…
├── tests/                       # 67 tests unitaires (vitest)
└── scripts/                     # Smoke test Playwright + boutique de démonstration
```

Le popup affiche la **provenance de chaque coupon** par un badge : « Source : Base communautaire », « Source : Web scrapé » ou « Source : Crowdsourcé ».

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
npm test             # 67 tests unitaires : extracteur regex, prix FR/EN, détection
                     # des champs (jsdom), normalisation de domaine, stockage
npm run smoke        # Bout en bout : charge dist/ dans Chromium headless, vérifie
                     # le popup français, l'opt-in, l'application automatique d'un
                     # code (baisse de prix) et la chaîne saisie manuelle → Tier 3
```

Le smoke test lance une boutique factice (`scripts/fixtures/checkout.html`, total `59,99 €`, champ « Code promo ») et vérifie notamment que la **frappe humaine simulée** (événements `isTrusted`) déclenche bien le partage communautaire en mode mock, tandis que les injections automatiques ne le déclenchent jamais.

## Configuration

Tout est centralisé dans `src/config/index.ts` :

- `TIER1_SOURCES` — URLs des flux JSON open-source (GitHub brut).
- `tier2DirectoryUrl(domain)` — gabarit d'URL de l'annuaire public à scraper.
- `CROWDSOURCE_ENDPOINT` / `MOCK_CROWDSOURCE` — backend du Tier 3 (placeholder + mode simulation).
- `TIER1_TTL_MS`, `FETCH_TIMEOUT_MS`, `TIER2_MAX_CODES` — réglages de fraîcheur et de prudence.
