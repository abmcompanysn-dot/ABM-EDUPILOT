// Imprime out/dossier.html en PDF A3 paysage et rend chaque page en PNG pour contrôle.
const { chromium } = require('playwright-core')
const path = require('path')
const { pathToFileURL } = require('url')
const [dir, pdf, previews] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch({ channel: 'msedge' })
  const p = await b.newPage({ viewport: { width: 1587, height: 1123 } })
  await p.goto(pathToFileURL(path.join(dir, 'dossier.html')).href, { waitUntil: 'networkidle' })
  await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true })
  if (previews) {
    const n = await p.locator('section.page').count()
    for (let i = 0; i < n; i++) await p.locator('section.page').nth(i).screenshot({ path: path.join(previews, `page-${String(i + 1).padStart(2, '0')}.png`) })
  }
  await b.close()
})()
