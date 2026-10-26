"""Modèle d'un bidon (jerrican) de 20 L en PEHD — exemple de la méthode en 3 étapes.

Même méthode que le tourniquet (hardware/tourniquet/gen_design.py) :
  1. cotes et repère en tête du fichier (source unique des cotes) ;
  2. construction par formes simples (pavés, cylindres, tubes) -> bidon.json ;
  3. maillage, export STL, contrôles par assertions, rendu PNG.

Repère (mm) : origine au centre de la base, x = largeur (345), y = épaisseur (165),
z = vertical (z = 0 au sol). Le goulot est du côté x > 0, les poignées au-dessus.
"""
import json
import math
import struct
from pathlib import Path

HERE = Path(__file__).parent

# ------------------------------------------------------------------ 1. cotes principales
LARG, EPAIS, H_CORPS = 345.0, 165.0, 415.0   # corps du bidon
R_ANGLE = 20.0                               # arrondi des 4 arêtes verticales
PAROI = 2.5                                  # paroi PEHD
NOMINAL_L = 20.0                             # contenance nominale
EXPANSION = 0.05                             # volume d'air minimal au-dessus du liquide (5 %)
RHO_PEHD = 0.95e-6                           # kg/mm³
X_PANNEAU = (40.0, 50.0)                     # retrait du X de renfort par rapport aux bords (côtés, haut/bas)
X_LARG, X_SAILLIE = 18.0, 3.0                # nervure du X : largeur, saillie
POIGNEE_R, POIGNEE_Z = 11.0, 45.0            # barre de portage Ø22, axe 45 mm au-dessus du corps
POIGNEE_X = (-130.0, -40.0, 50.0)            # trois montants (portage à une main ou à deux)
MONTANT_R = 10.0
MAIN_MIN = 30.0                              # passage de la main sous la barre
GOULOT_X, GOULOT_INCL = 115.0, 20.0          # goulot sur le côté x > 0, incliné de 20° vers l'extérieur
GOULOT_R, GOULOT_RIN, GOULOT_L = 26.0, 21.0, 45.0   # Ø52 extérieur, ouverture Ø42
BOUCHON_R, BOUCHON_L = 31.0, 24.0
EVENT_X, EVENT_R, EVENT_L = -150.0, 6.0, 12.0     # évent (reniflard) près du bord opposé au goulot
BASCULE_MIN = 15.0                           # angle de basculement minimal, bidon plein (degrés)

ORANGE, NOIR, GRIS = "#f28c38", "#2b2f36", "#8b939c"


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


X, Y, Z = vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)
parts = []


def box(pid, name, group, color, center, size, basis=None):
    parts.append({"id": pid, "name": name, "group": group, "color": color, "type": "box",
                  "center": vec(*center), "size": vec(*size), "basis": basis or [X, Y, Z]})


def cyl(pid, name, group, color, p1, p2, r, r_in=0.0):
    d = {"id": pid, "name": name, "group": group, "color": color, "type": "cyl" if r_in <= 0 else "tube",
         "p1": vec(*p1), "p2": vec(*p2), "r": float(r)}
    if r_in > 0:
        d["r_in"] = float(r_in)
    parts.append(d)


# ------------------------------------------------------------------ 2. construction
# Corps : pavé à arêtes verticales arrondies = 2 pavés croisés + 4 cylindres d'angle.
zc = H_CORPS / 2
box("corps-x", "Corps (âme en largeur)", "Corps", ORANGE, (0, 0, zc), (LARG, EPAIS - 2 * R_ANGLE, H_CORPS))
box("corps-y", "Corps (âme en épaisseur)", "Corps", ORANGE, (0, 0, zc), (LARG - 2 * R_ANGLE, EPAIS, H_CORPS))
for i, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
    cx, cy = sx * (LARG / 2 - R_ANGLE), sy * (EPAIS / 2 - R_ANGLE)
    cyl(f"angle{i+1}", "Arête arrondie R20", "Corps", ORANGE, (cx, cy, 0), (cx, cy, H_CORPS), R_ANGLE)

# Renfort en X sur les deux grandes faces : 2 nervures par face, le long des diagonales du panneau.
pw, ph = LARG - 2 * X_PANNEAU[0], H_CORPS - 2 * X_PANNEAU[1]
diag, a = math.hypot(pw, ph), math.atan2(ph, pw)
for face, sy in (("avant", 1), ("arriere", -1)):
    for k, s in (("1", 1), ("2", -1)):
        e1 = vec(math.cos(a), 0, s * math.sin(a))
        basis = [e1, Y, cross(e1, Y)]
        cy = sy * (EPAIS / 2 + X_SAILLIE / 2 - 1)        # 1 mm noyé dans la paroi
        box(f"x-{face}-{k}", "Nervure du X de renfort", "Corps", ORANGE, (0, cy, zc), (diag, X_SAILLIE + 1, X_LARG), basis)

# Poignées : barre de portage sur trois montants.
zb = H_CORPS + POIGNEE_Z
cyl("barre", "Barre de portage Ø22", "Poignées", ORANGE, (POIGNEE_X[0] - POIGNEE_R, 0, zb), (POIGNEE_X[-1] + POIGNEE_R, 0, zb), POIGNEE_R)
for i, x in enumerate(POIGNEE_X):
    cyl(f"montant{i+1}", "Montant de poignée Ø20", "Poignées", ORANGE, (x, 0, H_CORPS - 2), (x, 0, zb), MONTANT_R)

# Goulot incliné, bouchon vissé, évent.
g = math.radians(GOULOT_INCL)
G_AX = vec(math.sin(g), 0, math.cos(g))
G0 = vec(GOULOT_X, 0, H_CORPS - 6)                    # 6 mm noyés dans le corps
G1 = add(G0, mul(G_AX, GOULOT_L))
cyl("goulot", "Goulot Ø52, ouverture Ø42", "Goulot", ORANGE, G0, G1, GOULOT_R, GOULOT_RIN)
cyl("bouchon", "Bouchon à vis Ø62", "Goulot", NOIR, add(G1, mul(G_AX, -14)), add(G1, mul(G_AX, BOUCHON_L - 14)), BOUCHON_R)
cyl("event", "Évent à clapet", "Goulot", NOIR, (EVENT_X, 0, H_CORPS - 2), (EVENT_X, 0, H_CORPS + EVENT_L), EVENT_R)

# ------------------------------------------------------------------ 3. calculs, export, contrôles
area_in = (LARG - 2 * PAROI) * (EPAIS - 2 * PAROI) - (4 - math.pi) * (R_ANGLE - PAROI) ** 2
vol_in_l = area_in * (H_CORPS - 2 * PAROI) / 1e6
niveau_20l = NOMINAL_L * 1e6 / area_in + PAROI                 # hauteur du liquide à 20 L
area_out = LARG * EPAIS - (4 - math.pi) * R_ANGLE ** 2
perim = 2 * (LARG + EPAIS) - (8 - 2 * math.pi) * R_ANGLE
masse_vide = (2 * area_out + perim * H_CORPS) * PAROI * RHO_PEHD
z_cg = niveau_20l / 2                                         # centre de gravité du liquide, bidon plein
bascule = math.degrees(math.atan2(EPAIS / 2, z_cg))           # basculement sur la petite largeur


def _frame(p1, p2):
    ax = norm([p2[i] - p1[i] for i in range(3)])
    ref = X if abs(ax[0]) < 0.9 else Y
    e1 = norm(cross(ax, ref))
    return ax, e1, cross(ax, e1)


def ring_pts(base, e1, e2, r, n):
    return [add(base, add(mul(e1, r * math.cos(2 * math.pi * k / n)), mul(e2, r * math.sin(2 * math.pi * k / n)))) for k in range(n)]


def box_corners(p):
    c, s, b = p["center"], p["size"], p["basis"]
    return [add(add(add(c, mul(b[0], dx * s[0])), mul(b[1], dy * s[1])), mul(b[2], dz * s[2]))
            for dx in (-0.5, 0.5) for dy in (-0.5, 0.5) for dz in (-0.5, 0.5)]


def tri_box(p):
    pts = box_corners(p)
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    out = []
    for a_, b_, c_, d_ in faces:
        out += [(pts[a_], pts[b_], pts[c_]), (pts[a_], pts[c_], pts[d_])]
    return out


def tri_cyl(p, n=48):
    p1, p2, r = p["p1"], p["p2"], p["r"]
    ax, e1, e2 = _frame(p1, p2)
    a_, b_ = ring_pts(p1, e1, e2, r, n), ring_pts(p2, e1, e2, r, n)
    ri = p.get("r_in", 0)
    ai, bi = (ring_pts(p1, e1, e2, ri, n), ring_pts(p2, e1, e2, ri, n)) if ri else (None, None)
    out = []
    for k in range(n):
        k2 = (k + 1) % n
        out += [(a_[k], a_[k2], b_[k2]), (a_[k], b_[k2], b_[k])]
        if ri:
            out += [(ai[k], bi[k2], ai[k2]), (ai[k], bi[k], bi[k2]), (a_[k], ai[k2], a_[k2]), (a_[k], ai[k], ai[k2]), (b_[k], b_[k2], bi[k2]), (b_[k], bi[k2], bi[k])]
        else:
            out += [(p1, a_[k2], a_[k]), (p2, b_[k], b_[k2])]
    return out


def tris_of(p):
    return tri_box(p) if p["type"] == "box" else tri_cyl(p)


tris = [t for p in parts for t in tris_of(p)]
pts = [v for t in tris for v in t]
bbox = [[min(q[i] for q in pts) for i in range(3)], [max(q[i] for q in pts) for i in range(3)]]
dims = [round(bbox[1][i] - bbox[0][i]) for i in range(3)]

# Contrôles : le script s'arrête avec un message clair si une cote est incohérente.
assert vol_in_l >= NOMINAL_L * (1 + EXPANSION), f"volume intérieur {vol_in_l:.1f} L < {NOMINAL_L * (1 + EXPANSION):.1f} L (20 L + 5 % d'air)"
assert POIGNEE_Z - POIGNEE_R >= MAIN_MIN, f"passage de main {POIGNEE_Z - POIGNEE_R:.0f} mm < {MAIN_MIN:.0f} mm"
assert 2 * GOULOT_RIN >= 40, f"ouverture du goulot Ø{2 * GOULOT_RIN:.0f} < Ø40 (remplissage)"
assert GOULOT_X - GOULOT_R > POIGNEE_X[-1] + POIGNEE_R + 10, "le goulot touche la poignée"
assert abs(EVENT_X) + EVENT_R < LARG / 2 - 10, "l'évent est à moins de 10 mm du bord du dessus"
assert bbox[1][0] <= LARG / 2 + 0.5 and bbox[0][0] >= -LARG / 2 - 0.5, f"une pièce dépasse en largeur ({bbox[0][0]:.1f} .. {bbox[1][0]:.1f})"
assert bbox[0][2] >= -0.01, "une pièce passe sous le sol"
assert bascule >= BASCULE_MIN, f"bidon plein instable : bascule à {bascule:.0f}° < {BASCULE_MIN:.0f}°"
assert all(p["r_in"] < p["r"] for p in parts if p["type"] == "tube"), "tube à paroi nulle ou négative"

design = {
    "name": "Bidon 20 L PEHD",
    "repere": "mm ; origine au centre de la base ; x largeur, y épaisseur, z vertical",
    "params": {"largeur": LARG, "epaisseur": EPAIS, "hauteur_corps": H_CORPS, "paroi": PAROI, "encombrement": dims},
    "calculs": {"volume_interieur_l": round(vol_in_l, 2), "niveau_20l_mm": round(niveau_20l), "masse_vide_kg": round(masse_vide, 2),
                "masse_pleine_eau_kg": round(masse_vide + NOMINAL_L, 1), "bascule_plein_deg": round(bascule, 1)},
    "parts": parts,
}
(HERE / "bidon.json").write_text(json.dumps(design, ensure_ascii=False, indent=1), encoding="utf-8")
with open(HERE / "bidon_20L.stl", "wb") as f:
    f.write(b"Bidon 20 L PEHD (mm, echelle 1)".ljust(80, b" "))
    f.write(struct.pack("<I", len(tris)))
    for t in tris:
        f.write(struct.pack("<3f", 0, 0, 0))
        for v in t:
            f.write(struct.pack("<3f", *v))
        f.write(b"\0\0")

print("contrôles de cohérence : OK")
print(f"{len(parts)} pièces, {len(tris)} triangles ; encombrement {dims[0]} × {dims[1]} × {dims[2]} mm")
print(f"volume intérieur {vol_in_l:.1f} L, niveau à 20 L : {niveau_20l:.0f} mm ; masse à vide {masse_vide:.2f} kg ; bascule plein {bascule:.0f}°")

# Rendu PNG (facultatif : nécessite matplotlib).
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
except ImportError:
    print("matplotlib absent : pas de rendu PNG")
else:
    fig = plt.figure(figsize=(8, 8), dpi=120)
    ax = fig.add_subplot(projection="3d")
    faces = [(t, p["color"]) for p in parts for t in tris_of(p)]     # une seule collection : tri en profondeur global
    ax.add_collection3d(Poly3DCollection([t for t, _ in faces], facecolors=[c for _, c in faces], linewidths=0,
                                         shade=True, lightsource=matplotlib.colors.LightSource(200, 60)))
    ax.set_xlim(-200, 200), ax.set_ylim(-200, 200), ax.set_zlim(0, 500)
    ax.set_box_aspect((400, 400, 500))
    ax.view_init(elev=22, azim=-58)
    ax.set_axis_off()
    fig.savefig(HERE / "bidon_rendu.png", bbox_inches="tight", facecolor="white")
    print("rendu : bidon_rendu.png")
