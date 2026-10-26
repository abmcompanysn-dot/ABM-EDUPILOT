"""Export CAO du tourniquet P1 (CadQuery + ezdxf) : STEP (assemblage, sous-ensembles soudés, pièces) et DXF de découpe.

Les volumes viennent de design.json (gen_design.py) puis reçoivent les détails de fabrication : tubes creux,
coupe biaise des bras, rainures de clavette, trous taraudés, perçages et découpes des tôles. Les DXF sont des
coupes à mi-épaisseur des mêmes volumes : STEP et DXF sont donc toujours identiques.
Filetages : modélisés en vrai (hélice ISO 60°) sur les vis, tiges, axes, capteur, écrous, rivets-écrous et trous taraudés.
Usage : python export_cao.py  →  out/step/ et out/dxf/
"""
import json
import math
import pathlib
import re
import sys
import unicodedata

import cadquery as cq
import ezdxf

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gen_design as g  # noqa: E402

OUT_S, OUT_D = HERE / "out" / "step", HERE / "out" / "dxf"
parts = {p["id"]: p for p in g.parts}

# ------------------------------------------------------------------ placement et volumes de base
def V(a):
    return cq.Vector(*a)


def unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def loc(xa, za, t):
    return cq.Location(cq.Plane(origin=V(t), xDir=V(xa), normal=V(za)))


def placement(p):
    t = p["type"]
    if t == "box":
        return loc(p["basis"][0], p["basis"][2], p["center"])
    if t == "prism":
        return loc(p["basis"][0], p["basis"][2], p["origin"])
    if t == "sphere":
        return loc([1, 0, 0], [0, 0, 1], p["center"])
    z = unit([p["p2"][i] - p["p1"][i] for i in range(3)])
    ref = [1, 0, 0] if abs(z[0]) < 0.9 else [0, 1, 0]
    return loc(unit(cross(ref, z)), z, p["p1"])


def local_solid(p):
    t = p["type"]
    if t == "box":
        sx, sy, sz = p["size"]
        return cq.Solid.makeBox(sx, sy, sz, pnt=cq.Vector(-sx / 2, -sy / 2, -sz / 2))
    if t == "sphere":
        return cq.Solid.makeSphere(p["r"], angleDegrees1=-90, angleDegrees2=90)
    if t == "prism":
        s = cq.Workplane("XY").polyline([tuple(x) for x in p["outline"]]).close().extrude(p["depth"])
        if p.get("hole"):
            s = s.cut(cq.Workplane("XY").circle(p["hole"]).extrude(p["depth"]))
        return s.val()
    ln = math.dist(p["p1"], p["p2"])
    s = cq.Workplane("XY").polygon(6, 2 * p["r"]).extrude(ln) if p.get("seg") == 6 else cq.Workplane("XY").circle(p["r"]).extrude(ln)
    if p.get("r_in"):
        s = s.cut(cq.Workplane("XY").circle(p["r_in"]).extrude(ln))
    return s.val()


# ------------------------------------------------------------------ détails de fabrication
TUBE_WALL = 2.0


def hollow_tube(p, sol):
    """Tube carré 30×30×2 : on évide le volume plein dans le sens de sa plus grande dimension."""
    sz = list(p["size"])
    k = sz.index(max(sz))
    inner = [s - 2 * TUBE_WALL for s in sz]
    inner[k] = sz[k] + 2
    return sol.cut(cq.Solid.makeBox(*inner, pnt=cq.Vector(*[-x / 2 for x in inner])))


def arm_world(p):
    """Bras Ø38×2 : tube creux, pied coupé en biais à 45° dans le plan de la face du plateau."""
    p1, p2 = p["p1"], p["p2"]
    d = unit([p2[i] - p1[i] for i in range(3)])
    start = [p1[i] - d[i] * 40 for i in range(3)]
    ln = math.dist(start, p2)
    z = d
    ref = [1, 0, 0] if abs(z[0]) < 0.9 else [0, 1, 0]
    tube = cq.Workplane("XY").circle(p["r"]).circle(p["r"] - 2).extrude(ln).val().moved(loc(unit(cross(ref, z)), z, start))
    face = g.P(g.HUB_S0)
    half = cq.Workplane(cq.Plane(origin=V(face), xDir=V(g.E1), normal=V(g.A_IN))).rect(3000, 3000).extrude(1500).val()
    return tube.cut(half)


# Perçages et découpes dans le repère propre des pièces planes : (axe d'épaisseur, liste de trous (u, v, Ø), découpes).
def local_uv(k):
    return [i for i in range(3) if i != k]


CX, CZ = g.L / 2, g.H / 2 + g.BASE_T / 2
ent = [(cx + ex * (sx / 2 - 25), cy + ey * (sy / 2 - 25)) for (cx, cy, sx, sy) in ((980, -g.W / 2, 300, 200), (260, -g.W / 2, 280, 190)) for ex in (-1, 1) for ey in (-1, 1)]
FEAT = {
    "socle": (2, [(x - CX, y + g.W / 2, 14) for x, y in [(60, -60), (g.L - 60, -60), (60, -g.W + 60), (g.L - 60, -g.W + 60)]]
                 + [(x - CX, y + g.W / 2, 5) for x, y in ent] + [(0, 0, 40)], []),
    "panneau-passage": (1, [(x - CX, z - CZ, 6.5) for x, z in g.PANEL_SCREWS], [("oblong", 0, g.HUB[2] + g.HUB[1] - CZ, 80, 110)]),
    "panneau-arriere": (1, [(x - CX, z - CZ, 6.5) for x, z in g.PANEL_SCREWS], []),
    "joue-entree": (0, [(y + g.W / 2, z - CZ, 6.5) for y, z in g.SIDE_SCREWS] + [(e * 45, 960 - CZ + f * 45, 6) for e in (-1, 1) for f in (-1, 1)], [("rect", 0, 960 - CZ, 110, 110)]),
    "joue-sortie": (0, [(y + g.W / 2, z - CZ, 6.5) for y, z in g.SIDE_SCREWS] + [(e * 45, 960 - CZ + f * 45, 6) for e in (-1, 1) for f in (-1, 1)], [("rect", 0, 960 - CZ, 110, 110)]),
    "capot": (2, [(150 - CX + e * 70, f * 45, 6) for e in (-1, 1) for f in (-1, 1)] + [(300 - CX, -10 + g.W / 2, 19), (900 - CX, -10 + g.W / 2, 19)], [("rect", 150 - CX, 0, 160, 60)]),
    "bride": (2, [(-50, 50, 11), (50, 50, 11)], []),
    "patte1": (2, [(8, 50 - g.PATTE_Y, 11)], []),
    "patte2": (2, [(-8, 50 - g.PATTE_Y, 11)], []),
    "platine-meca": (2, [(g.COL_L[0] + 3, g.COL_L[1] + 92.5, 9), (g.PIV_C[0] + 3, g.PIV_C[1] + 92.5, 9), (g.PLG_X - 10 + 3, -114 + 92.5, 5.5),
                         (g.PLG_X + 10 + 3, -114 + 92.5, 5.5), (g.PIV_G[0] + 3, g.PIV_G[1] + 92.5, 10.5)], []),
    "platine-meca-aile": (2, [(g.SPR_G[0] + 107.5, g.SPR_G[1] + 30, 8)], []),
    "flasque1-languette": (1, [(-(dx - g.TAB_L / 2), 620 - (g.LM_Z + 7.5), 9) for dx in g.TAB_HOLES], []),
    "flasque2-languette": (1, [((dx - g.TAB_L / 2), 620 - (g.LM_Z + 7.5), 9) for dx in g.TAB_HOLES], []),
    "support-capteur": (0, [(22, g.DISC_S - 206.5, 12.2)], []),
    "levier": (2, [(0, -g.lev_len / 2, 10.5), (0, g.lev_len / 2, 8.5)], []),
    "cliquet": (2, [(13, -3.5, 4.5)], []),
    "butee-ressort": (1, [], []),
}
# Volumes « outils » retirés des pièces dans le repère du caisson : rainures de clavette, trous taraudés, alésages.
CUTS = [("axe", "clavette-disque"), ("axe", "clavette-moyeu"), ("moyeu", "clavette-moyeu"), ("disque", "clavette-disque"), ("moyeu-disque", "clavette-disque"),
        ("axe", "taraud-axe"), ("moyeu", "taraud-moyeu"), ("colonne1", "taraud-colonne1"), ("colonne-pivot", "taraud-colonne2"),
        ("moyeu", "axe@brut"), ("plateau", "axe@brut"), ("electroaimant", "taraud-electro1"), ("electroaimant", "taraud-electro2")] + [("socle", t) for t in parts if t.startswith("taraud-platine")]


def apply_feat(pid, sol):
    if pid not in FEAT:
        return sol
    k, holes, cuts = FEAT[pid]
    p = parts[pid]
    if p["type"] == "box":
        depth, z0 = p["size"][k], -p["size"][k] / 2
    else:
        depth, z0 = p["depth"], 0.0
    u, v = local_uv(k)
    for (x, y, dd) in holes:
        c = [0.0, 0.0, 0.0]
        c[u], c[v], c[k] = x, y, z0 - 1
        d = [0.0, 0.0, 0.0]
        d[k] = 1.0
        sol = sol.cut(cq.Solid.makeCylinder(dd / 2, depth + 2, V(c), V(d)))
    for (kind, x, y, w, h) in cuts:
        dims = [0.0, 0.0, 0.0]
        dims[u], dims[v], dims[k] = w, h, depth + 2
        c = [0.0, 0.0, 0.0]
        c[u], c[v], c[k] = x, y, z0 + depth / 2
        tool = cq.Solid.makeBox(*dims, pnt=V([c[i] - dims[i] / 2 for i in range(3)]))
        if kind == "oblong":                               # bouts arrondis R = w/2
            tool = cq.Solid.makeBox(*[dims[i] if i != v else h - w for i in range(3)], pnt=V([c[i] - (dims[i] if i != v else h - w) / 2 for i in range(3)]))
            for sgn in (-1, 1):
                cc = list(c)
                cc[v] += sgn * (h - w) / 2
                cc[k] = z0 - 1
                dd_ = [0.0, 0.0, 0.0]
                dd_[k] = 1.0
                tool = tool.fuse(cq.Solid.makeCylinder(w / 2, depth + 2, V(cc), V(dd_)))
        sol = sol.cut(tool)
    return sol


# ------------------------------------------------------------------ filets ISO 60° (hélices réelles)
PITCH = {3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75}
_CACHE = {}


def _helix_one(r0, r1, p, L):
    half = (r1 - r0) * math.tan(math.radians(30)) + 0.02
    helix = cq.Wire.makeHelix(pitch=p, height=L, radius=r0)
    prof = cq.Workplane("XZ").polyline([(r0, -half - p * 0.06), (r1, -0.06 * p), (r1, 0.06 * p), (r0, half + p * 0.06)]).close()
    return prof.sweep(cq.Workplane().add(helix), isFrenet=True).val()


def _helix_sweep(r0, r1, p, L):
    """Filet hélicoïdal ; au-delà de 40 mm, tronçons d'un nombre entier de tours (raccord sans décalage)."""
    if L <= 40:
        return _helix_one(r0, r1, p, L)
    turns = max(1, int(30 / p))
    seg = turns * p
    pieces, z = [], 0.0
    while z < L - 1e-6:
        ln = min(seg, L - z)
        pieces.append(_helix_one(r0, r1, p, ln).moved(cq.Location(cq.Vector(0, 0, z))))
        z += seg
    return pieces[0].fuse(*pieces[1:]).clean() if len(pieces) > 1 else pieces[0]


def ext_thread(d, p, L):
    """Tige filetée de 0 à L sur Z : noyau au diamètre de fond + filet hélicoïdal jusqu'au diamètre nominal."""
    key = ("e", d, p, round(L, 2))
    if key not in _CACHE:
        r0 = (d - 1.2269 * p) / 2 - 0.05
        n = max(0.0, L - p)                        # le filet s'arrête un pas avant le bout (entrée du filet)
        core = cq.Solid.makeCylinder(r0 + 0.06, L)
        _CACHE[key] = core.fuse(_helix_sweep(r0, d / 2, p, n)).clean() if n > p else cq.Solid.makeCylinder(d / 2, L)
    return _CACHE[key]


def int_thread_tool(d, p, L):
    """Outil de taraudage de 0 à L sur Z : avant-trou au foret + sillon hélicoïdal jusqu'au diamètre nominal."""
    key = ("i", d, p, round(L, 2))
    if key not in _CACHE:
        r0 = (d - 1.0825 * p) / 2 - 0.05
        core = cq.Solid.makeCylinder(r0 + 0.06, L + 2, V((0, 0, -1)))
        _CACHE[key] = core.fuse(_helix_sweep(r0, d / 2, p, L).moved(cq.Location(cq.Vector(0, 0, 0)))).clean()
    return _CACHE[key]


def nut_thread(pid):
    """(d, pas) du taraudage d'un écrou."""
    if pid == "ecrou":
        return 25, 1.5
    if pid.startswith("ecrou-capteur"):
        return 12, 1.0
    if pid == "ecrou-galet":
        return 8, 1.25
    if pid == "ecrou-axe-levier":
        return 10, 1.5
    base = pid[: -len("-ecrou")]
    th = parts.get(base + "-tige", {}).get("thread")
    if th:
        return th["d"], th["p"]
    return None


def threaded_local(pid, p, sol):
    """Ajoute filets et taraudages à une pièce dans son repère local (cylindres : axe Z de 0 à L)."""
    th = p.get("thread")
    if p["type"] == "cyl" and th and not th.get("int"):
        return ext_thread(th["d"], th["p"], math.dist(p["p1"], p["p2"]))
    if pid == "axe":                               # bout d'axe M25×1,5 sur la longueur de la surépaisseur de dessin
        zf = parts["axe-filetage"]
        z0 = (pid and math.dist(p["p1"], zf["p1"]))
        ln = math.dist(zf["p1"], zf["p2"])
        ring = cq.Solid.makeCylinder(p["r"] + 1, ln + 1, V((0, 0, z0))).cut(cq.Solid.makeCylinder((25 - 1.2269 * 1.5) / 2, ln + 1, V((0, 0, z0))))
        return sol.cut(ring).fuse(ext_thread(25, 1.5, ln).moved(cq.Location(cq.Vector(0, 0, z0)))).clean()
    nt = nut_thread(pid) if ("ecrou" in pid and p["type"] in ("cyl", "tube")) else None
    if nt:
        ln = math.dist(p["p1"], p["p2"])
        key = ("n", pid if pid == "ecrou" else (round(p["r"], 2), p.get("seg"), round(ln, 2), nt))
        if key not in _CACHE:
            base = cq.Workplane("XY").polygon(6, 2 * p["r"]).extrude(ln).val() if p.get("seg") == 6 else cq.Solid.makeCylinder(p["r"], ln)
            _CACHE[key] = base.cut(int_thread_tool(nt[0], nt[1], ln))
        return _CACHE[key]
    if pid.startswith("rivet-"):                   # rivet-écrou : douille taraudée
        d = th["d"]
        ln = math.dist(p["p1"], p["p2"])
        key = ("r", d, round(ln, 2))
        if key not in _CACHE:
            _CACHE[key] = cq.Solid.makeCylinder(d / 2 + 1.5, ln).cut(int_thread_tool(d, PITCH[d], ln))
        return _CACHE[key]
    if pid.startswith("taraud-"):                  # outil de taraudage (retiré de la pièce dans CUTS)
        return int_thread_tool(th["d"], th["p"], math.dist(p["p1"], p["p2"]))
    if re.match(r"^entretoise-(controleur|alimentation)\d$", pid):   # entretoise femelle-femelle M6
        ln = math.dist(p["p1"], p["p2"])
        tool = int_thread_tool(6, 1.0, 12)
        return sol.cut(tool).cut(tool.moved(cq.Location(cq.Vector(0, 0, ln - 12))))
    return sol


def build_world():
    world = {}
    for pid, p in parts.items():
        if pid == "axe-filetage":
            continue
        if pid.startswith("bras"):
            world[pid] = arm_world(p)
            continue
        sol = local_solid(p)
        if re.match(r"^(poteau|lisse|traverse)", pid):
            sol = hollow_tube(p, sol)
        sol = apply_feat(pid, sol)
        sol = threaded_local(pid, p, sol)
        world[pid] = sol.moved(placement(p))
    world["axe@brut"] = local_solid(parts["axe"]).moved(placement(parts["axe"]))   # alésages du moyeu : axe sans son taraudage
    for tgt, tool in CUTS:
        world[tgt] = world[tgt].cut(world[tool])
    del world["axe@brut"]
    for k in [k for k in world if k.startswith("taraud-")]:   # les trous taraudés sont dans les pièces
        del world[k]
    return world


MERGE = {"axe-levier-filetage": "axe-levier", "axe-galet-filetage": "axe-galet", "axe-epaulement": "axe", "carter-epaulement": "carter", "cliquet-oeil": "cliquet", "cliquet-dent": "cliquet",
         "flasque1-languette": "flasque1", "flasque2-languette": "flasque2", "platine-meca-aile": "platine-meca",
         **{f"capot-bord-{n}": "capot" for n in ("av", "ar", "e", "s")}}
BUY = re.compile(r"^(roulement|galet$|electroaimant|plongeur|ressort|capteur$|controleur|alimentation|lecteur|voyant|dalle|clavette|rondelle-frein|ecrou$|bague-cliquet|embout)")
WELDED = {
    "SE1_ossature_soudee": r"^(socle|poteau\d|lisse-.*|traverse-.*|patte\d)$",
    "SE2_carter_soude": r"^(carter|carter-epaulement|bride|flasque\d|flasque\d-languette|colonne1|colonne-pivot)$",
    "SE3_moyeu_et_bras_soudes": r"^(plateau|moyeu|bras\d|embout\d)$",
    "SE4_disque_soude": r"^(disque|moyeu-disque)$",
    "SE5_platine_mecanisme": r"^(platine-meca|platine-meca-aile|butee-ressort|support-capteur|axe-levier|axe-ressort-levier)$",
    "SE6_cliquet": r"^(cliquet|cliquet-oeil|cliquet-dent)$",
}
# Pièces découpées dans de la tôle ou du plat : un DXF chacune (matière, épaisseur).
FLAT = {
    "socle": ("Acier S235 galvanisé", 10), "panneau-passage": ("Inox 316L brossé", 1.5), "panneau-arriere": ("Inox 316L brossé", 1.5),
    "joue-entree": ("Inox 316L brossé", 1.5), "joue-sortie": ("Inox 316L brossé", 1.5), "bride": ("Acier S235", 8),
    "patte1": ("Acier S235", 6), "flasque1": ("Acier S235", 8), "disque": ("Acier S355 (crans trempés)", 10),
    "platine-meca": ("Acier S235", 8), "plateau": ("Inox 304", 15), "support-capteur": ("Acier S235", 6),
    "levier": ("Acier S235", 6), "cliquet": ("Acier 42CrMo4 trempé", 6), "butee-ressort": ("Acier S235", 8),
}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:60]


def main():
    OUT_S.mkdir(parents=True, exist_ok=True)
    OUT_D.mkdir(parents=True, exist_ok=True)
    for f in list(OUT_S.glob("*")) + list(OUT_D.glob("*")):
        f.unlink()
    world = build_world()

    asm = cq.Assembly(name="Tourniquet_P1")
    for pid, sh in world.items():
        asm.add(sh, name=pid, color=cq.Color(parts[pid]["color"]))
    asm.export(str(OUT_S / "Tourniquet_P1_assemblage.step"))
    for nom, pat in WELDED.items():
        sub = cq.Assembly(name=nom)
        for pid, sh in world.items():
            if re.match(pat, pid):
                sub.add(sh, name=pid, color=cq.Color(parts[pid]["color"]))
        sub.export(str(OUT_S / f"{nom}.step"))

    pieces = {}
    for pid, p in parts.items():
        if pid not in world or (p["group"] in ("Fixations", "Taraudages") and pid not in MERGE) or BUY.match(pid):
            continue
        pieces.setdefault(MERGE.get(pid, pid), []).append(pid)
    seen = {}
    for root, members in pieces.items():
        p = parts[root]
        if p["name"] in seen:
            seen[p["name"]]["qte"] += 1
            continue
        inv = placement(p).inverse
        shapes = [world[m].moved(inv) for m in members]
        solid = shapes[0] if len(shapes) == 1 else shapes[0].fuse(*shapes[1:]).clean()
        idx = len(seen) + 1
        base = f"{idx:02d}_{slug(p['name'])}"
        cq.exporters.export(cq.Workplane().add(solid), str(OUT_S / f"{base}.step"))
        bb = solid.BoundingBox()
        info = {"fichier": f"{base}.step", "piece": p["name"], "groupe": p["group"], "qte": 1, "encombrement": f"{bb.xlen:.0f} × {bb.ylen:.0f} × {bb.zlen:.0f}"}
        if root == "socle":
            solid = apply_feat("socle", local_solid(p))
        if root in FLAT:
            if root in OUTSIDE:                          # tôle d'habillage : vue de l'extérieur, face brossée, haut en haut
                n = OUTSIDE[root]
                right = cross([0, 0, 1], n)
                wshape = world[members[0]] if len(members) == 1 else world[members[0]].fuse(*[world[m] for m in members[1:]])
                info["dxf"] = export_dxf(root, wshape.moved(loc(right, n, p["center"]).inverse), base, *FLAT[root], flat=True)
            else:
                info["dxf"] = export_dxf(root, solid, base, *FLAT[root])
        seen[p["name"]] = info
    liste = list(seen.values())
    for x in liste:                                  # quantités réelles sur les DXF
        if "dxf" in x:
            doc = ezdxf.readfile(OUT_D / x["dxf"])
            for t in doc.modelspace().query("TEXT"):
                t.dxf.text = t.dxf.text.replace("QTE?", str(x["qte"]))
            doc.saveas(OUT_D / x["dxf"])
    capot_dxf()
    (HERE / "out" / "cao.json").write_text(json.dumps(liste, ensure_ascii=False, indent=1), encoding="utf-8")
    write_readme(liste)
    print(f"STEP : assemblage + {len(WELDED)} sous-ensembles + {len(liste)} pièces ; DXF : {len(list(OUT_D.glob('*.dxf')))}")


# ------------------------------------------------------------------ DXF : coupe à mi-épaisseur du volume, dans son repère
OUTSIDE = {"panneau-passage": [0, 1, 0], "panneau-arriere": [0, -1, 0], "joue-entree": [-1, 0, 0], "joue-sortie": [1, 0, 0]}


def export_dxf(root, solid, base, matiere, ep, flat=False):
    p = parts[root]
    k = 2 if flat else (FEAT[root][0] if root in FEAT else 2)
    # on ramène l'axe d'épaisseur sur Z
    if k == 0:
        solid = solid.rotate(V((0, 0, 0)), V((0, 1, 0)), 90)
    elif k == 1:
        solid = solid.rotate(V((0, 0, 0)), V((1, 0, 0)), 90)
    bb = solid.BoundingBox()
    # coupe au milieu de l'épaisseur de la pièce principale (pas de l'ensemble fusionné)
    zmid = 0.0 if flat else p["depth"] / 2 if p["type"] == "prism" else (math.dist(p["p1"], p["p2"]) / 2 if p["type"] in ("cyl", "tube") else 0.0)
    face = cq.Workplane("XY", origin=(0, 0, zmid)).add(solid.intersect(cq.Solid.makeBox(bb.xlen + 20, bb.ylen + 20, 0.01, pnt=V((bb.xmin - 10, bb.ymin - 10, zmid)))))
    tmp = OUT_D / f"{base}.dxf"
    cq.exporters.export(face.faces("<Z"), str(tmp), exportType="DXF")
    doc = ezdxf.readfile(tmp)
    msp = doc.modelspace()
    if "DECOUPE" not in doc.layers:
        doc.layers.add("DECOUPE", color=7)
    if "TEXTE" not in doc.layers:
        doc.layers.add("TEXTE", color=3)
    for e in msp:
        e.dxf.layer = "DECOUPE"
    doc.header["$INSUNITS"] = 4
    y0 = bb.ymin - 12
    for i, t in enumerate([f"EduPilote tourniquet P1 - {p['name']}", f"Matiere : {matiere} - epaisseur {ep} mm - quantite QTE? - cotes en mm" + (" - vue cote exterieur (face brossee), haut en haut" if flat else "")]):
        msp.add_text(t, dxfattribs={"layer": "TEXTE", "height": 5 if i == 0 else 3.5}).set_placement((bb.xmin, y0 - i * 8))
    if root == "flasque1":                          # languette dépliée : développé exact
        doc.layers.add("PLIAGE", color=1, linetype="DASHED")
        t, (ri, kk) = 8.0, g.BEND_PLATE
        ba = bend_allowance(ri, kk, t)
        yf, z0 = g._ys, g.LM_Z - 20
        ys = yf - (ri + t)                           # fin du plat de la flasque (début du pli)
        flat = g.TAB_L - (ri + t)                    # plat de la languette après le pli
        xe = ys + ba + flat
        # bord avant de la flasque : on garde la partie au-dessus de la languette (avec une encoche de dégagement de 2 mm)
        for e in list(msp.query("LINE")):
            st, en = e.dxf.start, e.dxf.end
            if abs(st[0] - yf) < 0.01 and abs(en[0] - yf) < 0.01:
                top = max(st[1], en[1])
                msp.delete_entity(e)
                msp.add_line((yf, top), (yf, z0 + 57), dxfattribs={"layer": "DECOUPE"})
        msp.add_lwpolyline([(yf, z0 + 57), (ys, z0 + 57), (ys, z0 + 55), (xe, z0 + 55), (xe, z0), (yf, z0)], dxfattribs={"layer": "DECOUPE"})
        msp.add_line((ys + ba / 2, z0), (ys + ba / 2, z0 + 55), dxfattribs={"layer": "PLIAGE"})
        for dx in g.TAB_HOLES:
            msp.add_circle((ys + ba + dx - (ri + t), 620), 4.5, dxfattribs={"layer": "DECOUPE"})
        msp.add_text(f"languette depliee : pli a 90 deg, rayon interieur {ri:.0f}, facteur K {kk}, developpe du pli {ba:.1f} mm (trait rouge = axe de pli)", dxfattribs={"layer": "TEXTE", "height": 3}).set_placement((ys + ba + flat + 6, z0 + 30))
        msp.add_text(f"apres pliage : languette de {g.TAB_L:.0f} mm depuis la face, trous O9 a {g.TAB_HOLES[0]:.0f} et {g.TAB_HOLES[1]:.0f} mm", dxfattribs={"layer": "TEXTE", "height": 3}).set_placement((ys + ba + flat + 6, z0 + 22))
    doc.saveas(tmp)
    return tmp.name


def bend_allowance(ri, k, t, angle=90.0):
    """Longueur développée d'un pli (fibre neutre) : BA = angle × (ri + K·t)."""
    return math.radians(angle) * (ri + k * t)


def capot_dxf():
    """Capot : développé exact (pli à 90°, rayon intérieur et facteur K de BEND_SHEET), découpes et perçages."""
    t = g.SHEET
    ri, kk = g.BEND_SHEET
    ba = bend_allowance(ri, kk, t)
    Lc, Wc, f = g.L + 20, g.W + 20, g.CAPOT_F                 # cotes extérieures du capot plié
    ax, ay = Lc / 2 - (ri + t), Wc / 2 - (ri + t)            # demi-plat du dessus jusqu'au début des plis
    fl = f - (ri + t)                                        # plat de chaque bord
    ox, oy = ax + ba + fl, ay + ba + fl
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4
    doc.layers.add("DECOUPE", color=7)
    doc.layers.add("PLIAGE", color=1, linetype="DASHED")
    doc.layers.add("TEXTE", color=3)
    msp = doc.modelspace()
    pts = [(-ax - ba, -oy), (ax + ba, -oy), (ax + ba, -ay - ba), (ox, -ay - ba), (ox, ay + ba), (ax + ba, ay + ba), (ax + ba, oy),
           (-ax - ba, oy), (-ax - ba, ay + ba), (-ox, ay + ba), (-ox, -ay - ba), (-ax - ba, -ay - ba)]
    msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "DECOUPE"})
    for sgn in (-1, 1):                                       # axe de pli au milieu de la zone de pli
        msp.add_line((sgn * (ax + ba / 2), -ay - ba), (sgn * (ax + ba / 2), ay + ba), dxfattribs={"layer": "PLIAGE"})
        msp.add_line((-ax - ba, sgn * (ay + ba / 2)), (ax + ba, sgn * (ay + ba / 2)), dxfattribs={"layer": "PLIAGE"})
    k, holes, cuts = FEAT["capot"]
    for (x, y, d) in holes:
        msp.add_circle((x, y), d / 2, dxfattribs={"layer": "DECOUPE"})
    for (_, x, y, w, h) in cuts:
        msp.add_lwpolyline([(x - w / 2, y - h / 2), (x + w / 2, y - h / 2), (x + w / 2, y + h / 2), (x - w / 2, y + h / 2)], close=True, dxfattribs={"layer": "DECOUPE"})
    txt = [f"EduPilote tourniquet P1 - Capot superieur, developpe exact : {2 * ox:.1f} x {2 * oy:.1f} mm",
           f"Inox 316L 1,5 mm - plis a 90 deg vers le bas, rayon interieur {ri} mm, facteur K {kk}, longueur developpee du pli {ba:.2f} mm (traits rouges = axe de pli)",
           f"Cotes exterieures apres pliage : {Lc:.0f} x {Wc:.0f} x {f:.0f} mm - quantite 1 - serrures a cle O19 sur le dessus, cote passage"]
    for i, tx in enumerate(txt):
        msp.add_text(tx, dxfattribs={"layer": "TEXTE", "height": 5 if i == 0 else 3.5}).set_placement((-ox, -oy - 14 - 8 * i))
    doc.saveas(OUT_D / "32b_Capot_superieur_developpe.dxf")


def write_readme(liste):
    lines = ["FICHIERS CAO DU TOURNIQUET P1 (unites : mm)", "",
             "STEP (dossier step) :",
             "  Tourniquet_P1_assemblage.step : assemblage complet, chaque piece nommee et coloree.",
             *[f"  {k}.step : sous-ensemble soude, coordonnees du caisson." for k in WELDED],
             "  NN_nom.step : une piece a fabriquer, dans son propre repere (axe principal = Z).", "",
             "DXF (dossier dxf) : contours de decoupe laser/plasma a l'echelle 1, calque DECOUPE ; textes calque TEXTE ;",
             "  capot developpe avec traits de pliage (calque PLIAGE).", "",
             "Pieces :"]
    lines += [f"  {x['fichier']}  x{x['qte']}  ({x['encombrement']} mm){'  + ' + x['dxf'] if 'dxf' in x else ''}  - {x['piece']}" for x in liste]
    lines += ["", "Filets : dessines en 3D (helice ISO 60 deg) sur les vis, tiges, axes, capteur, ecrous, rivets-ecrous et trous taraudes.",
              "Pliages : developpes exacts (rayon interieur et facteur K indiques sur chaque DXF). Les gorges des roulements ne sont pas dessinees (achat).",
              "Les achats (roulements, electroaimant, capteur, visserie, electronique) sont dans l'assemblage seulement.",
              "Ces fichiers sont regeneres par : python gen_design.py && python export_cao.py"]
    (HERE / "out" / "LISEZMOI_CAO.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
