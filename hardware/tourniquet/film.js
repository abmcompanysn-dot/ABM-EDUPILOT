// Vidéo « du montage à la simulation » du tourniquet P1, tournée dans la vue 3D.
// Usage : node film.js <dossier de travail> [sortie.mp4] [--complet]   (playwright-core et ffmpeg ; voix Windows « Hortense »)
// Le dossier de travail doit contenir tourniquet-3d.html et design.json (et video_pieces.json pour --complet).
// --complet : chaque pièce présentée une à une, puis le montage, les détails et le fonctionnement au ralenti.
const { chromium } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const COMPLET = args.includes('--complet')
const pos = args.filter((a) => !a.startsWith('--'))
const dir = path.resolve(pos[0])
const out = pos[1] || path.join(dir, COMPLET ? 'Video_Tourniquet_P1_complete.mp4' : 'Video_Tourniquet_P1.mp4')
const FPS = 25, W = 1280, H = 720
const design = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'))

const segs = [
  { kind: 'intro', cam: 'proche', orbit: 24, min: 6, k: 'EduPilote · fabrication locale', title: 'Tourniquet tripode – prototype P1',
    text: 'Inox 316L, mécanisme à axe incliné, lecture de carte NFC et de QR code.',
    say: "Voici le prototype P1 du tourniquet EduPilote : un tripode en inox, fabriqué avec des artisans locaux, et relié directement à EduPilote. Regardons comment il se monte, puis comment il fonctionne." },
  ...design.steps.map((s, i) => ({ kind: 'step', i: i + 1, min: 6.5, say: `Étape ${i + 1}. ${s.title}. ${s.text}` })),
  { kind: 'cut', cam: 'coupe', cut: true, skin: true, orbit: 14, min: 7, title: 'Les roulements, vus en coupe',
    text: 'Deux roulements 6205 à 9 billes, arrêtés par un épaulement de l’axe et un épaulement du carter, serrés par l’écrou : aucun jeu.',
    say: "Vue en coupe : l'axe tourne dans deux roulements à neuf billes. Un épaulement de l'axe et un épaulement du carter les arrêtent, l'écrou serre l'ensemble : il n'y a aucun jeu." },
  { kind: 'refus', cam: 'meca', skin: true, orbit: 6, min: 8,
    say: "Si la carte est refusée, le voyant passe au rouge. L'étudiant peut pousser : la dent du cliquet reste dans le cran, et le bras ne tourne pas." },
  { kind: 'pass', cam: 'meca', skin: true, orbit: 6, min: 13,
    say: "Si la carte est valide et qu'il a cours, le voyant passe au vert et l'électroaimant soulève le cliquet. L'étudiant pousse le bras : le tripode tourne d'un tiers de tour, le galet passe d'un cran au suivant. Le cliquet retombe : un seul passage, compté par le capteur, et la présence est enregistrée." },
  { kind: 'pass', cam: 'proche', base: 120, orbit: 10, min: 12,
    say: "Vu de l'extérieur : un bras reste toujours à l'horizontale pour fermer le passage, et ne se dégage que pour la personne autorisée." },
  { kind: 'cut', cam: 'fixcarter', skin: true, fix: true, orbit: 10, min: 8, k: 'Les fixations', title: 'Comment le carter tient',
    text: 'En haut, 2 vis M10 sur des pattes soudées sous la lisse haute ; en bas, 2 flasques soudées au carter et vissées dans la lisse du milieu.',
    say: "Toutes les fixations apparaissent en orange, les soudures en jaune. Le carter tient par trois appuis : en haut, deux vis M10 serrent la bride sur deux pattes soudées sous la lisse haute ; en bas, deux flasques soudées au carter sont vissées dans la lisse du milieu." },
  { kind: 'cut', cam: 'fixcarter2', skin: true, fix: true, orbit: 10, min: 7, k: 'Les fixations', title: 'La platine du mécanisme',
    text: 'Vissée sur une colonne et une colonne-pivot soudées à la bride ; axe du levier tenu par écrou, électroaimant par 2 vis M5.',
    say: "Derrière, la platine du mécanisme est vissée sur deux colonnes soudées à la bride ; l'une d'elles sert de pivot au cliquet. L'axe du levier est tenu par un écrou, l'électroaimant par deux vis M5, le capteur par deux écrous." },
  { kind: 'cut', cam: 'socle', skin: true, fix: true, orbit: 10, min: 7, k: 'Les fixations', title: 'Le socle',
    text: 'Quatre chevilles chimiques M12 dans la dalle, poteaux soudés tout autour, coffrets sur entretoises, habillage vissé dans des rivets-écrous.',
    say: "En bas, quatre chevilles chimiques M12 tiennent la platine dans la dalle de béton. Les poteaux sont soudés tout autour, les coffrets posés sur des entretoises, et l'habillage est vissé dans des rivets-écrous." },
  { kind: 'cut', cam: 'filetage', skin: true, thr: true, orbit: 12, min: 8, k: 'Taraudages et filetages', title: 'Chaque filetage est repéré',
    text: 'Filets en jaune : bout d’axe M25×1,5, capteur M12×1, vis. Trous taraudés et rivets-écrous en orange.',
    say: "Tous les filetages sont repérés : en jaune les pièces filetées, comme le bout d'axe en M25 au pas de un et demi, le capteur en M12 au pas de un, et chaque vis ; en orange les trous taraudés et les rivets-écrous. Le dossier donne pour chacun le foret, la longueur, l'outil, le couple de serrage et le freinage." },
  { kind: 'cut', cam: 'meca', skin: true, orbit: 8, min: 8, k: 'Vérification', title: '63 contrôles, tous validés',
    text: 'Axes alignés, 32 liaisons réalisées, aucune collision sur un tiers de tour, course de l’électroaimant, capteur, efforts au forçage.',
    say: "Tout le mécanisme a été vérifié par calcul : les axes sont alignés, chaque liaison est bien réalisée, aucune pièce ne se touche pendant la rotation, l'électroaimant a assez de course, le capteur est à bonne distance, et les pièces tiennent un forçage de cinq cents newtons en bout de bras." },
  { kind: 'outro', cam: 'iso', orbit: 30, min: 7, k: 'Dossier de fabrication', title: 'Plans, nomenclature, montage et recette',
    text: 'Tout est dans le PDF. À faire relire par un mécanicien avant la découpe du métal.',
    say: "Les plans cotés, la liste des pièces, le schéma électrique, le guide de montage et la recette sont dans le dossier PDF. Ce prototype doit être relu par un mécanicien avant la découpe du métal." },
]

// Version complète : pièces une à une, chapitres, montage et fonctionnement plus lents.
if (COMPLET) {
  const pieces = JSON.parse(fs.readFileSync(path.join(dir, 'video_pieces.json'), 'utf8'))
  const chap = (n, title, text, say) => ({ kind: 'intro', cam: 'ensemble', orbit: 16, min: 5, k: `Partie ${n}`, title, text, say })
  const intro = segs[0]
  intro.say = "Voici le prototype P1 du tourniquet EduPilote, de bout en bout : d'abord chaque pièce, une par une ; puis le montage complet ; puis les détails de fixation ; et enfin le fonctionnement, au ralenti."
  const rest = segs.slice(1)
  const steps = rest.filter((x) => x.kind === 'step').map((x) => ({ ...x, min: 9 }))
  const details = rest.filter((x) => x.kind === 'cut' && x.k !== 'Vérification')
  const verif = rest.filter((x) => x.k === 'Vérification')
  const outro = rest.filter((x) => x.kind === 'outro')
  const fonction = [
    rest.find((x) => x.kind === 'refus'),
    { ...rest.find((x) => x.kind === 'pass' && x.cam === 'meca'), min: 24, say: "Au ralenti, côté mécanisme. Carte valide : le voyant passe au vert et l'électroaimant soulève le cliquet hors de son cran. L'étudiant pousse le bras ; le disque tourne, le galet sort de son cran en V et roule jusqu'au suivant, pendant que la dent frotte sur le bord du disque. Au bout d'un tiers de tour, la dent retombe dans le cran suivant : le tourniquet est de nouveau verrouillé, et le capteur a compté le passage." },
    { kind: 'pass', cam: 'coupe', cut: true, skin: true, orbit: 8, min: 14, base: 120, say: "Le même passage, en coupe : l'axe tourne dans ses deux roulements, avec le moyeu, le disque, les clavettes et l'écrou, comme une seule pièce." },
    rest.find((x) => x.kind === 'pass' && x.cam === 'proche'),
  ]
  segs.length = 0
  segs.push(intro, chap(1, 'Les pièces, une par une', `${pieces.length} pièces : nom, matière, dimensions et rôle.`, 'Première partie : les pièces, une par une.'))
  pieces.forEach((pc, i) => segs.push({ kind: 'piece', ids: pc.ids, orbit: 50, min: 7, k: `Pièce ${i + 1} / ${pieces.length}`, title: pc.title, text: `${pc.mat}. ${pc.role}`, say: `${pc.title}. ${pc.mat}. ${pc.role}` }))
  segs.push(chap(2, 'Le montage', 'Les 9 étapes, dans l’ordre de l’atelier.', "Deuxième partie : le montage, dans l'ordre de l'atelier."), ...steps)
  segs.push(chap(3, 'Les détails', 'Roulements en coupe, fixations, filetages.', 'Troisième partie : les détails.'), ...details)
  segs.push(chap(4, 'Le fonctionnement', 'Carte refusée, puis passage autorisé au ralenti.', 'Quatrième partie : le fonctionnement.'), ...fonction, ...verif, ...outro)
}
// Lecture à voix haute : symboles remplacés par des mots.
const parle = (t) => t.replace(/Ø/g, 'diamètre ').replace(/ × /g, ' par ').replace(/×/g, ' par ').replace(/(\d) mm\b/g, '$1 millimètres').replace(/\bM(\d+)/g, 'M $1').replace(/42CrMo4/g, '42 C D 4').replace(/≥/g, 'au moins')

// 1. Voix off : un fichier WAV par segment, durée mesurée.
const voiceDir = path.join(dir, 'voix')
fs.mkdirSync(voiceDir, { recursive: true })
const ps = segs.map((s, i) => {
  const f = path.join(voiceDir, `s${String(i).padStart(3, '0')}.wav`)
  const txt = path.join(voiceDir, `s${String(i).padStart(3, '0')}.txt`)
  fs.writeFileSync(txt, parle(s.say), 'utf8')
  return `$t = Get-Content -Raw -Encoding UTF8 '${txt}'; $s.SetOutputToWaveFile('${f}'); $s.Speak($t); $s.SetOutputToNull()`
}).join('\n')
const ps1 = path.join(voiceDir, 'voix.ps1')
fs.writeFileSync(ps1, '﻿' + `Add-Type -AssemblyName System.Speech\n$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n$s.SelectVoice('Microsoft Hortense Desktop')\n$s.Rate = 0\n${ps}\n`, 'utf8')
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { stdio: 'inherit' })
for (const [i, s] of segs.entries()) {
  const f = path.join(voiceDir, `s${String(i).padStart(3, '0')}.wav`)
  const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
  s.wav = f
  s.dur = Math.max(s.min, d + 1.3)
}
const total = segs.reduce((a, s) => a + s.dur, 0)
console.log(`durée : ${total.toFixed(1)} s, ${segs.length} segments`)

// 2. Piste son : chaque voix décalée de 0,5 s et complétée de silence jusqu'à la fin de son segment.
const audio = path.join(dir, 'voix.wav')
const inputs = segs.flatMap((s) => ['-i', s.wav])
const filt = segs.map((s, i) => `[${i}]aresample=48000,adelay=500|500,apad=whole_dur=${s.dur.toFixed(3)},atrim=0:${s.dur.toFixed(3)}[a${i}]`).join(';') +
  ';' + segs.map((_, i) => `[a${i}]`).join('') + `concat=n=${segs.length}:v=0:a=1[a]`
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filt, '-map', '[a]', '-ac', '1', audio], { stdio: 'inherit' })

// 3. Images : la vue 3D en mode « film », image par image, envoyées directement à ffmpeg.
;(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: W, height: H } })
  const html = fs.readFileSync(path.join(dir, 'tourniquet-3d.html'), 'utf8')
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>', { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.tourniquet)
  await p.evaluate(() => document.fonts.ready)
  const plan = segs.map(({ wav, say, min, ...s }) => s)
  await p.evaluate((s) => tourniquet.film(s), plan)
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const n = Math.round(total * FPS)
  const t0 = Date.now()
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => tourniquet.filmAt(t), i / FPS)
    const buf = await p.screenshot({ type: 'jpeg', quality: 90 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if (i % 250 === 0) console.log(`image ${i}/${n} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  await b.close()
  console.log('vidéo :', out)
})()
