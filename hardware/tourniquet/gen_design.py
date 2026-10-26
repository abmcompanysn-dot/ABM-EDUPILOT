"""Modèle du tourniquet tripode semi-automatique EduPilote (prototype P1).

Source unique des cotes : ce script écrit design.json (pièces 3D, étapes de montage,
cinématique, nomenclature), que lisent la vue 3D (viewer.html) et le générateur de
plans (plans.py), et un fichier STL de l'ensemble pour l'impression 3D d'une maquette.

Repère (mm) : x = sens de marche (longueur du caisson), y = travers (le passage
est du côté y > 0), z = vertical. Le caisson occupe x 0..1200, y -280..0.
Mécanisme : abscisse s le long de l'axe (s > 0 vers l'intérieur du caisson) et
repère local (E1, E2) dans le plan perpendiculaire à l'axe.
"""
import json
import math
import struct
from pathlib import Path

HERE = Path(__file__).parent

# ------------------------------------------------------------------ cotes principales
L, W, H = 1200, 280, 1060           # caisson
SHEET = 1.5                          # tôle inox 316L
BASE_T = 10                          # platine de base
FRAME = 30                           # tube carré de l'ossature
HUB = (600.0, 50.0, 850.0)           # point de convergence des bras (bras horizontal à 850 mm)
TILT = 45.0                          # inclinaison de l'axe sur la verticale
ARM_R, ARM_LEN = 19.0, 500.0         # bras Ø38 × 2, longueur depuis le point de convergence
PLATE_R, PLATE_T = 75.0, 15.0        # plateau avant du moyeu Ø150 × 15 : les 3 bras y sont soudés
HUB_R, HUB_S0, HUB_S1 = 30.0, -45.0, 15.0   # moyeu complet de s=-45 (face avant) à s=+15 ; fût Ø60
SHAFT_R, SHAFT_S0, SHAFT_S1 = 12.5, -45.0, 230.0  # axe Ø25
CARTER_R, CARTER_S0, CARTER_S1 = 35.0, 25.0, 186.0
BORE_R = 26.0                        # logement des roulements Ø52
BEARINGS_S = (45.0, 165.0)           # roulements 6205-2RS (Ø25 × Ø52 × 15)
DISC_R, DISC_S, DISC_T = 70.0, 200.0, 10.0
DISC_LOCKS = (30.0, 150.0, 270.0)    # crans de verrouillage (angle dans le repère E1, E2)
DISC_VS = (60.0, 180.0, 300.0)       # crans de centrage en V
LOCK_W, LOCK_D = 13.0, 14.0          # largeur et profondeur des crans de verrouillage
V_D = 8.0                            # profondeur des crans en V (90°)
FLANGE_S, FLANGE_SIZE = 182.0, 130.0  # bride entièrement derrière le panneau
MECH_PLATE_S = 219.0                 # platine du mécanisme (porte cliquet, électroaimant, levier)
BEND_SHEET = (1.5, 0.33)             # tôle inox 1,5 : rayon intérieur 1,5, facteur K 0,33
BEND_PLATE = (8.0, 0.42)             # flasques 8 mm : rayon intérieur 8, facteur K 0,42
TAB_L, TAB_HOLES = 64.0, (36.0, 54.0)   # languette des flasques : longueur depuis la face, trous hors de la zone de pli


def vec(*v):
    return [float(x) for x in v]


def add(a, b):
    return [a[i] + b[i] for i in range(3)]


def mul(a, k):
    return [x * k for x in a]


def norm(a):
    n = math.sqrt(sum(x * x for x in a))
    return [x / n for x in a]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return sum(a[i] * b[i] for i in range(3))


phi = math.radians(TILT)
A_OUT = norm(vec(0, math.sin(phi), -math.cos(phi)))   # axe : vers le passage et vers le bas
A_IN = mul(A_OUT, -1)
U = vec(1, 0, 0)
V = cross(A_OUT, U)
W_UP = norm(cross(U, A_IN))                           # dans le plan ⟂ à l'axe, vers le bas et l'arrière du caisson
E1, E2 = U, mul(W_UP, -1)                             # repère local du mécanisme ; (E1, E2, A_IN) direct
MECH_BASIS = [E1, E2, A_IN]
beta = math.radians(90 - TILT)                        # demi-angle du cône des bras
ARM_START = -HUB_S0 / math.cos(beta)                 # le bras part de la face avant du plateau


def P(s):
    """Point de l'axe à l'abscisse s (s > 0 : vers l'intérieur du caisson)."""
    return add(list(HUB), mul(A_IN, s))


def Q(s, x, y):
    """Point du mécanisme : abscisse s sur l'axe, (x, y) dans le repère local (E1, E2)."""
    return add(P(s), add(mul(E1, x), mul(E2, y)))


def arm_dir(psi_deg):
    psi = math.radians(psi_deg)
    return norm(add(mul(A_OUT, math.cos(beta)), mul(add(mul(U, math.cos(psi)), mul(V, math.sin(psi))), math.sin(beta))))


ARMS = [arm_dir(270), arm_dir(30), arm_dir(150)]       # le premier est horizontal

STEPS = [
    ("Platine de base", "La platine en acier galvanisé de 10 mm est fixée au sol par quatre chevilles chimiques M12 : tige scellée dans le béton, rondelle et écrou."),
    ("Ossature", "Quatre poteaux, six lisses et quatre traverses en tube inox 30 × 30 sont soudés ; chaque poteau est soudé sur la platine par un cordon tout autour."),
    ("Carter et fixation", "Le carter loge les deux roulements. En haut, sa bride est boulonnée par deux vis M10 sur deux pattes soudées sous la lisse haute. En bas, deux flasques soudées au carter sont vissées par quatre vis M8 dans la lisse du milieu."),
    ("Axe et roulements", "L'axe de 25 millimètres tourne dans deux roulements à billes. Un épaulement de l'axe et un épaulement du carter les arrêtent ; une entretoise les sépare."),
    ("Disque indexeur", "Le disque à crans, soudé sur son moyeu, est claveté au bout de l'axe. L'écrou à encoches et sa rondelle frein serrent tout l'empilage contre l'épaulement de l'axe."),
    ("Verrouillage et comptage", "La platine du mécanisme est vissée sur deux colonnes soudées à la bride. Le cliquet tourne sur une colonne-pivot, le levier à galet sur un axe tenu par écrou ; l'électroaimant est fixé par deux vis M5, le capteur serré par deux écrous M12."),
    ("Moyeu et bras", "Le moyeu claveté porte les trois bras, soudés tout autour sur le plateau. Une vis de pression sur la clavette, une rondelle et une vis M8 en bout d'axe le bloquent."),
    ("Électronique", "Les deux coffrets reposent sur quatre entretoises de 100 mm chacun, hors de l'eau. Le lecteur et les voyants sont fixés par quatre vis chacun."),
    ("Habillage inox", "Panneaux et joues en inox sont vissés par des vis M6 dans des rivets-écrous de l'ossature ; le capot est fermé par deux serrures à clé. Le tourniquet est prêt."),
]

parts = []


def _add(d, explode=(0, 0, 0), step=0, motion=None, pivot=None, approach=None):
    d["explode"] = vec(*explode)
    d["approach"] = vec(*(approach if approach is not None else explode))
    d["step"] = step
    if motion:
        d["motion"] = motion
    if pivot:
        d["pivot"] = vec(*pivot)
    parts.append(d)


def box(pid, name, group, color, center, size, basis=None, **kw):
    _add({"id": pid, "name": name, "group": group, "color": color, "type": "box",
          "center": vec(*center), "size": vec(*size), "basis": basis or [U, vec(0, 1, 0), vec(0, 0, 1)]}, **kw)


def cyl(pid, name, group, color, p1, p2, r, r_in=0.0, **kw):
    d = {"id": pid, "name": name, "group": group, "color": color, "type": "cyl" if r_in <= 0 else "tube",
         "p1": vec(*p1), "p2": vec(*p2), "r": float(r)}
    if r_in > 0:
        d["r_in"] = float(r_in)
    _add(d, **kw)


def sphere(pid, name, group, color, c, r, **kw):
    _add({"id": pid, "name": name, "group": group, "color": color, "type": "sphere", "center": vec(*c), "r": float(r)}, **kw)


def disc_outline(n=720):
    """Contour du disque indexeur dans le repère local (x, y)."""
    pts = []
    for i in range(n):
        a = 360.0 * i / n
        rr = DISC_R
        for c in DISC_LOCKS:
            da = (a - c + 180) % 360 - 180
            if abs(DISC_R * math.radians(da)) < LOCK_W / 2:
                rr = DISC_R - LOCK_D
        for c in DISC_VS:
            da = (a - c + 180) % 360 - 180
            w = abs(DISC_R * math.radians(da))
            if w < V_D:
                rr = min(rr, DISC_R - (V_D - w))
        pts.append((rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a))))
    return pts


INOX, ACIER, SOMBRE, BLEU, VERT, ROUGE, LAITON, BILLE = "#c3c9d1", "#8b939c", "#2b2f36", "#1c2b5a", "#18a957", "#e5484d", "#c9a227", "#e8ecf0"

# ------------------------------------------------------------------ 1. socle
box("dalle", "Dalle béton ≥ 120 mm (chevilles scellées dedans)", "Socle", "#c9c2b6", (L / 2, -W / 2, -60), (L + 300, W + 500, 120), step=1, approach=(0, 0, -200))
box("socle", "Platine de base 1200×280×10", "Socle", ACIER, (L / 2, -W / 2, BASE_T / 2), (L, W, BASE_T), explode=(0, 0, -260), step=1, approach=(0, 0, -300))

# ------------------------------------------------------------------ 2. ossature (en retrait de l'épaisseur de tôle)
FX0, FX1, FY0, FY1 = SHEET + FRAME / 2, L - SHEET - FRAME / 2, -SHEET - FRAME / 2, -W + SHEET + FRAME / 2
LISSE = L - 2 * SHEET - 2 * FRAME
TRAVERSE = W - 2 * SHEET - 2 * FRAME
for i, (x, y) in enumerate([(FX0, FY0), (FX1, FY0), (FX0, FY1), (FX1, FY1)]):
    box(f"poteau{i+1}", "Poteau d'ossature 30×30×2", "Ossature", ACIER, (x, y, BASE_T + (H - BASE_T) / 2 - 1), (FRAME, FRAME, H - BASE_T - 2), step=2, approach=(0, 0, 700))
for z, nom in ((BASE_T + FRAME / 2, "bas"), (H - FRAME / 2 - 2, "haut"), (620, "milieu")):
    box(f"lisse-av-{nom}", "Lisse d'ossature 30×30×2", "Ossature", ACIER, (L / 2, FY0, z), (LISSE, FRAME, FRAME), step=2, approach=(0, 500, 300))
    box(f"lisse-ar-{nom}", "Lisse d'ossature 30×30×2", "Ossature", ACIER, (L / 2, FY1, z), (LISSE, FRAME, FRAME), step=2, approach=(0, -500, 300))
for z, nom in ((BASE_T + FRAME / 2, "bas"), (H - FRAME / 2 - 2, "haut")):
    for x, cote in ((FX0, "entree"), (FX1, "sortie")):
        box(f"traverse-{cote}-{nom}", "Traverse d'ossature 30×30×2", "Ossature", ACIER, (x, -W / 2, z), (FRAME, TRAVERSE, FRAME), step=2, approach=(-500 if x < L / 2 else 500, 0, 300))

# ------------------------------------------------------------------ 3. carter et bride
IN = mul(A_IN, 320)
cyl("carter", "Carter Ø70, logements Ø52 H7", "Mécanisme", ACIER, P(CARTER_S0), P(CARTER_S1), CARTER_R, BORE_R, step=3, approach=IN)
_hf = FLANGE_SIZE / 2
_add({"id": "bride", "name": "Bride de fixation du carter 130×130×8", "group": "Mécanisme", "color": ACIER, "type": "prism",
      "origin": P(FLANGE_S - 4), "basis": MECH_BASIS, "depth": 8.0, "outline": [[-_hf, -_hf], [_hf, -_hf], [_hf, _hf], [-_hf, _hf]], "hole": CARTER_R}, step=3, approach=IN)

# Fixation du carter sur l'ossature (3 appuis) :
#  - en haut, la bride est boulonnée (2 × M10, trous du haut) sur 2 pattes soudées sous la lisse haute avant ;
#  - en bas, 2 flasques de 8 mm, soudées de part et d'autre du carter, sont boulonnées sur la lisse milieu avant.
PATTE_S = FLANGE_S - 4 - 3                 # pattes contre la face avant de la bride
PATTE_Y = (H - FRAME - 2 - HUB[2]) / math.cos(phi) - (PATTE_S + 3) - 20   # arête haute juste sous la lisse
for i, x in enumerate((-58, 58)):            # à côté des flasques ; le trou M10 de la bride (à ±50) tombe dedans
    box(f"patte{i+1}", "Patte de fixation 30×40×6 (sous la lisse haute, M10)", "Ossature", "#6f7780", Q(PATTE_S, x, PATTE_Y), (30, 40, 6), MECH_BASIS, step=3, approach=(0, 0, 300))
FL_X = CARTER_R + 4                       # flasques tangentes au carter (épaisseur 8)
FL_S1 = 158.0                             # elles s'arrêtent avant les écrous de la bride
LM_Z = 620 - FRAME / 2                    # dessous de la lisse milieu
_ys = -SHEET - FRAME                      # face arrière des lisses avant
_k = math.cos(phi)


def _on_s(s, y):
    """Point (y, z) du plan perpendiculaire à l'axe à l'abscisse s, à l'ordonnée y."""
    return (y, HUB[2] + s / _k + (y - HUB[1]))


_end_low = add(P(FL_S1), mul(E2, -25))
FLASQUE = [_on_s(FL_S1, _ys), (_end_low[1], _end_low[2]), (-72.0, LM_Z - 20), (_ys, LM_Z - 20)]
for i, sx in enumerate((-1, 1)):
    _add({"id": f"flasque{i+1}", "name": "Flasque de maintien du carter 8 mm", "group": "Ossature", "color": "#6f7780", "type": "prism",
          "origin": vec(HUB[0] + sx * FL_X - 4, 0, 0), "basis": [vec(0, 1, 0), vec(0, 0, 1), vec(1, 0, 0)], "depth": 8.0,
          "outline": [[round(y, 2), round(z, 2)] for y, z in FLASQUE], "hole": 0}, step=3, approach=(sx * 200, -200, 0))

# ------------------------------------------------------------------ 4. axe équipé (entre par le côté passage)
# Arrêts axiaux (montage « en X ») : l'épaulement Ø30 de l'axe tient la bague intérieure 1, l'écrou M25 serre
# disque + moyeu du disque + bague intérieure 2 + entretoise + bague intérieure 1 contre lui ; dans le carter,
# un épaulement intérieur Ø44 arrête les bagues extérieures vers le milieu.
OUT = mul(A_OUT, 360)
SHOULDER_S0, SHOULDER_R = HUB_S1, 15.0          # épaulement Ø30 de l'axe, du moyeu jusqu'au roulement 1
CARTER_SH_R = 22.0                              # épaulement intérieur du carter (Ø44)
cyl("axe", "Axe Ø25 h7 acier 42CrMo4 traité, L 275, épaulement Ø30", "Mécanisme", INOX, P(SHAFT_S0), P(SHAFT_S1), SHAFT_R, explode=mul(A_OUT, 140), step=4, motion="rot", approach=mul(A_OUT, 420))
cyl("axe-epaulement", "Axe Ø25 h7 acier 42CrMo4 traité, L 275, épaulement Ø30", "Mécanisme", INOX, P(SHOULDER_S0), P(BEARINGS_S[0] - 7.5), SHOULDER_R, explode=mul(A_OUT, 140), step=4, motion="rot", approach=mul(A_OUT, 420))
cyl("carter-epaulement", "Carter Ø70, logements Ø52 H7", "Mécanisme", ACIER, P(BEARINGS_S[0] + 7.5), P(BEARINGS_S[1] - 7.5), BORE_R, CARTER_SH_R, step=3, approach=IN)
for i, sb in enumerate(BEARINGS_S):
    ex = mul(A_IN, 60 * (i * 2 - 1))
    cyl(f"roulement{i+1}-ext", "Roulement 6205-2RS : bague extérieure", "Mécanisme", LAITON, P(sb - 7.5), P(sb + 7.5), BORE_R, 22.6, explode=ex, step=4, approach=OUT)
    cyl(f"roulement{i+1}-int", "Roulement 6205-2RS : bague intérieure", "Mécanisme", LAITON, P(sb - 7.5), P(sb + 7.5), 16.0, SHAFT_R, explode=ex, step=4, motion="rot", approach=OUT)
    for k in range(9):
        a = math.radians(40 * k)
        sphere(f"roulement{i+1}-bille{k+1}", "Roulement 6205-2RS : billes Ø7,9", "Mécanisme", BILLE, Q(sb, 19.3 * math.cos(a), 19.3 * math.sin(a)), 3.95, explode=ex, step=4, motion="balls", approach=OUT)
cyl("entretoise", "Entretoise entre bagues intérieures Ø32 × Ø25 × 105", "Mécanisme", ACIER, P(BEARINGS_S[0] + 7.5), P(BEARINGS_S[1] - 7.5), 16.0, SHAFT_R, step=4, motion="rot", approach=OUT)

# ------------------------------------------------------------------ 5. disque indexeur (soudé sur son moyeu Ø45)
DHUB_S0, DHUB_R = BEARINGS_S[1] + 7.5, 22.5
_add({"id": "disque", "name": "Disque indexeur Ø140 (3 crans de verrouillage, 3 crans en V)", "group": "Mécanisme", "color": SOMBRE, "type": "prism",
      "origin": P(DISC_S - DISC_T / 2), "basis": MECH_BASIS, "depth": DISC_T, "outline": [[round(x, 2), round(y, 2)] for x, y in disc_outline(240)],
      "hole": SHAFT_R}, explode=mul(A_IN, 140), step=5, motion="rot", approach=mul(A_IN, 260))
cyl("moyeu-disque", "Moyeu du disque Ø45 × 22,5 (soudé au disque)", "Mécanisme", SOMBRE, P(DHUB_S0), P(DISC_S - DISC_T / 2), DHUB_R, SHAFT_R, explode=mul(A_IN, 140), step=5, motion="rot", approach=mul(A_IN, 260))
KEY_D_L = 28.0
box("clavette-disque", "Clavette 8×7×28 (disque)", "Mécanisme", LAITON, Q(DISC_S + DISC_T / 2 - 1 - KEY_D_L / 2, 0, SHAFT_R - 0.5), (8, 7, KEY_D_L), MECH_BASIS, explode=mul(A_IN, 100), step=5, motion="rot", approach=mul(A_IN, 200))
cyl("rondelle-frein", "Rondelle frein MB5 (languette pliée dans l'écrou)", "Mécanisme", LAITON, P(DISC_S + DISC_T / 2), P(DISC_S + DISC_T / 2 + 2), 19.0, SHAFT_R, explode=mul(A_IN, 170), step=5, motion="rot", approach=mul(A_IN, 280))
cyl("ecrou", "Écrou à encoches M25×1,5 (KM5)", "Mécanisme", ACIER, P(DISC_S + DISC_T / 2 + 2), P(DISC_S + DISC_T / 2 + 10), 19.0, SHAFT_R, explode=mul(A_IN, 190), step=5, motion="rot", approach=mul(A_IN, 300))

# ------------------------------------------------------------------ 6. verrouillage, recentrage, comptage
# Le cliquet pivote sur une colonne Ø14 placée presque sur la ligne de l'effort de la dent (bras de levier 5,5 mm) :
# en cas de forçage, il ne peut pas être chassé du cran. Son corps travaille derrière le disque (plan s 207..213).
BACK = mul(A_IN, 300)
box("platine-meca", "Platine du mécanisme 8 mm (acier)", "Mécanisme", ACIER, Q(MECH_PLATE_S, -3, -92.5), (214, 85, 8), MECH_BASIS, explode=mul(A_IN, 260), step=6, approach=BACK)
box("platine-meca-aile", "Platine du mécanisme 8 mm (acier)", "Mécanisme", ACIER, Q(MECH_PLATE_S, -107.5, -30), (25, 40, 8), MECH_BASIS, explode=mul(A_IN, 260), step=6, approach=BACK)
COL_L = (-60.0, -58.0)                    # colonne simple
PIV_C = (54.0, -58.0)                     # colonne-pivot du cliquet
cyl("colonne1", "Colonne Ø16 taraudée M8 (bride → platine)", "Mécanisme", ACIER, Q(FLANGE_S + 4, *COL_L), Q(MECH_PLATE_S - 4, *COL_L), 8, explode=mul(A_IN, 200), step=6, approach=BACK)
cyl("colonne-pivot", "Colonne-pivot Ø14 du cliquet, taraudée M8 (bride → platine)", "Mécanisme", ACIER, Q(FLANGE_S + 4, *PIV_C), Q(MECH_PLATE_S - 4, *PIV_C), 7, explode=mul(A_IN, 200), step=6, approach=BACK)
pc = Q(210, *PIV_C)
CL_S = 210.0                              # plan du corps du cliquet
box("cliquet", "Cliquet de verrouillage acier trempé", "Mécanisme", ROUGE, Q(CL_S, 19, -61), (50, 14, 6), MECH_BASIS, step=6, motion="cliquet", pivot=pc, approach=BACK)
cyl("cliquet-oeil", "Cliquet de verrouillage acier trempé", "Mécanisme", ROUGE, Q(CL_S - 3, *PIV_C), Q(CL_S + 3, *PIV_C), 13, 9, step=6, motion="cliquet", pivot=pc, approach=BACK)
cyl("bague-cliquet", "Bague bronze Ø14/Ø18 du cliquet", "Mécanisme", LAITON, Q(CL_S - 3, *PIV_C), Q(CL_S + 3, *PIV_C), 9, 7, step=6, motion="cliquet", pivot=pc, approach=BACK)
box("cliquet-dent", "Dent du cliquet (entre dans le cran)", "Mécanisme", ROUGE, Q((DISC_S - DISC_T / 2 - 0.5 + CL_S + 3) / 2, 0, -64), (12, 14, CL_S + 3 - (DISC_S - DISC_T / 2 - 0.5)), MECH_BASIS, step=6, motion="cliquet", pivot=pc, approach=BACK)
PLG_X = 32.0                              # attache du plongeur : 22 mm du pivot → course 8,4 mm pour 22°
box("electroaimant", "Électroaimant 24 V, course 10 mm, ≥ 40 N (soulève le cliquet)", "Mécanisme", "#7a1f22", Q(DISC_S, PLG_X, -114), (34, 40, 30), MECH_BASIS, explode=mul(W_UP, 90), step=6, approach=BACK)
cyl("plongeur", "Plongeur de l'électroaimant (chape sur le cliquet)", "Mécanisme", INOX, Q(CL_S, PLG_X, -94), Q(CL_S, PLG_X, -68), 4, step=6, motion="cliquet", pivot=pc, approach=BACK)
box("butee-ressort", "Butée du ressort de cliquet (soudée sur la platine)", "Mécanisme", ACIER, Q(209, 2, -100), (16, 8, 12), MECH_BASIS, step=6, approach=BACK)
cyl("ressort-cliquet", "Ressort de compression du cliquet (le garde dans le cran)", "Mécanisme", LAITON, Q(CL_S, 2, -96), Q(CL_S, 2, -71), 3.5, step=6, approach=BACK)
GALET_C = (-(DISC_R - V_D) - 11 / math.sin(math.radians(45)), 0.0)  # galet Ø22 au fond du V
PIV_G = (-88.0, -55.0)
pg = Q(DISC_S, *PIV_G)
dl = norm([GALET_C[0] - PIV_G[0], GALET_C[1] - PIV_G[1], 0])
lev_len = math.hypot(GALET_C[0] - PIV_G[0], GALET_C[1] - PIV_G[1])
lev_axis = add(mul(E1, dl[0]), mul(E2, dl[1]))
lev_basis = [cross(lev_axis, A_IN), lev_axis, A_IN]
mid = ((GALET_C[0] + PIV_G[0]) / 2, (GALET_C[1] + PIV_G[1]) / 2)
box("levier", "Levier de crantage", "Mécanisme", LAITON, Q(DISC_S + 9, *mid), (12, lev_len + 14, 6), lev_basis, step=6, motion="crantage", pivot=pg, approach=BACK)
cyl("galet", "Galet Ø22 (roulement 608)", "Mécanisme", INOX, Q(DISC_S - 3.5, *GALET_C), Q(DISC_S + 3.5, *GALET_C), 11, 4, step=6, motion="crantage", pivot=pg, approach=BACK)
cyl("axe-galet", "Axe du galet Ø8", "Mécanisme", INOX, Q(DISC_S - 4, *GALET_C), Q(DISC_S + 12, *GALET_C), 4, step=6, motion="crantage", pivot=pg, approach=BACK)
cyl("axe-levier", "Axe du levier Ø10", "Mécanisme", INOX, Q(DISC_S + 5, *PIV_G), Q(MECH_PLATE_S, *PIV_G), 5, step=6, approach=BACK)
SPR_G = (-108.0, -25.0)                   # appui fixe du ressort du levier (sur l'aile de la platine)
cyl("axe-ressort-levier", "Goupille d'appui du ressort de levier", "Mécanisme", INOX, Q(DISC_S + 5, *SPR_G), Q(MECH_PLATE_S - 4, *SPR_G), 4, step=6, approach=BACK)
cyl("ressort-levier", "Ressort de compression du levier (pousse le galet dans le V)", "Mécanisme", LAITON, Q(DISC_S + 9, SPR_G[0] + 4, -26), Q(DISC_S + 9, -85.5, -26), 3, step=6, approach=BACK)
CAPT_GAP = 2.5                            # entrefer du capteur (portée nominale M12 noyé : 4 mm)
cyl("capteur", "Capteur inductif M12×1 (comptage des passages)", "Mécanisme", BLEU, Q(DISC_S, 125, 0), Q(DISC_S, DISC_R + CAPT_GAP, 0), 6, explode=(120, 0, 0), step=6, approach=BACK)
box("support-capteur", "Équerre du capteur", "Mécanisme", ACIER, Q(206.5, 101, -22), (6, 62, 33), MECH_BASIS, step=6, approach=BACK)

# ------------------------------------------------------------------ 7. moyeu et bras
hub_out = mul(A_OUT, 300)
HUB_IN = mul(A_OUT, 520)
cyl("plateau", "Plateau du moyeu inox Ø150 × 15", "Bras", INOX, P(HUB_S0), P(HUB_S0 + PLATE_T), PLATE_R, explode=hub_out, step=7, motion="rot", approach=HUB_IN)
cyl("moyeu", "Fût du moyeu inox Ø60, alésage Ø25 H7", "Bras", INOX, P(HUB_S0 + PLATE_T), P(HUB_S1), HUB_R, explode=hub_out, step=7, motion="rot", approach=HUB_IN)
box("clavette-moyeu", "Clavette 8×7×40 (moyeu)", "Bras", LAITON, Q(-7.5, 0, SHAFT_R - 0.5), (8, 7, 40), MECH_BASIS, explode=mul(A_OUT, 220), step=7, motion="rot", approach=mul(A_OUT, 420))
cyl("rondelle", "Rondelle d'arrêt Ø32", "Bras", INOX, P(HUB_S0 - 3), P(HUB_S0), 16, 4.3, explode=mul(A_OUT, 380), step=7, motion="rot", approach=mul(A_OUT, 620))
cyl("vis", "Vis M8 inox A4", "Bras", SOMBRE, P(HUB_S0 - 8), P(HUB_S0 - 3), 6.5, explode=mul(A_OUT, 420), step=7, motion="rot", approach=mul(A_OUT, 680))
parts[-1]["seg"] = 6
for i, d in enumerate(ARMS):
    start, end = add(list(HUB), mul(d, ARM_START)), add(list(HUB), mul(d, ARM_LEN))
    ex = add(hub_out, mul(d, 160))
    cyl(f"bras{i+1}", "Bras tube inox 316 Ø38×2", "Bras", INOX, start, end, ARM_R, explode=ex, step=7, motion="rot", approach=HUB_IN)
    cyl(f"embout{i+1}", "Embout de bras", "Bras", SOMBRE, end, add(end, mul(d, 12)), ARM_R + 1, explode=ex, step=7, motion="rot", approach=HUB_IN)

# ------------------------------------------------------------------ 8. électronique et interfaces
box("lecteur", "Lecteur NFC + QR (plastron incliné)", "Électronique", BLEU, (150, -W / 2, H + 18), (170, 120, 32), explode=(0, 0, 520), step=8, approach=(0, 0, 500))
box("voyant-entree", "Voyant flèche verte / croix rouge (entrée)", "Électronique", VERT, (-7, -W / 2, 960), (12, 110, 110), explode=(-520, 0, 0), step=8)
box("voyant-sortie", "Voyant flèche verte / croix rouge (sortie)", "Électronique", VERT, (L + 7, -W / 2, 960), (12, 110, 110), explode=(520, 0, 0), step=8)
box("controleur", "Coffret contrôleur (ESP32 industriel, borniers)", "Électronique", SOMBRE, (980, -W / 2, 160), (300, 200, 100), step=8, approach=(0, 0, 600))
box("alimentation", "Alimentation 24 V + batterie de secours", "Électronique", SOMBRE, (260, -W / 2, 165), (280, 190, 110), step=8, approach=(0, 0, 600))

# ------------------------------------------------------------------ 9. habillage inox
box("panneau-passage", "Panneau côté passage (lumière pour le carter)", "Habillage", INOX, (L / 2, -SHEET / 2, H / 2 + BASE_T / 2), (L, SHEET, H - BASE_T), explode=(0, 120, 1250), step=9, approach=(0, 700, 0))
box("panneau-arriere", "Panneau arrière", "Habillage", INOX, (L / 2, -W + SHEET / 2, H / 2 + BASE_T / 2), (L, SHEET, H - BASE_T), explode=(0, -380, 0), step=9, approach=(0, -700, 0))
box("joue-entree", "Joue d'extrémité entrée", "Habillage", INOX, (SHEET / 2, -W / 2, H / 2 + BASE_T / 2), (SHEET, W, H - BASE_T), explode=(-380, 0, 0), step=9, approach=(-700, 0, 0))
box("joue-sortie", "Joue d'extrémité sortie", "Habillage", INOX, (L - SHEET / 2, -W / 2, H / 2 + BASE_T / 2), (SHEET, W, H - BASE_T), explode=(380, 0, 0), step=9, approach=(700, 0, 0))
box("capot", "Capot supérieur amovible 1220×300", "Habillage", INOX, (L / 2, -W / 2, H + 1), (L + 20, W + 20, 2), explode=(0, -420, 900), step=9, approach=(0, 0, 600))
CAPOT_F = 20.0                            # bords pliés du capot
for nm, c, sz in (("av", (L / 2, 10 - 1, H + 2 - CAPOT_F / 2), (L + 20, 2, CAPOT_F)), ("ar", (L / 2, -W - 10 + 1, H + 2 - CAPOT_F / 2), (L + 20, 2, CAPOT_F)),
                  ("e", (-10 + 1, -W / 2, H + 2 - CAPOT_F / 2), (2, W + 16, CAPOT_F)), ("s", (L + 10 - 1, -W / 2, H + 2 - CAPOT_F / 2), (2, W + 16, CAPOT_F))):
    box(f"capot-bord-{nm}", "Capot supérieur amovible 1220×300", "Habillage", INOX, c, sz, explode=(0, -420, 900), step=9, approach=(0, 0, 600))

# ------------------------------------------------------------------ fixations : toute la visserie et les cordons de soudure
FIX_V, FIX_S = "#a7adb5", "#b8862b"       # visserie inox A4, cordons de soudure
FX = "Fixations"
TAP = "Taraudages"
TAP_C = "#ff7a00"
PITCH = {4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75}       # pas ISO gros


def tap(pid, name, p1, p2, d, **kw):
    """Repère d'un trou taraudé ou d'un rivet-écrou (montré par le bouton « Filetages »)."""
    cyl(pid, name, TAP, TAP_C, p1, p2, d / 2 + 0.2, **kw)
    parts[-1]["thread"] = {"d": d, "p": PITCH.get(d, 1.0), "int": True}


def hexcyl(pid, name, p1, p2, r, color=FIX_V, **kw):
    cyl(pid, name, FX, color, p1, p2, r, **kw)
    parts[-1]["seg"] = 6


def bolt(pid, name, face, d, grip, dvec, step, nut=True, length=None, motion=None, pivot=None, approach=None):
    """Vis à tête hexagonale posée sur `face`, tige suivant dvec à travers `grip` mm ; rondelle et écrou si nut."""
    dvec = norm(dvec)
    kw = dict(step=step, motion=motion, pivot=pivot, approach=approach if approach is not None else mul(dvec, -140))
    hexcyl(pid + "-tete", name, add(face, mul(dvec, -0.65 * d)), face, 0.9 * d, **kw)
    ln = length or grip + (1.2 * d + 2 if nut else 0)
    cyl(pid + "-tige", name, FX, FIX_V, face, add(face, mul(dvec, ln)), d / 2, **kw)
    parts[-1]["thread"] = {"d": d, "p": PITCH[d]}
    if nut:
        e = add(face, mul(dvec, grip))
        cyl(pid + "-rondelle", name, FX, FIX_V, e, add(e, mul(dvec, 0.2 * d)), d, d / 2 + 0.5, **kw)
        hexcyl(pid + "-ecrou", name, add(e, mul(dvec, 0.2 * d)), add(e, mul(dvec, d)), 0.9 * d, **kw)


def weld(pid, name, p1, p2, r=2.3, r_in=0.0, **kw):
    cyl(pid, name, FX, FIX_S, p1, p2, r, r_in, **kw)


# 1. chevilles chimiques M12 dans la dalle
for i, (x, y) in enumerate([(60, -60), (L - 60, -60), (60, -W + 60), (L - 60, -W + 60)]):
    nm = "Cheville chimique M12 : tige scellée, rondelle, écrou"
    kw = dict(step=1, approach=(0, 0, 260))
    cyl(f"cheville{i+1}-tige", nm, FX, FIX_V, (x, y, -110), (x, y, BASE_T + 24), 6, **kw)
    parts[-1]["thread"] = {"d": 12, "p": 1.75}
    cyl(f"cheville{i+1}-rondelle", nm, FX, FIX_V, (x, y, BASE_T), (x, y, BASE_T + 2.5), 12, 6.5, **kw)
    hexcyl(f"cheville{i+1}-ecrou", nm, (x, y, BASE_T + 2.5), (x, y, BASE_T + 12.5), 10, **kw)
# 2. cordons de soudure au pied des poteaux
for i, (x, y) in enumerate([(FX0, FY0), (FX1, FY0), (FX0, FY1), (FX1, FY1)]):
    for j, (dx, dy, sx, sy) in enumerate([(0, FRAME / 2 + 1.5, FRAME + 6, 3), (0, -FRAME / 2 - 1.5, FRAME + 6, 3), (FRAME / 2 + 1.5, 0, 3, FRAME), (-FRAME / 2 - 1.5, 0, 3, FRAME)]):
        box(f"soudure-poteau{i+1}-{j+1}", "Cordon de soudure poteau ↔ platine (tout autour)", FX, FIX_S, (x + dx, y + dy, BASE_T + 1.5), (sx, sy, 3), step=2, approach=(0, 0, 500))
# 3. fixation du carter
for i, x in enumerate((-50, 50)):
    bolt(f"vis-bride{i+1}", "Vis H M10 inox + rondelle + écrou (bride ↔ patte)", Q(FLANGE_S + 4, x, 50), 10, 14, A_OUT, 3)
for i, x in enumerate((-58, 58)):
    c = Q(PATTE_S + 3, x, PATTE_Y + 20)
    weld(f"soudure-patte{i+1}", "Cordon de soudure patte ↔ lisse haute", add(c, (-15, 1.2, -1.2)), add(c, (15, 1.2, -1.2)), step=3, approach=(0, 0, 300))
weld("soudure-bride", "Cordon de soudure bride ↔ carter (circulaire)", P(FLANGE_S - 7), P(FLANGE_S - 4), CARTER_R + 3.5, CARTER_R, step=3, approach=IN)
for i, sx in enumerate((-1, 1)):
    xo = HUB[0] + sx * (FL_X + 4)                   # face extérieure de la flasque
    box(f"flasque{i+1}-languette", "Flasque de maintien du carter 8 mm", "Ossature", "#6f7780", (xo + sx * TAB_L / 2, _ys - 4, LM_Z + 7.5), (TAB_L, 8, 55), step=3, approach=(sx * 200, -200, 0))
    for j, dx in enumerate(TAB_HOLES):
        bolt(f"vis-flasque{i+1}-{j+1}", "Vis H M8 inox dans un rivet-écrou de la lisse milieu", (xo + sx * dx, _ys - 8, 620), 8, 10, (0, 1, 0), 3, nut=False, length=22)
    for j, e in enumerate((3.8, -3.8)):
        weld(f"soudure-flasque{i+1}-{j+1}", "Cordon de soudure flasque ↔ carter", Q(118, sx * (CARTER_R + 1.6), e), Q(FL_S1 - 2, sx * (CARTER_R + 1.6), e), step=3, approach=(sx * 200, -200, 0))
# 6. platine du mécanisme
for i, (c, r) in enumerate(((COL_L, 8), (PIV_C, 7))):
    bolt(f"vis-colonne{i+1}", "Vis H M8 inox (platine ↔ colonne taraudée)", Q(MECH_PLATE_S + 4, *c), 8, 8, A_OUT, 6, nut=False, length=20, approach=BACK)
    weld(f"soudure-colonne{i+1}", "Cordon de soudure colonne ↔ bride", Q(FLANGE_S + 4, *c), Q(FLANGE_S + 7, *c), r + 3, r, step=6, approach=BACK)
for nm, c in (("levier", PIV_G),):
    cyl(f"axe-{nm}-filetage", f"Écrou M10 + filetage de l'axe du {nm}", FX, FIX_V, Q(MECH_PLATE_S, *c), Q(MECH_PLATE_S + 14, *c), 5, step=6, approach=BACK)
    parts[-1]["thread"] = {"d": 10, "p": 1.5}
    hexcyl(f"ecrou-axe-{nm}", f"Écrou M10 + filetage de l'axe du {nm}", Q(MECH_PLATE_S + 4, *c), Q(MECH_PLATE_S + 12, *c), 8.5, step=6, approach=BACK)
hexcyl("ecrou-galet", "Écrou M8 de l'axe du galet", Q(DISC_S + 12, *GALET_C), Q(DISC_S + 18, *GALET_C), 7, step=6, motion="crantage", pivot=pg, approach=BACK)
for i, dx in enumerate((-10, 10)):
    bolt(f"vis-electro{i+1}", "Vis H M5 inox (électroaimant ↔ platine)", Q(MECH_PLATE_S + 4, PLG_X + dx, -114), 5, 8, A_OUT, 6, nut=False, length=16, approach=BACK)
for i, (a, b) in enumerate(((90, 96), (106, 112))):
    hexcyl(f"ecrou-capteur{i+1}", "Écrous M12 du capteur (de part et d'autre de l'équerre)", Q(DISC_S, a, 0), Q(DISC_S, b, 0), 10, step=6, approach=BACK)
# 7. moyeu et bras
cyl("vis-tige", "Vis M8 inox A4", "Fixations", "#a7adb5", P(HUB_S0 - 3), P(HUB_S0 + 17), 4, explode=mul(A_OUT, 420), step=7, motion="rot", approach=mul(A_OUT, 680))
parts[-1]["thread"] = {"d": 8, "p": 1.25}
cyl("vis-pression", "Vis de pression M8 sur la clavette du moyeu", FX, SOMBRE, Q(-7.5, 0, HUB_R + 0.5), Q(-7.5, 0, HUB_R - 8), 4, step=7, motion="rot", approach=HUB_IN)
parts[-1]["thread"] = {"d": 8, "p": 1.25}
for i, d in enumerate(ARMS):
    st = add(list(HUB), mul(d, ARM_START))
    weld(f"soudure-bras{i+1}", "Cordon de soudure bras ↔ plateau (tout autour)", st, add(st, mul(d, 4)), ARM_R + 3, ARM_R, step=7, motion="rot", approach=HUB_IN)
# 8. électronique
for nm, (cx, cy, cz), (sx, sy, sz) in (("controleur", (980, -W / 2, 160), (300, 200, 100)), ("alimentation", (260, -W / 2, 165), (280, 190, 110))):
    for j, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x, y = cx + ex * (sx / 2 - 25), cy + ey * (sy / 2 - 25)
        cyl(f"entretoise-{nm}{j+1}", "Entretoise M6 h 100 + vis (coffret au-dessus de l'eau)", FX, FIX_V, (x, y, BASE_T), (x, y, cz - sz / 2), 6, step=8, approach=(0, 0, 600))
for j, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
    x, y = 150 + ex * 70, -W / 2 + ey * 45
    cyl(f"vis-lecteur{j+1}", "Vis M4×40 inox (lecteur sur le capot)", FX, FIX_V, (x, y, H + 34), (x, y, H + 35.5), 3.2, step=8, approach=(0, 0, 500))
    cyl(f"vis-lecteur{j+1}-tige", "Vis M4×40 inox (lecteur sur le capot)", FX, FIX_V, (x, y, H + 34), (x, y, H - 6), 2, step=8, approach=(0, 0, 500))
    parts[-1]["thread"] = {"d": 4, "p": 0.7}
for nm, xf, sg in (("entree", -13, -1), ("sortie", L + 13, 1)):
    for j, (ey, ez) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        y, z = -W / 2 + ey * 45, 960 + ez * 45
        cyl(f"vis-voyant-{nm}{j+1}", "Vis M4×16 inox (voyant sur la joue)", FX, FIX_V, (xf, y, z), (xf + sg * 1.5, y, z), 3.2, step=8, approach=(sg * 520, 0, 0))
        cyl(f"vis-voyant-{nm}{j+1}-tige", "Vis M4×16 inox (voyant sur la joue)", FX, FIX_V, (xf, y, z), (xf - sg * 16, y, z), 2, step=8, approach=(sg * 520, 0, 0))
        parts[-1]["thread"] = {"d": 4, "p": 0.7}
# 9. habillage : vis M6 tête bombée dans des rivets-écrous de l'ossature, serrures du capot
PANEL_SCREWS = [(FX0, z) for z in (60, 620, 1000)] + [(FX1, z) for z in (60, 620, 1000)] + [(x, z) for x in (400, 800) for z in (BASE_T + FRAME / 2, 620, H - FRAME / 2 - 2)]
SIDE_SCREWS = [(y, z) for y in (FY0, FY1) for z in (60, 620, 1000)] + [(-W / 2, z) for z in (BASE_T + FRAME / 2, H - FRAME / 2 - 2)]
nmv = "Vis inox A4 M6 tête bombée + rivet-écrou (habillage)"
def panel_screw(pid, head_p1, head_p2, tip, ap):
    cyl(pid, nmv, FX, FIX_V, head_p1, head_p2, 6, step=9, approach=ap)
    cyl(pid + "-tige", nmv, FX, FIX_V, head_p1, tip, 3, step=9, approach=ap)
    parts[-1]["thread"] = {"d": 6, "p": 1.0}


for j, (x, z) in enumerate(PANEL_SCREWS):
    panel_screw(f"vis-panneau-av{j+1}", (x, 0, z), (x, 2.5, z), (x, -12, z), (0, 700, 0))
    panel_screw(f"vis-panneau-ar{j+1}", (x, -W, z), (x, -W - 2.5, z), (x, -W + 12, z), (0, -700, 0))
for j, (y, z) in enumerate(SIDE_SCREWS):
    panel_screw(f"vis-joue-e{j+1}", (0, y, z), (-2.5, y, z), (12, y, z), (-700, 0, 0))
    panel_screw(f"vis-joue-s{j+1}", (L, y, z), (L + 2.5, y, z), (L - 12, y, z), (700, 0, 0))
for j, x in enumerate((300, 900)):
    cyl(f"serrure{j+1}", "Serrure à clé Ø18 (capot)", FX, SOMBRE, (x, -10, H + 2), (x, -10, H + 6), 9, step=9, approach=(0, 0, 600))

# ------------------------------------------------------------------ filetages (pièces) et taraudages (trous)
cyl("axe-filetage", "Filetage M25×1,5 du bout d'axe (écrou à encoches)", "Mécanisme", INOX, P(DISC_S + DISC_T / 2 + 1), P(SHAFT_S1), SHAFT_R + 0.15, step=4, motion="rot", approach=mul(A_OUT, 420))
parts[-1]["thread"] = {"d": 25, "p": 1.5}
cyl("axe-galet-filetage", "Filetage M8 de l'axe du galet", FX, FIX_V, Q(DISC_S + 10, *GALET_C), Q(DISC_S + 22, *GALET_C), 4, step=6, motion="crantage", pivot=pg, approach=BACK)
parts[-1]["thread"] = {"d": 8, "p": 1.25}
next(x for x in parts if x["id"] == "capteur")["thread"] = {"d": 12, "p": 1.0}
tap("taraud-axe", "Taraudage M8 en bout d'axe (vis de bout)", P(SHAFT_S0), P(SHAFT_S0 + 20), 8, step=4, motion="rot", approach=mul(A_OUT, 420))
tap("taraud-moyeu", "Taraudage M8 du fût (vis de pression)", Q(-7.5, 0, HUB_R), Q(-7.5, 0, SHAFT_R + 2), 8, step=7, motion="rot", approach=HUB_IN)
for i, c in enumerate((COL_L, PIV_C)):
    tap(f"taraud-colonne{i+1}", "Taraudage M8 des colonnes (côté platine)", Q(MECH_PLATE_S - 20, *c), Q(MECH_PLATE_S - 4, *c), 8, step=6, approach=BACK)
for i, dx in enumerate((-10, 10)):
    tap(f"taraud-electro{i+1}", "Taraudage M5 de l'électroaimant (d'origine)", Q(MECH_PLATE_S - 14, PLG_X + dx, -114), Q(MECH_PLATE_S - 4, PLG_X + dx, -114), 5, step=6, approach=BACK)
for nm, (cx, cy, cz), (sx, sy, sz) in (("controleur", (980, -W / 2, 160), (300, 200, 100)), ("alimentation", (260, -W / 2, 165), (280, 190, 110))):
    for j, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x, y = cx + ex * (sx / 2 - 25), cy + ey * (sy / 2 - 25)
        tap(f"taraud-platine-{nm}{j+1}", "Taraudage M6 de la platine (entretoises des coffrets)", (x, y, 0), (x, y, BASE_T), 6, step=8, approach=(0, 0, 600))
RIV6 = "Rivet-écrou M6 dans l'ossature (perçage Ø9)"
for j, (x, z) in enumerate(PANEL_SCREWS):
    tap(f"rivet-av{j+1}", RIV6, (x, -SHEET, z), (x, -SHEET - 12, z), 6, step=9, approach=(0, 700, 0))
    tap(f"rivet-ar{j+1}", RIV6, (x, -W + SHEET, z), (x, -W + SHEET + 12, z), 6, step=9, approach=(0, -700, 0))
for j, (y, z) in enumerate(SIDE_SCREWS):
    tap(f"rivet-je{j+1}", RIV6, (SHEET, y, z), (SHEET + 12, y, z), 6, step=9, approach=(-700, 0, 0))
    tap(f"rivet-js{j+1}", RIV6, (L - SHEET, y, z), (L - SHEET - 12, y, z), 6, step=9, approach=(700, 0, 0))
for i, sx in enumerate((-1, 1)):
    xo = HUB[0] + sx * (FL_X + 4)
    for j, dx in enumerate(TAB_HOLES):
        tap(f"rivet-lisse{i+1}-{j+1}", "Rivet-écrou M8 dans la lisse milieu (perçage Ø11)", (xo + sx * dx, _ys, 620), (xo + sx * dx, _ys + 12, 620), 8, step=3, approach=(sx * 200, -200, 0))
RIV4 = "Rivet-écrou M4 (capot et joues, perçage Ø6)"
for j, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
    x, y = 150 + ex * 70, -W / 2 + ey * 45
    tap(f"rivet-capot{j+1}", RIV4, (x, y, H), (x, y, H - 9), 4, step=8, approach=(0, 0, 500))
for nm, xf, sg in (("entree", 0, 1), ("sortie", L, -1)):
    for j, (ey, ez) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        y, z = -W / 2 + ey * 45, 960 + ez * 45
        tap(f"rivet-voyant-{nm}{j+1}", RIV4, (xf, y, z), (xf + sg * 9, y, z), 4, step=8, approach=(-sg * 520, 0, 0))

# Tableau des taraudages et filetages (pour le dossier).
THREADS = [
    # type, filetage, où, nombre, préparation, longueur utile, outil, serrage, freinage
    ("Taraudage", "M8×1,25", "Bout d'axe côté moyeu (vis + rondelle d'arrêt)", 1, "Foret Ø6,8 prof. 26", "20", "Taraud M8 (3 passes), au tour", "20 N·m", "Frein filet moyen"),
    ("Taraudage", "M8×1,25", "Fût du moyeu : vis de pression sur la clavette", 1, "Foret Ø6,8 jusqu'à l'alésage", "15", "Taraud M8", "10 N·m", "Frein filet moyen"),
    ("Taraudage", "M8×1,25", "Colonne Ø16 et colonne-pivot Ø14, côté platine", 2, "Foret Ø6,8 prof. 22", "16", "Taraud M8", "20 N·m", "Rondelle Grower inox"),
    ("Taraudage", "M6", "Platine de base, sous les 8 entretoises", 8, "Foret Ø5 traversant", "10", "Taraud M6, après galvanisation", "8 N·m", "—"),
    ("Taraudage", "M5", "Électroaimant (taraudages d'origine)", 2, "Platine : perçage Ø5,5", "8", "—", "5 N·m", "Frein filet moyen"),
    ("Rivet-écrou", "M6", "Ossature 30×30×2, vis de l'habillage", len(PANEL_SCREWS) * 2 + len(SIDE_SCREWS) * 2, "Foret Ø9", "—", "Pince à rivets-écrous", "8 N·m", "—"),
    ("Rivet-écrou", "M8", "Lisse milieu, languettes des flasques", 4, "Foret Ø11", "—", "Pince à rivets-écrous", "20 N·m", "Frein filet moyen"),
    ("Rivet-écrou", "M4", "Capot (lecteur) et joues (voyants)", 12, "Foret Ø6", "—", "Pince à rivets-écrous", "2,5 N·m", "—"),
    ("Filetage", "M25×1,5", "Bout d'axe côté disque (écrou à encoches)", 1, "Ø25 h7 + gorge Ø22,5 × 3", "24", "Outil à fileter, au tour", "≈ 60 N·m (clé à ergot)", "Rondelle frein MB5 pliée"),
    ("Filetage", "M10×1,5", "Bout de l'axe du levier", 1, "Ø10", "14", "Filière M10", "40 N·m", "Écrou Nylstop"),
    ("Filetage", "M8×1,25", "Bout de l'axe du galet", 1, "Ø8", "12", "Filière M8", "15 N·m", "Écrou Nylstop"),
    ("Filetage", "M12×1", "Corps du capteur inductif (d'origine)", 1, "Équerre : perçage Ø12,2", "—", "—", "10 N·m maxi", "2 contre-écrous"),
    ("Filetage", "M12", "Tiges des chevilles chimiques (A4, L 140)", 4, "Béton : Ø14 prof. 110", "110 scellés", "Souffler, brosser, résine", "40 N·m après durcissement", "—"),
]
SCREWS = [
    ("Vis H M10×30 A4 + rondelle + écrou", 2, "Bride ↔ pattes"),
    ("Vis H M8×22 A4 + rondelle", 4, "Languettes des flasques ↔ rivets-écrous"),
    ("Vis H M8×20 A4", 2, "Platine du mécanisme ↔ colonnes"),
    ("Vis H M8×20 A4 + rondelle d'arrêt Ø32", 1, "Bout d'axe (moyeu)"),
    ("Vis sans tête M8×10 bout plat", 1, "Moyeu, sur la clavette"),
    ("Vis H M5×16 A4", 2, "Électroaimant"),
    ("Vis M6×12 tête bombée A4", len(PANEL_SCREWS) * 2 + len(SIDE_SCREWS) * 2, "Habillage"),
    ("Vis M6×12 A4 + entretoises F/F M6 h100", 16, "Coffrets (8 entretoises)"),
    ("Vis M4×40 A4", 4, "Lecteur (traversent le boîtier)"),
    ("Vis M4×16 A4", 8, "Voyants"),
    ("Écrous Nylstop M10 / M8", 2, "Axes du levier et du galet"),
    ("Écrou à encoches M25×1,5 + rondelle MB5", 1, "Disque indexeur"),
    ("Tige filetée M12 A4 L140 + résine + rondelle + écrou", 4, "Chevilles chimiques"),
]

# ------------------------------------------------------------------ nomenclature (prix indicatifs, en dollars)
bom = [
    ("Habillage", "Tôle inox 316L 1,5 mm (2 panneaux, 2 joues, capot)", "≈ 3,6 m²", "Chaudronnier inox", 160),
    ("Ossature", "Tube carré inox 30×30×2", "≈ 12 m", "Chaudronnier inox", 55),
    ("Socle", "Platine de base acier galvanisé 1200×280×10 + 4 chevilles chimiques M12", "1", "Chaudronnier", 45),
    ("Bras", "Tube inox 316 Ø38×2 (3 bras de 436 mm, coupe biaise à 45°) + 3 embouts", "1,4 m", "Chaudronnier inox", 30),
    ("Bras", "Moyeu inox 304 : plateau Ø150×15 + fût Ø60, alésage Ø25 H7, clavette", "1", "Tourneur + soudeur", 45),
    ("Mécanisme", "Carter acier Ø70 alésé Ø52 (L 161) + bride 130×130×8 soudée", "1", "Tourneur + soudeur", 35),
    ("Ossature", "Fixation du carter : 2 pattes 30×40×6 + 2 flasques 8 mm + visserie M10/M8", "1 lot", "Chaudronnier", 10),
    ("Mécanisme", "Axe acier 42CrMo4 (42CD4) traité ≥ 750 MPa, rond Ø32 : Ø25 h7, épaulement Ø30, L 275, 2 rainures de clavette, filetage M25×1,5", "1", "Tourneur-fraiseur", 30),
    ("Mécanisme", "Disque indexeur S355 Ø140×10, 3 crans de verrouillage + 3 crans en V", "1", "Découpe + fraisage", 25),
    ("Mécanisme", "Roulements 6205-2RS + entretoise Ø32×Ø25×105", "2", "Achat + tourneur", 12),
    ("Mécanisme", "Moyeu du disque Ø45×22,5 (soudé) + rondelle frein MB5", "1", "Tourneur + soudeur", 8),
    ("Mécanisme", "Écrou à encoches M25×1,5 + rondelle frein", "1", "Achat", 5),
    ("Mécanisme", "Platine de mécanisme 8 mm + colonne Ø16 + colonne-pivot Ø14", "1", "Découpe + soudeur", 12),
    ("Mécanisme", "Électroaimant 24 V service continu, course 10 mm, force ≥ 40 N à 8 mm", "1", "Achat", 28),
    ("Mécanisme", "Cliquet acier trempé (corps 6 mm + dent 12×14) sur colonne-pivot Ø14, bague bronze, ressort de compression", "1", "Tourneur-fraiseur", 14),
    ("Mécanisme", "Levier de crantage, galet (roulement 608), ressort de compression", "1", "Tourneur + achat", 8),
    ("Mécanisme", "Capteur inductif M12 PNP 24 V + équerre", "1", "Achat", 8),
    ("Visserie", "Visserie inox A4 (M4 à M10), rivets-écrous M6/M8, 4 chevilles chimiques M12, entretoises, 2 serrures à clé, clavettes 8×7", "lot", "Achat", 45),
    ("Électronique", "Contrôleur ESP32 industriel 24 V, Ethernet/PoE, rail DIN", "1", "Achat", 60),
    ("Électronique", "Module MOSFET/relais 24 V pour l'électroaimant", "1", "Achat", 5),
    ("Électronique", "Alimentation rail DIN 24 V 5 A", "1", "Achat", 25),
    ("Électronique", "Module de secours 24 V + 2 batteries 12 V 7 Ah", "1", "Achat", 45),
    ("Électronique", "Lecteur NFC 13,56 MHz (PN532 pour le prototype)", "1", "Achat", 8),
    ("Électronique", "Module lecteur de QR code 2D (liaison série)", "1", "Achat", 45),
    ("Électronique", "Voyants 24 V flèche verte / croix rouge", "2", "Achat", 30),
    ("Électronique", "Buzzer, borniers, câbles, presse-étoupes", "lot", "Achat", 20),
]

def tooth_tip_r(alpha_deg):
    """Rayon (repère du disque) du coin le plus intérieur de la dent quand le cliquet est levé de alpha."""
    a = math.radians(alpha_deg)
    best = 1e9
    for x in (-6.0, 6.0):
        rx, ry = x - PIV_C[0], -57.0 - PIV_C[1]
        px, py = PIV_C[0] + rx * math.cos(a) - ry * math.sin(a), PIV_C[1] + rx * math.sin(a) + ry * math.cos(a)
        best = min(best, math.hypot(px, py))
    return best


LIFT_DEG = 22.0
RIDE_DEG = next(a / 10 for a in range(0, 400) if tooth_tip_r(a / 10) >= DISC_R)

design = {
    "name": "Tourniquet tripode EduPilote — prototype P1",
    "params": {"L": L, "W": W, "H": H, "hub": HUB, "tilt": TILT, "arm_len": ARM_LEN, "passage": round(HUB[1] + ARM_LEN), "arm_height": HUB[2]},
    "kin": {"center": vec(*HUB), "axis": A_OUT, "a_in": A_IN, "e1": E1, "e2": E2, "disc_r": DISC_R, "disc_s": DISC_S,
            "locks": DISC_LOCKS, "vs": DISC_VS, "lift_deg": LIFT_DEG, "ride_deg": RIDE_DEG, "galet_lift": 81.0 - abs(GALET_C[0]), "lever_len": lev_len,
            "mech": P(120), "plate": P(MECH_PLATE_S)},
    "steps": [{"title": t, "text": x} for t, x in STEPS],
    "threads": [dict(zip(("type", "filetage", "ou", "nombre", "preparation", "longueur", "outil", "serrage", "freinage"), t)) for t in THREADS],
    "screws": [{"designation": a, "nombre": b, "ou": c} for a, b, c in SCREWS],
    "parts": parts,
    "bom": [{"groupe": g, "designation": d, "quantite": q, "fabrication": f, "prix": p} for g, d, q, f, p in bom],
}
(HERE / "design.json").write_text(json.dumps(design, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------ géométrie : échantillons de surface et triangles
def _frame(p1, p2):
    ax = norm([p2[i] - p1[i] for i in range(3)])
    ref = U if abs(ax[0]) < 0.9 else vec(0, 1, 0)
    e1 = norm(cross(ax, ref))
    return ax, e1, cross(ax, e1)


def ring_pts(base, e1, e2, r, n):
    return [add(base, add(mul(e1, r * math.cos(2 * math.pi * k / n)), mul(e2, r * math.sin(2 * math.pi * k / n)))) for k in range(n)]


def box_corners(p):
    c, s, b = p["center"], p["size"], p["basis"]
    return [add(add(add(c, mul(b[0], dx * s[0])), mul(b[1], dy * s[1])), mul(b[2], dz * s[2]))
            for dx in (-0.5, 0.5) for dy in (-0.5, 0.5) for dz in (-0.5, 0.5)]


def samples(p):
    """Points répartis sur la pièce (pour les contrôles d'encombrement et de collision)."""
    t = p["type"]
    if t == "box":
        c, s, b = p["center"], p["size"], p["basis"]
        n = [max(2, int(s[k] // 6) + 1) for k in range(3)]
        out = []
        for i in range(n[0]):
            for j in range(n[1]):
                for k in range(n[2]):
                    f = (i / (n[0] - 1) - 0.5, j / (n[1] - 1) - 0.5, k / (n[2] - 1) - 0.5)
                    if 0.5 in map(abs, f):
                        out.append(add(add(add(c, mul(b[0], f[0] * s[0])), mul(b[1], f[1] * s[1])), mul(b[2], f[2] * s[2])))
        return out
    if t == "sphere":
        return [add(p["center"], mul(d, p["r"])) for d in (U, vec(0, 1, 0), vec(0, 0, 1), vec(-1, 0, 0), vec(0, -1, 0), vec(0, 0, -1))]
    if t == "prism":
        o, b = p["origin"], p["basis"]
        return [add(add(add(o, mul(b[0], x)), mul(b[1], y)), mul(b[2], z)) for x, y in p["outline"] for z in (0, p["depth"])]
    ax, e1, e2 = _frame(p["p1"], p["p2"])
    ln = math.dist(p["p1"], p["p2"])
    return [q for k in range(max(2, int(ln // 5) + 1)) for q in ring_pts(add(p["p1"], mul(ax, ln * k / max(1, int(ln // 5)))), e1, e2, p["r"], 36)]


def inside_box(pt, b, shrink=0.6):
    d = [pt[i] - b["center"][i] for i in range(3)]
    return all(abs(dot(d, b["basis"][k])) < b["size"][k] / 2 - shrink for k in range(3))


def tri_box(p):
    pts = box_corners(p)
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    out = []
    for a, b2, c2, d in faces:
        out += [(pts[a], pts[b2], pts[c2]), (pts[a], pts[c2], pts[d])]
    return out


def tri_cyl(p, n=32):
    p1, p2, r = p["p1"], p["p2"], p["r"]
    ax, e1, e2 = _frame(p1, p2)
    a, b = ring_pts(p1, e1, e2, r, n), ring_pts(p2, e1, e2, r, n)
    out = []
    ri = p.get("r_in", 0)
    ai, bi = (ring_pts(p1, e1, e2, ri, n), ring_pts(p2, e1, e2, ri, n)) if ri else (None, None)
    for k in range(n):
        k2 = (k + 1) % n
        out += [(a[k], a[k2], b[k2]), (a[k], b[k2], b[k])]
        if ri:
            out += [(ai[k], bi[k2], ai[k2]), (ai[k], bi[k], bi[k2]), (a[k], ai[k2], a[k2]), (a[k], ai[k], ai[k2]), (b[k], b[k2], bi[k2]), (b[k], bi[k2], bi[k])]
        else:
            out += [(p1, a[k2], a[k]), (p2, b[k], b[k2])]
    return out


def tri_sphere(p, n=10):
    c, r = p["center"], p["r"]
    pt = lambda i, j: add(c, [r * math.sin(math.pi * i / n) * math.cos(2 * math.pi * j / n), r * math.sin(math.pi * i / n) * math.sin(2 * math.pi * j / n), r * math.cos(math.pi * i / n)])
    return [t for i in range(n) for j in range(n) for t in ((pt(i, j), pt(i + 1, j), pt(i + 1, j + 1)), (pt(i, j), pt(i + 1, j + 1), pt(i, j + 1)))]


def tri_prism(p):
    o, b, dpt = p["origin"], p["basis"], p["depth"]
    P3 = lambda x, y, z: add(add(add(o, mul(b[0], x)), mul(b[1], y)), mul(b[2], z))
    ol, out = p["outline"], []
    cx, cy = sum(x for x, _ in ol) / len(ol), sum(y for _, y in ol) / len(ol)
    c0, c1 = P3(cx, cy, 0), P3(cx, cy, dpt)
    for k in range(len(ol)):
        (x1, y1), (x2, y2) = ol[k], ol[(k + 1) % len(ol)]
        a0, a1, b0, b1 = P3(x1, y1, 0), P3(x2, y2, 0), P3(x1, y1, dpt), P3(x2, y2, dpt)
        out += [(c0, a1, a0), (c1, b0, b1), (a0, a1, b1), (a0, b1, b0)]
    return out


TRI = {"box": tri_box, "cyl": tri_cyl, "tube": tri_cyl, "sphere": tri_sphere, "prism": tri_prism}
tris = [t for p in parts for t in (tri_cyl(p, p.get("seg", 32)) if p["type"] in ("cyl", "tube") else TRI[p["type"]](p))]
with open(HERE / "tourniquet_P1_assemblage.stl", "wb") as f:
    f.write(b"EduPilote tourniquet P1 (mm, echelle 1)".ljust(80, b" "))
    f.write(struct.pack("<I", len(tris)))
    for t in tris:
        f.write(struct.pack("<3f", 0, 0, 0))
        for v in t:
            f.write(struct.pack("<3f", *v))
        f.write(b"\0\0")

# ------------------------------------------------------------------ contrôles de cohérence
# 1) Le mécanisme intérieur reste derrière le panneau et sous le capot.
inner = {"bride", "disque", "clavette-disque", "ecrou", "platine-meca", "cliquet", "cliquet-dent", "electroaimant", "levier", "galet", "capteur", "support-capteur", "roulement2-ext"}
for p in parts:
    pts = samples(p)
    if p["id"] in inner or p["id"].startswith("colonne"):
        ymax = max(q[1] for q in pts)
        assert ymax < -SHEET - 2, f"{p['id']} dépasse du panneau côté passage (y max {ymax:.1f})"
    if p["group"] == "Mécanisme":
        zmax = max(q[2] for q in pts)
        assert zmax < H - 2, f"{p['id']} touche le capot (z max {zmax:.1f})"
# 2) Aucune pièce du mécanisme ou du moyeu ne pénètre l'ossature, la platine ou l'habillage.
fixed = [p for p in parts if p["group"] in ("Ossature", "Socle", "Habillage") and p["type"] == "box" and p["id"] != "panneau-passage"]
for p in parts:
    if p["group"] not in ("Mécanisme", "Bras"):
        continue
    for q in samples(p):
        for b in fixed:
            assert not inside_box(q, b), f"collision : {p['id']} dans {b['id']} en {[round(v) for v in q]}"
# 3) Le moyeu et les bras restent côté passage (devant le panneau).
for p in parts:
    if p["group"] == "Bras":
        ymin = min(q[1] for q in samples(p))
        assert ymin > 2, f"{p['id']} entre dans le caisson (y min {ymin:.1f})"
# 3 bis) Fixation du carter : pattes sous la lisse haute, flasques sur la lisse milieu, rien dans le disque.
for p in parts:
    if p["id"].startswith("flasque") or p["id"].startswith("patte"):
        pts = samples(p)
        assert max(q[1] for q in pts) <= -SHEET + 0.01, f"{p['id']} touche le panneau"
        assert max(q[2] for q in pts) <= H - FRAME - 2 + 0.5, f"{p['id']} dépasse sous la lisse haute"
        for q in pts:
            r = add(q, mul(list(HUB), -1))
            s_ = dot(r, A_IN)
            rad = math.sqrt(max(0.0, dot(r, r) - s_ * s_))
            assert not (DISC_S - 8 < s_ < DISC_S + 8 and rad < DISC_R + 3), f"{p['id']} gêne le disque"
patte_top = max(q[2] for p in parts if p["id"].startswith("patte") for q in samples(p))
assert H - FRAME - 2 - 3 < patte_top <= H - FRAME - 2 + 0.5, f"les pattes ne touchent pas la lisse haute ({patte_top:.1f})"
# 3 ter) Aucune fixation dans le volume balayé par le disque ou par les bras.
for p in parts:
    if p["group"] != FX or p.get("motion"):
        continue
    for q in samples(p):
        r = add(q, mul(list(HUB), -1))
        s_ = dot(r, A_IN)
        rad = math.sqrt(max(0.0, dot(r, r) - s_ * s_))
        assert not (DISC_S - DISC_T / 2 - 1.5 < s_ < DISC_S + DISC_T / 2 + 1.5 and rad < DISC_R + 2), f"{p['id']} dans le disque"
        assert not (s_ < 0 and q[1] > 4), f"{p['id']} dans le passage des bras"
# 4) La dent du cliquet est bien dans un cran au repos, le galet dans un V.
assert any(abs(((270 - c + 180) % 360) - 180) < 1 for c in DISC_LOCKS)
assert any(abs(((180 - c + 180) % 360) - 180) < 1 for c in DISC_VS)
print("contrôles de cohérence : OK")
print(f"{len(parts)} pièces, {len(tris)} triangles ; passage {design['params']['passage']} mm ; bras bas à {HUB[2] + ARMS[1][2] * ARM_LEN:.0f} mm")
