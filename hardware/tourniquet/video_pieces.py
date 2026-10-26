"""Liste des pièces présentées une à une dans la vidéo complète (out/video_pieces.json).

Pour chaque pièce : les volumes à isoler dans la 3D, son nom, sa matière, ses dimensions, sa quantité et son rôle.
"""
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gen_design as g  # noqa: E402

P = {p["id"]: p for p in g.parts}
ids = lambda pref: [i for i in P if i == pref or i.startswith(pref)]  # noqa: E731

# (volumes, nom, matière, rôle) dans l'ordre du montage
PIECES = [
    (["socle"], "Platine de base", "Acier S235 galvanisé, 1200 × 280 × 10 mm", "Elle porte tout le tourniquet et se fixe au sol par quatre chevilles chimiques M12."),
    (ids("poteau"), "Poteaux d'ossature", "Tube carré inox 30 × 30 × 2, longueur 1048 mm", "Les quatre poteaux forment les angles du caisson ; ils sont soudés sur la platine."),
    (ids("lisse-"), "Lisses d'ossature", "Tube carré inox 30 × 30 × 2, longueur 1137 mm", "Six lisses horizontales, devant et derrière : en bas, au milieu et en haut. Elles portent le carter."),
    (ids("traverse-"), "Traverses d'ossature", "Tube carré inox 30 × 30 × 2, longueur 217 mm", "Elles relient l'avant et l'arrière aux deux bouts du caisson."),
    (["carter", "carter-epaulement"], "Carter des roulements", "Acier, tube Ø70, alésages Ø52 H7, longueur 161 mm", "Il loge les deux roulements de l'axe ; un épaulement intérieur les arrête."),
    (["bride"], "Bride du carter", "Acier S235, 130 × 130 × 8 mm", "Soudée au bout du carter. Elle est boulonnée en haut sur les pattes et porte les colonnes du mécanisme."),
    (ids("patte"), "Pattes de fixation", "Acier S235, 30 × 40 × 6 mm, 2 pièces", "Soudées sous la lisse haute ; la bride y est serrée par deux vis M10."),
    (["flasque1", "flasque1-languette", "flasque2", "flasque2-languette"], "Flasques de maintien", "Acier S235, 8 mm, 2 pièces", "Soudées de chaque côté du carter, elles descendent jusqu'à la lisse du milieu où leur languette est vissée."),
    (["axe", "axe-epaulement", "axe-filetage"], "Axe principal", "Acier 42CrMo4 traité, Ø25 h7, longueur 275 mm", "Il relie les bras au disque. Il porte un épaulement Ø30, deux rainures de clavette, un filetage M25 et un taraudage M8."),
    (ids("roulement1"), "Roulements à billes 6205-2RS", "Achat, Ø25 × Ø52 × 15 mm, 2 pièces", "Deux roulements étanches de neuf billes chacun : l'axe tourne sans effort et sans jeu."),
    (["entretoise"], "Entretoise", "Acier, Ø32 × Ø25 × 105 mm", "Elle tient l'écart exact entre les deux roulements."),
    (["disque"], "Disque indexeur", "Acier S355, Ø140 × 10 mm, crans trempés", "Trois crans droits pour le cliquet et trois crans en V pour le galet : une position de repos tous les 120 degrés."),
    (["moyeu-disque"], "Moyeu du disque", "Acier, Ø45 × 22,5 mm", "Soudé au disque, il allonge la portée de la clavette et s'appuie sur le roulement."),
    (["clavette-disque"], "Clavette du disque", "Achat, acier, 8 × 7 × 28 mm", "Elle transmet la rotation de l'axe au disque."),
    (["rondelle-frein", "ecrou"], "Écrou à encoches et rondelle frein", "Achat, KM5 M25 × 1,5 et MB5", "L'écrou serre tout l'empilage contre l'épaulement de l'axe ; la languette de la rondelle l'empêche de se desserrer."),
    (["platine-meca", "platine-meca-aile"], "Platine du mécanisme", "Acier S235, 8 mm", "Elle porte le cliquet, l'électroaimant, le levier et le capteur."),
    (["colonne1"], "Colonne", "Acier, Ø16, taraudée M8", "Elle relie la bride à la platine du mécanisme."),
    (["colonne-pivot"], "Colonne-pivot", "Acier, Ø14, taraudée M8", "Elle sert d'axe au cliquet et de seconde colonne à la platine."),
    (["cliquet", "cliquet-oeil", "cliquet-dent"], "Cliquet de verrouillage", "Acier 42CrMo4 trempé", "Sa dent entre dans un cran du disque : la rotation est bloquée dans les deux sens."),
    (["bague-cliquet"], "Bague bronze du cliquet", "Achat, Ø14 × Ø18", "Le cliquet tourne dessus sans gripper."),
    (["electroaimant", "plongeur"], "Électroaimant et son plongeur", "Achat, 24 volts, course 10 mm, au moins 40 newtons", "Il soulève le cliquet quand la carte est acceptée."),
    (["butee-ressort", "ressort-cliquet"], "Ressort du cliquet et sa butée", "Ressort de compression (achat), butée soudée", "Le ressort garde la dent dans le cran quand l'électroaimant est coupé."),
    (["levier"], "Levier de crantage", "Acier S235, 6 mm", "Il pousse le galet contre le disque."),
    (["galet", "axe-galet"], "Galet et son axe", "Achat, roulement 608 Ø22 ; axe Ø8 fileté M8", "Le galet roule sur le disque et tombe dans les crans en V : il ramène toujours un bras à l'horizontale."),
    (["axe-levier"], "Axe du levier", "Acier, Ø10, fileté M10", "C'est le pivot du levier, fixé sur la platine par un écrou."),
    (["axe-ressort-levier", "ressort-levier"], "Ressort du levier", "Ressort de compression (achat) sur goupille Ø8", "Il garde le galet au contact du disque."),
    (["capteur", "support-capteur"], "Capteur inductif et son équerre", "Achat, M12 × 1, 24 volts ; équerre acier 6 mm", "Le capteur voit passer les crans du disque à 2,5 mm : il compte chaque passage."),
    (["plateau"], "Plateau du moyeu", "Inox 304, Ø150 × 15 mm", "Les trois bras y sont soudés."),
    (["moyeu"], "Fût du moyeu", "Inox 304, Ø60, alésage Ø25 H7", "Il est claveté sur l'axe ; une vis de pression bloque la clavette."),
    (["clavette-moyeu"], "Clavette du moyeu", "Achat, acier, 8 × 7 × 40 mm", "Elle transmet la poussée des bras à l'axe."),
    (["rondelle", "vis", "vis-tige"], "Rondelle d'arrêt et vis de bout d'axe", "Inox A4, Ø32 et M8", "Elles bloquent le moyeu en bout d'axe."),
    (ids("bras"), "Bras", "Tube inox 316, Ø38 × 2, 3 pièces", "Trois bras à 120 degrés, coupés en biais à 45 degrés au pied et soudés tout autour."),
    (ids("embout"), "Embouts de bras", "Achat, caoutchouc ou polyamide", "Ils protègent le bout des bras."),
    (["lecteur"], "Lecteur de carte et de QR code", "Achat, NFC 13,56 MHz et module QR", "Il lit la carte EduPilote ou le QR code du téléphone."),
    (["voyant-entree", "voyant-sortie"], "Voyants d'entrée et de sortie", "Achat, 24 volts", "Flèche verte ou croix rouge, à chaque bout du tourniquet."),
    (["controleur"], "Coffret contrôleur", "Achat, ESP32 industriel, Ethernet", "Il décide l'ouverture, dialogue avec le serveur et garde la liste hors ligne."),
    (["alimentation"], "Alimentation et batteries", "Achat, 24 volts et deux batteries 12 volts", "Le tourniquet continue de fonctionner pendant une coupure de courant."),
    (["panneau-passage"], "Panneau côté passage", "Inox 316L brossé, 1200 × 1050 × 1,5 mm", "Il porte la lumière par laquelle sort le carter."),
    (["panneau-arriere"], "Panneau arrière", "Inox 316L brossé, 1200 × 1050 × 1,5 mm", "Il ferme l'arrière du caisson."),
    (["joue-entree", "joue-sortie"], "Joues d'extrémité", "Inox 316L brossé, 280 × 1050 × 1,5 mm, 2 pièces", "Elles ferment les deux bouts et portent les voyants."),
    (["capot"] + ids("capot-bord"), "Capot", "Inox 316L, 1,5 mm, bords pliés de 20 mm", "Il ferme le dessus, porte le lecteur et se ferme par deux serrures à clé."),
    ([i for i, p in P.items() if p["group"] == "Fixations"], "Visserie et soudures", "Inox A4 ; cordons de soudure TIG", "Toutes les vis, écrous, chevilles, rivets-écrous, entretoises et cordons de soudure du tourniquet."),
]

out = []
for vols, nom, mat, role in PIECES:
    missing = [v for v in vols if v not in P]
    assert not missing, (nom, missing)
    out.append({"ids": vols, "title": nom, "mat": mat, "role": role})
(HERE / "out" / "video_pieces.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(out)} pièces pour la vidéo")
