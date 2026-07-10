// Smoke test de bout en bout : charge dist/ comme extension non empaquetée
// dans Chromium (headless) et vérifie les parcours critiques :
//   1. artefacts du build corrects (manifest, worker ESM, content script IIFE) ;
//   2. popup React en français + activation de l'opt-in de partage ;
//   3. application AUTOMATIQUE d'un code connu (baisse de prix détectée) ;
//   4. saisie MANUELLE d'un code inconnu → partage anonyme (Tier 3, mode mock).
//
// Prérequis : `npm run build`. Lancement : `npm run smoke`.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

let failures = 0
function check(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ÉCHEC : ${label}`)
  }
}

/* ------------------------------------------------------------------ */
/* 1. Vérifications statiques du build                                  */
/* ------------------------------------------------------------------ */

console.log('\n[1/4] Artefacts du build')
for (const artefact of ['manifest.json', 'index.html', 'worker.js', 'content.js']) {
  check(existsSync(join(DIST, artefact)), `dist/${artefact} présent`)
}
if (failures > 0) {
  console.error('\nBuild incomplet — lancez d’abord : npm run build')
  process.exit(1)
}
const contentJs = readFileSync(join(DIST, 'content.js'), 'utf8')
check(contentJs.trimStart().startsWith('(function'), 'content.js est une IIFE')
check(!/^\s*import\s/m.test(contentJs), 'content.js sans import ES top-level')
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
check(manifest.manifest_version === 3, 'manifest_version 3')
check(
  ['storage', 'activeTab', 'declarativeContent', 'scripting'].every((p) =>
    manifest.permissions.includes(p),
  ),
  'permissions demandées par le cahier des charges',
)

/* ------------------------------------------------------------------ */
/* Serveur local pour la boutique de démonstration                      */
/* ------------------------------------------------------------------ */

const fixture = readFileSync(join(ROOT, 'scripts', 'fixtures', 'checkout.html'))
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(fixture)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
// Le content script est déclaré sur http://localhost/* : on passe par ce nom d'hôte.
const PORT = server.address().port
const SHOP = `http://localhost:${PORT}/checkout.html`

/* ------------------------------------------------------------------ */
/* Lancement de Chromium avec l'extension                               */
/* ------------------------------------------------------------------ */

const userDataDir = mkdtempSync(join(tmpdir(), 'coupon-ext-'))
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
  ],
})

try {
  // Identifiant d'extension via l'URL du service worker.
  let [worker] = context.serviceWorkers()
  if (worker === undefined) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  }
  const extensionId = new URL(worker.url()).hostname
  console.log(`\nExtension chargée : ${extensionId}`)

  /* ---------------- 2. Popup en français + opt-in ------------------ */
  console.log('\n[2/4] Popup (français) et opt-in de partage')
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/index.html`)
  await popup.waitForSelector('text=Chasseur de Coupons', { timeout: 10000 })
  check(true, 'titre « Chasseur de Coupons » affiché')
  check(
    (await popup.textContent('body')).includes('Réglages'),
    'onglet « Réglages » présent',
  )

  await popup.click('text=Réglages')
  await popup.waitForSelector('text=Partage communautaire anonyme')
  check(true, 'réglage « Partage communautaire anonyme » affiché')
  check(
    (await popup.textContent('body')).includes('Partage désactivé (par défaut)'),
    'opt-in désactivé par défaut (vie privée d’abord)',
  )

  await popup.click('[role="switch"]')
  await popup.waitForTimeout(300)
  const settings = await popup.evaluate(() => chrome.storage.local.get('settings'))
  check(settings.settings?.crowdsourceOptIn === true, 'opt-in persisté dans chrome.storage.local')

  /* ---------------- 3. Application automatique --------------------- */
  console.log('\n[3/4] Application automatique d’un code connu')
  const shop = await context.newPage()
  shop.on('console', (msg) => {
    if (msg.text().includes('[Coupons]')) console.log(`    (page) ${msg.text()}`)
  })
  await shop.goto(SHOP)
  await shop.waitForFunction(
    () => document.getElementById('total')?.textContent?.includes('53,99'),
    { timeout: 20000 },
  )
  check(true, 'le prix total a baissé (59,99 € → 53,99 €)')
  const bodyText = await shop.textContent('body')
  check(bodyText.includes('BIENVENUE10'), 'le code gagnant est annoncé dans le toast')
  check(bodyText.includes('appliqué'), 'toast de succès en français')

  /* ---------------- 4. Saisie manuelle → Tier 3 -------------------- */
  console.log('\n[4/4] Saisie manuelle → crowdsourcing anonyme (mode mock)')
  const manual = await context.newPage()
  await manual.goto(`${SHOP}?valid=MANUEL5`)
  // Les codes connus échouent d'abord (BIENVENUE10 puis SOLDES2026).
  await manual.waitForFunction(
    () => document.body.innerText.includes('Aucun des codes connus'),
    { timeout: 30000 },
  )
  check(true, 'les codes connus ont été essayés puis écartés')

  // Frappe humaine simulée : événements « isTrusted » réels.
  await manual.click('#code-promo')
  await manual.keyboard.type('MANUEL5', { delay: 40 })
  await manual.click('#appliquer')

  await manual.waitForFunction(
    () => document.getElementById('total')?.textContent?.includes('53,99'),
    { timeout: 20000 },
  )
  check(true, 'le code tapé manuellement a fait baisser le prix')
  await manual.waitForFunction(
    () => document.body.innerText.includes('partagé anonymement'),
    { timeout: 20000 },
  )
  check(true, 'toast « partagé anonymement avec la communauté » affiché')

  const stored = await popup.evaluate(() => chrome.storage.local.get(['coupons', 'stats']))
  const localhostCoupons = stored.coupons?.localhost ?? []
  const manualCoupon = localhostCoupons.find((c) => c.code === 'MANUEL5')
  check(manualCoupon?.source === 'crowdsourced', 'code MANUEL5 mémorisé avec la source « crowdsourced »')
  check((stored.stats?.shared ?? 0) >= 1, 'compteur de partages anonymes incrémenté')
  check((stored.stats?.applied ?? 0) >= 2, 'compteur de codes appliqués incrémenté')
} finally {
  await context.close()
  server.close()
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n✗ Smoke test : ${failures} vérification(s) en échec.`)
  process.exit(1)
}
console.log('\n✓ Smoke test : tous les parcours critiques sont fonctionnels.')
