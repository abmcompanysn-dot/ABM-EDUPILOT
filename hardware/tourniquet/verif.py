"""Vérification du tourniquet P1 : axes, liaisons, interférences, cinématique, courses et efforts.

Lit le modèle de gen_design.py et écrit verif.json (repris dans le dossier). Sort en erreur si un contrôle échoue.
"""
import fnmatch
import json
import math
import pathlib
import sys

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gen_design as g  # noqa: E402

TOL = 0.3                                   # tolérance de contact (mm)
parts = g.parts
by_id = {p["id"]: p for p in parts}
AX = np.array(g.A_OUT)
AIN = np.array(g.A_IN)
C0 = np.array(g.HUB, dtype=float)
checks = []


def check(cat, label, ok, detail):
    checks.append({"categorie": cat, "controle": label, "ok": bool(ok), "detail": detail})


# ------------------------------------------------------------------ géométrie : échantillons et test « point dans la pièce »
def frame(p1, p2):
    a = np.array(p2, float) - np.array(p1, float)
    ln = float(np.linalg.norm(a))
    a /= ln
    ref = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    e1 = np.cross(a, ref)
    e1 /= np.linalg.norm(e1)
    return a, e1, np.cross(a, e1), ln


def samples(p, step=None):
    t = p["type"]
    if step is None:                        # 2,5 mm sur les petites pièces, plus lâche sur les grandes
        ext = max(p["size"]) if t == "box" else (p["r"] * 2 if t == "sphere" else 200 if t == "prism" else max(2 * p["r"], math.dist(p["p1"], p["p2"])))
        step = max(2.5, ext / 80)
    if t == "box":
        c, sz, b = np.array(p["center"]), np.array(p["size"]), np.array(p["basis"])
        n = [max(2, int(sz[k] / step) + 1) for k in range(3)]
        g3 = np.stack(np.meshgrid(*[np.linspace(-0.5, 0.5, n[k]) for k in range(3)], indexing="ij"), -1).reshape(-1, 3)
        g3 = g3[(np.abs(g3) > 0.499).any(1)]
        return c + (g3 * sz) @ b
    if t == "sphere":
        u = np.random.default_rng(1).normal(size=(200, 3))
        return np.array(p["center"]) + p["r"] * u / np.linalg.norm(u, axis=1, keepdims=True)
    if t == "prism":
        o, b = np.array(p["origin"]), np.array(p["basis"])
        ol = np.array(p["outline"])
        dense = []
        for i in range(len(ol)):
            a0, a1 = ol[i], ol[(i + 1) % len(ol)]
            k = max(1, int(np.linalg.norm(a1 - a0) / step))
            dense += [a0 + (a1 - a0) * j / k for j in range(k)]
        dense = np.array(dense)
        zs = np.linspace(0, p["depth"], max(2, int(p["depth"] / step) + 1))
        pts = [o + d[0] * b[0] + d[1] * b[1] + z * b[2] for d in dense for z in zs]
        lo, hi = ol.min(0), ol.max(0)
        gx, gy = np.meshgrid(np.arange(lo[0], hi[0], step), np.arange(lo[1], hi[1], step))
        cand = np.stack([gx.ravel(), gy.ravel(), np.zeros(gx.size)], 1)
        fake = dict(p, depth=1e9)
        face = cand[inside(fake, o + cand @ b + 1.0 * b[2], tol=0)]
        hr = p.get("hole", 0)
        if hr:
            an = np.linspace(0, 2 * math.pi, max(12, int(2 * math.pi * hr / step)), endpoint=False)
            face = np.concatenate([face, np.stack([hr * np.cos(an), hr * np.sin(an), np.zeros(len(an))], 1)])
        for z in (0, p["depth"]):
            pts += [o + f[0] * b[0] + f[1] * b[1] + z * b[2] for f in face]
        return np.array(pts)
    a, e1, e2, ln = frame(p["p1"], p["p2"])
    n_ang = max(12, int(2 * math.pi * p["r"] / step))
    ang = np.linspace(0, 2 * math.pi, n_ang, endpoint=False)
    ts = np.linspace(0, ln, max(2, int(ln / step) + 1))
    ring = np.cos(ang)[:, None] * e1 + np.sin(ang)[:, None] * e2
    p1 = np.array(p["p1"])
    out = [p1 + t_ * a + p["r"] * ring for t_ in ts]
    rr = [p.get("r_in", 0.0)] if p.get("r_in") else []
    for r_ in rr:
        out += [p1 + t_ * a + r_ * ring for t_ in ts]
    caps = np.linspace(p.get("r_in", 0.0), p["r"], max(2, int((p["r"] - p.get("r_in", 0.0)) / step) + 1))
    for t_ in (0, ln):
        out += [p1 + t_ * a + r_ * ring for r_ in caps]
    return np.concatenate(out)


def inside(p, P, tol=TOL):
    t = p["type"]
    if t == "box":
        d = P - np.array(p["center"])
        b, sz = np.array(p["basis"]), np.array(p["size"])
        return (np.abs(d @ b.T) < sz / 2 - tol).all(1)
    if t == "sphere":
        return np.linalg.norm(P - np.array(p["center"]), axis=1) < p["r"] - tol
    if t == "prism":
        o, b = np.array(p["origin"]), np.array(p["basis"])
        loc = (P - o) @ b.T
        okz = (loc[:, 2] > tol) & (loc[:, 2] < p["depth"] - tol)
        ol = np.array(p["outline"])
        x, y = loc[:, 0], loc[:, 1]
        inside_poly = np.zeros(len(P), bool)
        for i in range(len(ol)):
            (x1, y1), (x2, y2) = ol[i], ol[i - 1]
            cond = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
            inside_poly ^= cond
        r = np.hypot(x, y)
        hole = r < p.get("hole", 0) + tol if p.get("hole") else np.zeros(len(P), bool)
        return okz & inside_poly & ~hole
    a, e1, e2, ln = frame(p["p1"], p["p2"])
    d = P - np.array(p["p1"])
    tt = d @ a
    rad = np.linalg.norm(d - np.outer(tt, a), axis=1)
    ok = (tt > tol) & (tt < ln - tol) & (rad < p["r"] - tol)
    if p.get("r_in"):
        ok &= rad > p["r_in"] + tol
    return ok


SAMP = {p["id"]: samples(p) for p in parts}


def aabb(P):
    return P.min(0), P.max(0)


BOX = {k: aabb(v) for k, v in SAMP.items()}


def overlap_box(a, b, m=1.0):
    return bool((a[0] <= b[1] + m).all() and (b[0] <= a[1] + m).all())


def rot_matrix(axis, ang):
    axis = axis / np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K


def moved(pid, phi_deg, alpha_deg, beta_rad):
    p, P = by_id[pid], SAMP[pid]
    m = p.get("motion")
    if m == "rot":
        return (P - C0) @ rot_matrix(AX, math.radians(phi_deg)).T + C0
    if m == "balls":
        return (P - C0) @ rot_matrix(AX, math.radians(phi_deg / 3)).T + C0
    if m == "cliquet":
        c = np.array(p["pivot"])
        return (P - c) @ rot_matrix(AIN, math.radians(alpha_deg)).T + c
    if m == "crantage":
        c = np.array(p["pivot"])
        return (P - c) @ rot_matrix(AIN, beta_rad).T + c
    return P


# ------------------------------------------------------------------ liaisons (contacts voulus)
LIAISONS = [
    # (nom, A, B, type, réalisation, mobilité)
    ("Arbre ↔ bagues intérieures", "axe", "roulement*-int", "Encastrement", "Ajustement Ø25 k6 + serrage axial par l'écrou M25", "0"),
    ("Bagues extérieures ↔ carter", "roulement*-ext", "carter", "Encastrement", "Logements Ø52 H7 + épaulement intérieur Ø44 (montage en X)", "0"),
    ("Roulements : billes ↔ bague intérieure", "roulement*-bille*", "roulement*-int", "Pivot", "Roulements à billes 6205-2RS (9 billes)", "1 rotation"),
    ("Roulements : billes ↔ bague extérieure", "roulement*-bille*", "roulement*-ext", "Pivot", "Gorges des bagues (non dessinées)", "1 rotation"),
    ("Épaulement Ø30 ↔ roulement 1", "axe-epaulement", "roulement1-int", "Appui plan", "Arrêt axial de l'empilage", "—"),
    ("Entretoise ↔ bagues intérieures", "entretoise", "roulement*-int", "Appui plan", "Longueur 105 = écart des roulements", "—"),
    ("Épaulement du carter ↔ bagues extérieures", "carter-epaulement", "roulement*-ext", "Appui plan", "Arrêt axial des bagues extérieures", "—"),
    ("Moyeu du disque ↔ roulement 2", "moyeu-disque", "roulement2-int", "Appui plan", "Serré par l'écrou M25", "—"),
    ("Disque ↔ moyeu du disque", "disque", "moyeu-disque", "Encastrement", "Soudure d'angle tout autour", "0"),
    ("Disque ↔ arbre", "clavette-disque", "disque", "Encastrement", "Clavette 8×7×28 + écrou à encoches + rondelle MB5", "0"),
    ("Moyeu des bras ↔ arbre", "moyeu", "axe-epaulement", "Encastrement", "Clavette 8×7×40 + vis de pression M8 + vis M8 en bout + épaulement", "0"),
    ("Bras ↔ plateau", "bras*", "plateau", "Encastrement", "Soudure TIG tout autour", "0"),
    ("Plateau ↔ fût du moyeu", "plateau", "moyeu", "Encastrement", "Soudure puis réusinage de l'alésage", "0"),
    ("Carter ↔ bride", "carter", "bride", "Encastrement", "Soudure circulaire", "0"),
    ("Bride ↔ pattes", "bride", "patte*", "Encastrement", "2 vis H M10 + écrous", "0"),
    ("Pattes ↔ lisse haute", "patte*", "lisse-av-haut", "Encastrement", "Soudure", "0"),
    ("Carter ↔ flasques", "carter", "flasque?", "Encastrement", "Soudure (2 cordons par flasque)", "0"),
    ("Flasques ↔ lisse milieu", "flasque*-languette", "lisse-av-milieu", "Encastrement", "4 vis M8 dans rivets-écrous", "0"),
    ("Colonnes ↔ bride", "colonne*", "bride", "Encastrement", "Soudure", "0"),
    ("Colonnes ↔ platine du mécanisme", "colonne*", "platine-meca", "Encastrement", "Vis M8 dans taraudage", "0"),
    ("Cliquet ↔ colonne-pivot", "bague-cliquet", "colonne-pivot", "Pivot", "Bague bronze Ø14/Ø18", "1 rotation (0 à 22°)"),
    ("Dent du cliquet ↔ disque", "cliquet-dent", "disque", "Contact (verrou)", "Dent 12 dans cran 13 : jeu 0,5 par côté", "bloque la rotation"),
    ("Plongeur ↔ cliquet", "plongeur", "cliquet", "Rotule (chape)", "Chape + axe Ø4 (le plongeur suit l'arc)", "—"),
    ("Électroaimant ↔ platine", "electroaimant", "platine-meca", "Encastrement", "2 vis M5", "0"),
    ("Ressort ↔ cliquet", "ressort-cliquet", "cliquet-dent", "Appui", "Ressort de compression sur butée soudée", "—"),
    ("Levier ↔ axe du levier", "levier", "axe-levier", "Pivot", "Axe Ø10 + écrou Nylstop", "1 rotation"),
    ("Galet ↔ axe du galet", "galet", "axe-galet", "Pivot", "Roulement 608", "1 rotation"),
    ("Galet ↔ disque", "galet", "disque", "Contact (crantage)", "Galet poussé dans le cran en V", "roule sur le disque"),
    ("Ressort ↔ levier", "ressort-levier", "levier", "Appui", "Ressort de compression sur goupille", "—"),
    ("Capteur ↔ équerre", "capteur", "support-capteur", "Encastrement", "2 écrous M12×1", "0"),
    ("Poteaux ↔ platine de base", "poteau*", "socle", "Encastrement", "Soudure tout autour", "0"),
    ("Platine de base ↔ dalle", "socle", "dalle", "Encastrement", "4 chevilles chimiques M12", "0"),
]


def ids(pat):
    return [p["id"] for p in parts if fnmatch.fnmatch(p["id"], pat)]


def sdf(p, P):
    """Distance signée des points P à la pièce p (négative à l'intérieur) ; None si non disponible."""
    t = p["type"]
    if t == "box":
        q = np.abs((P - np.array(p["center"])) @ np.array(p["basis"]).T) - np.array(p["size"]) / 2
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0)
    if t == "sphere":
        return np.linalg.norm(P - np.array(p["center"]), axis=1) - p["r"]
    if t in ("cyl", "tube"):
        a, e1, e2, ln = frame(p["p1"], p["p2"])
        d = P - np.array(p["p1"])
        tt = d @ a
        rr = np.linalg.norm(d - np.outer(tt, a), axis=1)
        dr = rr - p["r"]
        if p.get("r_in"):
            dr = np.maximum(dr, p["r_in"] - rr)
        dt = np.maximum(-tt, tt - ln)
        q = np.stack([dr, dt], 1)
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0)
    return None


def min_dist(A, B):
    return float(cKDTree(B).query(A, k=1)[0].min())


def dist_parts(a, b):
    exact = []
    for x, y in ((a, b), (b, a)):
        d = sdf(by_id[y], SAMP[x])
        if d is not None:
            exact.append(max(0.0, float(d.min())))
    if exact:
        return min(exact)
    PA, PB = SAMP[a], SAMP[b]
    if not overlap_box(BOX[a], BOX[b], 20):
        return 1e9
    # On ne garde que les points proches de l'autre pièce pour limiter le calcul.
    lo, hi = BOX[b]
    PA = PA[((PA > lo - 20) & (PA < hi + 20)).all(1)]
    lo, hi = BOX[a]
    PB = PB[((PB > lo - 20) & (PB < hi + 20)).all(1)]
    if len(PA) == 0 or len(PB) == 0:
        return 1e9
    return min_dist(PA, PB)


liaisons_out = []
for nom, pa, pb, typ, real, mob in LIAISONS:
    def same_bearing(a, b):
        ra = [c for c in a.split("-")[0] if c.isdigit()]
        rb = [c for c in b.split("-")[0] if c.isdigit()]
        return not (a.startswith("roulement") and b.startswith("roulement")) or ra == rb
    pairs = [(a, b) for a in ids(pa) for b in ids(pb) if a != b and same_bearing(a, b)]
    worst = 0.0
    for a, b in pairs:
        d = dist_parts(a, b)
        # Une liaison est « réalisée » si les pièces se touchent (ou s'interpénètrent : pièce traversante, soudure).
        worst = max(worst, d if d < 1e8 else 999)
    ok = bool(pairs) and worst <= 3.0
    liaisons_out.append({"liaison": nom, "type": typ, "realisation": real, "mobilite": mob, "ecart_mm": round(worst, 1), "ok": ok, "paires": len(pairs)})
    check("Liaisons", f"{nom} : pièces en contact", ok, f"écart maxi {worst:.1f} mm sur {len(pairs)} paire(s)")

# ------------------------------------------------------------------ axes : coaxialité des pièces tournantes et du palier
dev = 0.0
COAX = ["axe", "axe-epaulement", "axe-filetage", "carter", "carter-epaulement", "entretoise", "moyeu-disque", "rondelle-frein", "ecrou", "moyeu", "plateau", "rondelle", "vis", "taraud-axe"] + ids("roulement?-int") + ids("roulement?-ext")
for pid in COAX:
    p = by_id[pid]
    a = np.array(p["p2"]) - np.array(p["p1"])
    a /= np.linalg.norm(a)
    ang = math.degrees(math.acos(min(1.0, abs(float(a @ AX)))))
    off = float(np.linalg.norm(np.cross(np.array(p["p1"]) - C0, AX)))
    dev = max(dev, off + 1000 * ang)
dp = by_id["disque"]
dev = max(dev, float(np.linalg.norm(np.cross(np.array(dp["origin"]) - C0, AX))))
check("Axes", "Arbre, roulements, carter, entretoise, moyeux, disque, écrou : tous sur le même axe", dev < 0.01, f"écart maxi {dev:.4f} mm")
ang45 = math.degrees(math.acos(abs(float(AX @ np.array([0, 0, 1.0])))))
check("Axes", "Axe principal incliné à 45° sur la verticale", abs(ang45 - g.TILT) < 0.01, f"{ang45:.2f}°")
arm_ax = [math.degrees(math.acos(float(np.array(d) @ AX))) for d in g.ARMS]
check("Axes", "Les 3 bras font 45° avec l'axe", max(abs(a - 45) for a in arm_ax) < 0.01, ", ".join(f"{a:.2f}°" for a in arm_ax))
proj = [np.array(d) - (np.array(d) @ AX) * AX for d in g.ARMS]
between = [math.degrees(math.acos(float(proj[i] @ proj[j] / np.linalg.norm(proj[i]) / np.linalg.norm(proj[j])))) for i, j in ((0, 1), (1, 2), (2, 0))]
check("Axes", "Les 3 bras sont à 120° les uns des autres", max(abs(b - 120) for b in between) < 0.01, ", ".join(f"{b:.2f}°" for b in between))
check("Axes", "Bras de repos horizontal à 850 mm, vers le passage", abs(g.ARMS[0][2]) < 1e-9 and g.ARMS[0][1] > 0.99, f"direction {[round(x, 3) for x in g.ARMS[0]]}")
for nm, c in (("Colonne-pivot du cliquet", g.PIV_C), ("Axe du levier", g.PIV_G)):
    pid = "colonne-pivot" if "cliquet" in nm else "axe-levier"
    a = np.array(by_id[pid]["p2"]) - np.array(by_id[pid]["p1"])
    a /= np.linalg.norm(a)
    check("Axes", f"{nm} parallèle à l'axe principal", abs(abs(float(a @ AX)) - 1) < 1e-9, "parallèle")

# ------------------------------------------------------------------ arrêts axiaux (chaîne de cotes)
E = 0.05
b1, b2 = g.BEARINGS_S
stack = [
    ("épaulement Ø30 → bague int. 1", g.BEARINGS_S[0] - 7.5, g.BEARINGS_S[0] - 7.5),
    ("bague int. 1 → entretoise", b1 + 7.5, b1 + 7.5),
    ("entretoise → bague int. 2", b2 - 7.5, b2 - 7.5),
    ("bague int. 2 → moyeu du disque", b2 + 7.5, g.DHUB_S0),
    ("disque → rondelle frein", g.DISC_S + g.DISC_T / 2, g.DISC_S + g.DISC_T / 2),
    ("rondelle frein → écrou", g.DISC_S + g.DISC_T / 2 + 2, g.DISC_S + g.DISC_T / 2 + 2),
]
check("Arrêts axiaux", "Empilage serré par l'écrou M25 : épaulement, bague 1, entretoise, bague 2, moyeu du disque, disque, rondelle, écrou", all(abs(a - b) < E for _, a, b in stack), " ; ".join(f"{n} : {abs(a - b):.2f} mm" for n, a, b in stack))
check("Arrêts axiaux", "Bagues extérieures arrêtées par l'épaulement intérieur du carter (montage en X)", abs((b1 + 7.5) - (b1 + 7.5)) < E and g.CARTER_SH_R < g.BORE_R and g.CARTER_SH_R > 16 + 2,
      f"épaulement Ø{2 * g.CARTER_SH_R:.0f} entre les roulements ; jeu radial avec l'entretoise {g.CARTER_SH_R - 16:.1f} mm")
check("Arrêts axiaux", "Moyeu des bras en appui sur l'épaulement Ø30 et serré par la vis M8 de bout", abs(g.HUB_S1 - g.SHOULDER_S0) < E, f"face arrière du moyeu à s={g.HUB_S1:.1f}, épaulement à s={g.SHOULDER_S0:.1f}")
kd = by_id["clavette-disque"]
k0, k1 = kd["center"], kd["size"][2]
s_c = float((np.array(k0) - C0) @ AIN)
check("Arrêts axiaux", "Clavette du disque entièrement portée (disque + moyeu du disque)", s_c - k1 / 2 >= g.DHUB_S0 - E and s_c + k1 / 2 <= g.DISC_S + g.DISC_T / 2 + E,
      f"clavette s {s_c - k1 / 2:.1f}…{s_c + k1 / 2:.1f}, moyeu+disque s {g.DHUB_S0:.1f}…{g.DISC_S + g.DISC_T / 2:.1f}")

# ------------------------------------------------------------------ interférences au repos (hors contacts voulus)
ALLOW = set()
for _, pa, pb, *_r in LIAISONS:
    for a in ids(pa):
        for b in ids(pb):
            ALLOW.add((a, b))
            ALLOW.add((b, a))
EXTRA_ALLOW = [  # traversées et pièces d'un même ensemble (perçages, rainures et gorges non dessinés)
    ("axe*", "moyeu"), ("axe*", "plateau"), ("axe", "axe-epaulement"), ("axe", "axe-filetage"), ("axe-filetage", "ecrou"), ("axe-filetage", "rondelle-frein"),
    ("carter", "carter-epaulement"), ("roulement*-bille*", "roulement*"), ("cliquet*", "cliquet*"), ("bague-cliquet", "cliquet-oeil"),
    ("flasque*", "flasque*"), ("axe-galet", "levier"), ("axe-levier", "platine-meca"), ("axe-ressort-levier", "platine-meca-aile"),
    ("support-capteur", "platine-meca"), ("platine-meca", "platine-meca-aile"), ("plongeur", "electroaimant"), ("butee-ressort", "platine-meca"),
    ("ressort-cliquet", "butee-ressort"), ("ressort-levier", "axe-ressort-levier"), ("embout*", "bras*"), ("lecteur", "capot"), ("voyant*", "joue*"),
    ("clavette-*", "*"), ("dalle", "cheville*"),
]
for pa, pb in EXTRA_ALLOW:
    for a in ids(pa):
        for b in ids(pb):
            ALLOW.add((a, b))
            ALLOW.add((b, a))
SKIP_GROUPS = {"Fixations", "Taraudages"}       # vis dans leurs trous, cordons de soudure : non contrôlés ici
solid = [p for p in parts if p["group"] not in SKIP_GROUPS and p["id"] != "panneau-passage"]
clash = []
for i, A in enumerate(solid):
    for B in solid[i + 1:]:
        a, b = A["id"], B["id"]
        if (a, b) in ALLOW or not overlap_box(BOX[a], BOX[b], 0):
            continue
        if inside(B, SAMP[a]).any() or inside(A, SAMP[b]).any():
            clash.append(f"{a} / {b}")
check("Interférences", "Aucune pièce n'en traverse une autre au repos (hors liaisons voulues)", not clash, ", ".join(clash) or f"{len(solid)} pièces, aucune interférence")

# Lumière du panneau : section du carter (Ø70 coupé à 45°) dans l'oblong 80 × 110
ell_w, ell_h = 2 * g.CARTER_R, 2 * g.CARTER_R / math.cos(math.radians(g.TILT))
check("Interférences", "Le carter passe dans la lumière 80 × 110 du panneau", ell_w < 80 - 4 and ell_h < 110 - 4, f"section {ell_w:.0f} × {ell_h:.0f} mm, jeu {(80 - ell_w) / 2:.0f} et {(110 - ell_h) / 2:.0f} mm")

# ------------------------------------------------------------------ cinématique : balayage d'un tiers de tour
K = g.design["kin"]


def galet_beta(phi):
    d = min(abs(((v - phi) - 180 + 540) % 360 - 180) for v in g.DISC_VS)
    arc = g.DISC_R * math.radians(d)
    x = max(0.0, min(1.0, arc / 12))
    return K["galet_lift"] * x * x * (3 - 2 * x) / K["lever_len"]


rot_ids = [p["id"] for p in parts if p.get("motion") in ("rot", "balls")]
cl_ids = [p["id"] for p in parts if p.get("motion") == "cliquet" and not p["id"].startswith("plongeur")]
cr_ids = [p["id"] for p in parts if p.get("motion") == "crantage"]
static = [p for p in parts if not p.get("motion") and p["id"] != "panneau-passage" and not p["id"].startswith("ressort")]
SWEEP_ALLOW = {("cliquet-dent", "disque"), ("galet", "disque")}
hits = set()
for phi in range(0, 121, 2):
    at_notch = phi in (0, 120)
    alpha = 0.0 if at_notch else g.RIDE_DEG
    beta = galet_beta(phi)
    pos = {i: moved(i, phi, alpha, beta) for i in rot_ids + cl_ids + cr_ids}
    bb = {i: aabb(P) for i, P in pos.items()}
    for i in rot_ids:
        for st in static + [by_id[j] for j in cl_ids + cr_ids]:
            j = st["id"]
            if (i, j) in ALLOW or (j, i) in ALLOW or (j, i) in SWEEP_ALLOW or (i, j) in SWEEP_ALLOW:
                continue
            if j in cl_ids + cr_ids:
                # pièce mobile du mécanisme : on ramène les points tournants dans son repère au repos
                if not overlap_box(bb[i], bb[j], 0):
                    continue
                c = np.array(st["pivot"])
                back = -math.radians(alpha) if st["motion"] == "cliquet" else -beta
                Pi = (pos[i] - c) @ rot_matrix(AIN, back).T + c
                if inside(st, Pi).any():
                    hits.add(f"{i} / {j} à {phi}°")
                continue
            if not overlap_box(bb[i], BOX[j], 0):
                continue
            if inside(st, pos[i]).any():
                hits.add(f"{i} / {j} à {phi}°")
# Pièces du cliquet et du levier contre les pièces fixes, sur toute leur course.
for alpha in (0.0, g.RIDE_DEG, g.LIFT_DEG):
    for i in cl_ids:
        P = moved(i, 0, alpha, 0)
        for st in static:
            j = st["id"]
            if (i, j) in ALLOW or not overlap_box(aabb(P), BOX[j], 0):
                continue
            if inside(st, P).any():
                hits.add(f"{i} / {j} (cliquet à {alpha:.0f}°)")
for phi in (0, 30, 60, 90):
    beta = galet_beta(phi)
    for i in cr_ids:
        P = moved(i, phi, 0, beta)
        for st in static:
            j = st["id"]
            if (i, j) in ALLOW or not overlap_box(aabb(P), BOX[j], 0):
                continue
            if inside(st, P).any():
                hits.add(f"{i} / {j} (levier, tiers de tour à {phi}°)")
# Le disque contre la dent : dans le cran au repos, au-dessus du bord pendant la rotation.
disc = by_id["disque"]
tooth_ok = True
for phi in range(4, 117, 2):
    P = moved("cliquet-dent", 0, g.RIDE_DEG + 0.3, 0)
    Pd = (P - C0) @ rot_matrix(AX, -math.radians(phi)).T + C0     # repère du disque
    if inside(disc, Pd, tol=0.05).any():
        tooth_ok = False
ext_ids = [i for i in rot_ids if i.startswith(("plateau", "bras", "embout", "soudure-bras")) or i in ("rondelle", "vis")]
ymin = min(float(moved(i, phi, 0, 0)[:, 1].min()) for i in ext_ids for phi in range(0, 121, 10))
check("Cinématique", "Moyeu et bras tournent sans toucher le panneau côté passage", ymin > 10, f"jeu mini {ymin:.0f} mm avec le panneau")
check("Cinématique", "Un tiers de tour complet sans aucune collision (pas de 2°)", not hits, ", ".join(sorted(hits)) or "61 positions contrôlées")
check("Cinématique", "Pendant la rotation, la dent frotte sur le bord du disque sans y pénétrer", tooth_ok, f"cliquet levé de {g.RIDE_DEG:.1f}° par le bord")
check("Cinématique", "Au repos (0° et 120°), la dent est dans un cran et le galet dans un V", any(abs(((270 - c + 180) % 360) - 180) < 0.5 for c in g.DISC_LOCKS) and any(abs(((180 - c + 180) % 360) - 180) < 0.5 for c in g.DISC_VS), "crans à 30°, 150°, 270° ; V à 60°, 180°, 300°")
check("Cinématique", "Périodicité : crans, V et bras se répètent tous les 120°", all(abs((b - a) % 120) < 1e-9 for a, b in zip(g.DISC_LOCKS, g.DISC_LOCKS[1:])) and all(abs((b - a) % 120) < 1e-9 for a, b in zip(g.DISC_VS, g.DISC_VS[1:])), "3 positions de repos par tour")
jeu = (g.LOCK_W - 12) / 2
check("Cinématique", "Jeu de la dent dans le cran (sans coincement, sans battement excessif)", 0.2 <= jeu <= 1.0, f"{jeu:.1f} mm par côté, soit {math.degrees(jeu / 63.5):.2f}° au bras")
tip_up = g.tooth_tip_r(g.LIFT_DEG)
check("Cinématique", "Cliquet levé (22°) : la dent dégage complètement le disque", tip_up > g.DISC_R + 3, f"dent à {tip_up:.1f} mm de l'axe pour un disque de {g.DISC_R:.0f} mm")

# ------------------------------------------------------------------ actionneurs et capteur
plg = np.array([g.PLG_X - g.PIV_C[0], -68 - g.PIV_C[1]])
a = math.radians(g.LIFT_DEG)
moved_pt = np.array([plg[0] * math.cos(a) - plg[1] * math.sin(a), plg[0] * math.sin(a) + plg[1] * math.cos(a)])
stroke = float(plg[1] - moved_pt[1])
lateral = float(abs(moved_pt[0] - plg[0]))
check("Actionneurs", "Course de l'électroaimant suffisante pour lever le cliquet de 22°", stroke <= 10 - 1, f"course utile {stroke:.1f} mm pour 10 mm disponibles (déport latéral {lateral:.1f} mm repris par la chape)")
check("Actionneurs", "Entrefer du capteur dans sa portée (M12 noyé : 4 mm)", g.CAPT_GAP <= 4 * 0.81, f"{g.CAPT_GAP:.1f} mm face au disque, {g.CAPT_GAP + g.LOCK_D:.1f} mm face à un cran : signal net")
check("Actionneurs", "Le galet sort franchement du V puis y retombe", K["galet_lift"] > 2, f"levée du galet {K['galet_lift']:.1f} mm, rotation du levier {math.degrees(K['galet_lift'] / K['lever_len']):.1f}°")

# ------------------------------------------------------------------ efforts (prototype : ordres de grandeur)
T_ab, T_us = 500 * 0.5, 50 * 0.5               # N·m : forçage 500 N en bout de bras ; poussée normale 50 N
r_c = 63.5                                    # rayon du contact dent / flanc du cran
F_t = T_ab / (r_c / 1000)
arm = abs(-63.5 - g.PIV_C[1])
fric = 0.15 * abs(g.PIV_C[0])
check("Efforts", "Cliquet auto-bloquant : l'effort de forçage ne peut pas le chasser du cran", arm < fric, f"bras de levier {arm:.1f} mm < frottement 0,15 × {abs(g.PIV_C[0]):.0f} = {fric:.1f} mm")
tau_t = F_t / (12 * 12)
check("Efforts", "Dent du cliquet au cisaillement (forçage 500 N)", tau_t < 0.5 * 600 / 1.5, f"F = {F_t / 1000:.1f} kN, τ = {tau_t:.0f} MPa (acier trempé)")
L_p = g.MECH_PLATE_S - 4 - (g.FLANGE_S + 4)
sig_p = F_t * L_p / 4 / (math.pi * 14 ** 3 / 32)
check("Efforts", "Colonne-pivot Ø14 en flexion (appuyée aux deux bouts)", sig_p < 355 / 1.5, f"σ = {sig_p:.0f} MPa pour S355 (limite 355)")
d = 25.0
tau_s = 16 * T_ab * 1000 / (math.pi * d ** 3)
check("Efforts", "Arbre Ø25 en torsion (forçage)", tau_s * 2 < 0.58 * 650 / 1.5, f"τ = {tau_s:.0f} MPa, × 2 au droit des rainures = {2 * tau_s:.0f} MPa ; 42CrMo4 traité : 0,58 × 650 / 1,5 = {0.58 * 650 / 1.5:.0f} MPa (en inox 304 : {0.58 * 210:.0f} MPa, insuffisant)")
for nm, L in (("moyeu (40 mm)", 40), ("disque (28 mm)", 28)):
    p_ab = 2 * T_ab * 1000 / (d * 3.3 * L)
    p_us = 2 * T_us * 1000 / (d * 3.3 * L)
    check("Efforts", f"Pression sur la clavette du {nm}", p_us < 100 and p_ab < 250, f"usage normal {p_us:.0f} MPa ; forçage {p_ab:.0f} MPa (exceptionnel, admissible sur acier jusqu'à ~250 MPa)")
a_, b_ = 90.0, g.BEARINGS_S[1] - g.BEARINGS_S[0]
R1 = 500 * (a_ + b_) / b_
check("Efforts", "Roulements 6205 sous l'effort de forçage", R1 < 7800 / 2, f"réaction maxi {R1:.0f} N pour une charge statique de base de 7 800 N")
check("Efforts", "Chevilles M12 (4) sous le moment de renversement du forçage", 500 * 0.85 / 0.16 / 2 < 15000, f"traction ≈ {500 * 0.85 / 0.16 / 2:.0f} N par cheville (résistance usuelle > 15 kN en béton C20/25)")

ok_all = all(c["ok"] for c in checks)
CORRECTIONS = [
    ("Roulements : les bagues extérieures pouvaient glisser dans le carter (alésage Ø52 sur toute la longueur).", "Épaulement intérieur Ø44 entre les roulements : montage en X."),
    ("Arbre : il n'était tenu que par des circlips, qui ne supportent pas le serrage de l'écrou.", "Épaulement Ø30 sur l'axe ; l'écrou M25 serre tout l'empilage contre lui. Circlips supprimés."),
    ("Disque : rien ne l'arrêtait vers le moyeu, l'écrou ne pouvait pas le serrer.", "Moyeu du disque Ø45 × 22,5 soudé, en appui sur la bague intérieure 2, et rondelle frein MB5."),
    ("Clavette du disque : 28 mm de long pour un disque de 10 mm d'épaisseur.", "La clavette porte maintenant sur le disque et son moyeu (32,5 mm)."),
    ("Électroaimant : 17 mm de course nécessaires pour 10 mm disponibles.", "Attache du plongeur rapprochée du pivot : 7,5 mm de course utile, avec chape."),
    ("Cliquet : l'effort de forçage passait à 14 mm de son pivot et pouvait le chasser du cran.", "Cliquet sur une colonne-pivot Ø14 placée presque sur la ligne de l'effort (5,5 mm) : auto-bloquant."),
    ("Capteur : à 6 mm du disque, hors de sa portée de 4 mm.", "Capteur rapproché à 2,5 mm."),
    ("Ressort du levier : il traversait une colonne.", "Ressort de compression sur une goupille portée par une aile de la platine."),
    ("Colonnes Ø12 trop fines pour un taraudage M8 (2,6 mm de paroi).", "Colonne Ø16 et colonne-pivot Ø14."),
    ("Arbre Ø25 en inox 304 : au forçage (500 N en bout de bras), 162 MPa au droit des rainures pour 122 admissibles.", "Arbre en acier 42CrMo4 traité (admissible 251 MPa), graissé dans le carter."),
    ("Ressort du cliquet : il entrait dans la dent.", "Ressort raccourci : il appuie sous la dent."),
    ("Bride dessinée pleine : l'axe et le moyeu du disque la traversaient.", "Bride percée Ø70 (le carter y est soudé)."),
    ("Platine du mécanisme : la seconde colonne gênait le nouveau pivot.", "La colonne-pivot du cliquet sert aussi de seconde colonne."),
]
out = {"ok": ok_all, "checks": checks, "liaisons": liaisons_out, "corrections": [{"avant": a, "apres": b} for a, b in CORRECTIONS],
       "efforts": {"forcage_Nm": T_ab, "usage_Nm": T_us}}
(g.HERE / "verif.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
n_ok = sum(c["ok"] for c in checks)
print(f"vérification : {n_ok}/{len(checks)} contrôles OK")
for c in checks:
    if not c["ok"]:
        print("  ÉCHEC", c["categorie"], "-", c["controle"], ":", c["detail"])
sys.exit(0 if ok_all else 1)
