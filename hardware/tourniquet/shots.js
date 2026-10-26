// Rend la vue 3D en images pour le dossier : vues générales, mécanisme, coupe, montage pas à pas, simulation.
// Usage : node shots.js <dossier contenant tourniquet-3d.html>
const { chromium } = require('playwright-core')
const path = require('path')
const dir = process.argv[2]
;(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: 'light' })
  const html = require('fs').readFileSync(path.join(dir, 'tourniquet-3d.html'), 'utf8')
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>', { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.tourniquet)
  await p.addStyleTag({ content: '.tools, .hint, .caption { display: none !important }' })
  const shot = async (name, fn) => {
    await p.evaluate(fn)
    await p.waitForTimeout(900)
    await p.locator('.stage').screenshot({ path: path.join(dir, name + '.png') })
  }
  await shot('3d-perspective', () => { tourniquet.setView('iso'); tourniquet.setExploded(false, true); tourniquet.setSkin(false) })
  await shot('3d-eclate', () => { tourniquet.setView('iso'); tourniquet.setExploded(true, true) })
  await shot('3d-transparence', () => { tourniquet.setView('iso'); tourniquet.setExploded(false, true); tourniquet.setSkin(true) })
  await shot('3d-face', () => { tourniquet.setView('face'); tourniquet.setSkin(false) })
  await shot('3d-bout', () => { tourniquet.setView('cote') })

  // Images « arrêt sur image » tirées du mode film (sans légende : elles sont écrites dans le dossier).
  await p.setViewportSize({ width: 1200, height: 800 })
  const segs = [
    ...Array.from({ length: 9 }, (_, i) => ({ kind: 'step', i: i + 1, dur: 6, orbit: 0 })),
    { kind: 'cut', cam: 'coupe', cut: true, skin: true, orbit: 0, dur: 6 },
    { kind: 'pass', cam: 'meca', skin: true, orbit: 0, dur: 11.8 },
    { kind: 'cut', cam: 'fixcarter', skin: true, fix: true, orbit: 0, dur: 4, title: '' },
    { kind: 'cut', cam: 'fixcarter2', skin: true, fix: true, orbit: 0, dur: 4, title: '' },
    { kind: 'cut', cam: 'socle', skin: true, fix: true, orbit: 0, dur: 4, title: '' },
    { kind: 'cut', cam: 'filetage', skin: true, thr: true, orbit: 0, dur: 4, title: '' },
  ]
  await p.evaluate((s) => tourniquet.film(s), segs)
  const at = async (name, t) => {
    await p.evaluate((t) => tourniquet.filmAt(t), t)
    await p.waitForTimeout(150)
    await p.screenshot({ path: path.join(dir, name + '.png') })
  }
  for (let i = 0; i < 9; i++) await at(`montage-${i + 1}`, i * 6 + 5.5)
  await at('3d-coupe', 54 + 3)
  const t0 = 60
  await at('sim-1', t0 + 1.7)
  await at('sim-2', t0 + 0.4 + 2.9)
  await at('sim-3', t0 + 0.4 + 5.2)
  await at('sim-4', t0 + 0.4 + 8.0)
  await at('fix-carter', 71.8 + 3)
  await at('fix-meca', 75.8 + 3)
  await at('fix-socle', 79.8 + 3)
  await at('fil-zoom', 83.8 + 3)
  await b.close()
})()
