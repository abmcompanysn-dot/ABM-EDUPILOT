# Tourniquet tripode EduPilote — prototype P1

Dossier de fabrication d'un tourniquet tripode semi-automatique en inox, à faire fabriquer par des artisans locaux (chaudronnier inox, tourneur-fraiseur, électricien). **Première version de conception : à faire relire par un mécanicien ou un ingénieur avant de découper le métal.**

**Vue 3D en ligne** : [https://abmedupilote.abmcy.com/tourniquet](https://abmedupilote.abmcy.com/tourniquet), avec liens directs [#passage](https://abmedupilote.abmcy.com/tourniquet#passage), [#refus](https://abmedupilote.abmcy.com/tourniquet#refus) et [#montage](https://abmedupilote.abmcy.com/tourniquet#montage). La page `tourniquet.html` à la racine du site est produite par `build_viewer.py`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `gen_design.py` | Source unique des cotes : pièces 3D, étapes de montage, cinématique, nomenclature. Écrit `design.json` et `tourniquet_P1_assemblage.stl`, et vérifie l'encombrement et les collisions. |
| `viewer.html` | Vue 3D interactive (three.js) : vues, éclaté, transparence, coupe des roulements, montage pas à pas, simulation d'un passage et d'un refus, boutons « Fixations » (visserie, chevilles, soudures) et « Filetages » (filets, trous taraudés, rivets-écrous). |
| `verif.py` | Vérification : coaxialité, 32 liaisons, arrêts axiaux, interférences, balayage d'un tiers de tour, course de l'électroaimant, capteur, efforts au forçage. Écrit `verif.json`, repris dans le dossier. |
| `export_cao.py` | Fichiers CAO : STEP (assemblage, 6 sous-ensembles soudés, 32 pièces dans leur repère) et 16 DXF de découpe tirés des mêmes volumes (tubes creux, coupes biaises, rainures, taraudages, perçages). Sortie : `out/step`, `out/dxf`. Nécessite `pip install cadquery`. |
| `build_viewer.py` | Assemble `out/tourniquet-3d.html` (vue 3D autonome avec les données intégrées). |
| `plans.py` | Plans cotés A3 (P01 à P10), fixations, filetages, vérification, nomenclature, métiers, montage, recette : `out/dossier.html`. |
| `shots.js`, `print_pdf.js` | Images de la 3D pour le dossier, puis impression en PDF A3. |
| `film.js` | Vidéo commentée : montage pas à pas puis simulation (voix Windows « Hortense », ffmpeg). |

## Régénérer

```sh
python gen_design.py && python build_viewer.py && python plans.py
# puis, avec playwright-core installé (navigateur Edge) :
node shots.js out && node print_pdf.js out out/Dossier_Tourniquet_P1.pdf
node film.js <dossier contenant tourniquet-3d.html et design.json>
```

## Principe

Axe incliné à 45° dans un carter à deux roulements 6205. Côté passage, un moyeu porte trois bras à 120° ; dans le caisson, un disque indexeur à 3 crans droits et 3 crans en V. Au repos, la dent d'un cliquet en acier trempé est dans un cran droit (rotation bloquée) et un galet à ressort, dans un cran en V, garde un bras à l'horizontale. Carte valide : l'électroaimant soulève le cliquet, le tripode tourne de 120°, le cliquet retombe dans le cran suivant, un capteur inductif compte le passage. Le contrôleur est le même que celui de la porte connectée (`firmware/door_nfc`, voir `docs/PORTE.md`).
