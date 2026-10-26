"""Dossier de fabrication du tourniquet P1 : plans cotés A3, nomenclature, montage, recette.

Toutes les cotes viennent de gen_design.py (même source que la 3D). Sortie : out/dossier.html,
imprimé en PDF par print_pdf.js.
"""
import datetime
import json
import html
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import gen_design as g

OUT = g.HERE / "out"
DATE = datetime.date.today().strftime("%d/%m/%Y")
FONT = "Arial, Helvetica, sans-serif"
INK, DIM, AXIS, CUT = "#111", "#1f4fbf", "#c0392b", "#f3f5f8"

# ------------------------------------------------------------------ valeurs dérivées
L, W, H, T = g.L, g.W, g.H, g.SHEET
HX, HY, HZ = g.HUB
C45 = math.cos(math.radians(g.TILT))
S_PANEL = HY / C45                     # abscisse où l'axe traverse le panneau (y = 0)
Z_PANEL = HZ + S_PANEL * C45           # hauteur de la lumière
ARM_TUBE = g.ARM_LEN - g.ARM_START     # longueur de tube sur l'axe (coupe biaise côté moyeu)
FOOT = -g.HUB_S0                        # rayon où l'axe d'un bras rencontre la face du plateau
SH0 = g.SHAFT_S0                       # origine des cotes de l'axe
LOW_TIP = HZ + g.ARMS[1][2] * g.ARM_LEN
SIDE_TIP = g.ARMS[1][0] * g.ARM_LEN
OUT_TIP = HY + g.ARMS[1][1] * g.ARM_LEN
PASSAGE = HY + g.ARM_LEN


def esc(s):
    return html.escape(str(s), quote=True)


class Svg:
    """Dessin en millimètres papier (A3 paysage 420 × 297)."""

    def __init__(self):
        self.el = []

    def add(self, s):
        self.el.append(s)

    def line(self, x1, y1, x2, y2, w=0.35, c=INK, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{c}" stroke-width="{w}"{d}/>')

    def rect(self, x, y, w, h, sw=0.35, fill="none", c=INK, dash=None):
        x, w = (x, w) if w >= 0 else (x + w, -w)
        y, h = (y, h) if h >= 0 else (y + h, -h)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" fill="{fill}" stroke="{c}" stroke-width="{sw}"{d}/>')

    def poly(self, pts, sw=0.35, fill="none", c=INK, close=True):
        tag = "polygon" if close else "polyline"
        p = " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)
        self.add(f'<{tag} points="{p}" fill="{fill}" stroke="{c}" stroke-width="{sw}" stroke-linejoin="round"/>')

    def circle(self, x, y, r, sw=0.35, fill="none", c=INK, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="{fill}" stroke="{c}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=3.2, anchor="start", c=INK, weight="normal", rot=0):
        tr = f' transform="rotate({rot} {x:.2f} {y:.2f})"' if rot else ""
        self.add(f'<text x="{x:.2f}" y="{y:.2f}" font-family="{FONT}" font-size="{size}" fill="{c}" text-anchor="{anchor}" font-weight="{weight}"{tr}>{esc(s)}</text>')

    def axis(self, x1, y1, x2, y2):
        self.line(x1, y1, x2, y2, 0.25, AXIS, "6 1.5 1 1.5")

    def arrow(self, x, y, ang, c=DIM, size=2.4):
        a1, a2 = ang + math.radians(160), ang - math.radians(160)
        self.poly([(x, y), (x + size * math.cos(a1), y + size * math.sin(a1)), (x + size * math.cos(a2), y + size * math.sin(a2))], 0.1, c, c)

    def dim(self, x1, y1, x2, y2, off, label, size=3.0):
        """Cote entre deux points ; off > 0 : à gauche du sens de parcours (au-dessus pour une cote de gauche à droite)."""
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy) or 1
        nx, ny = dy / n, -dx / n
        sgn = 1 if off >= 0 else -1
        a1, a2 = (x1 + nx * off, y1 + ny * off), (x2 + nx * off, y2 + ny * off)
        for (px, py), (qx, qy) in (((x1, y1), a1), ((x2, y2), a2)):
            self.line(px + nx * sgn, py + ny * sgn, qx + nx * 1.5 * sgn, qy + ny * 1.5 * sgn, 0.18, DIM)
        self.line(*a1, *a2, 0.22, DIM)
        ang = math.atan2(dy, dx)
        self.arrow(a1[0], a1[1], ang + math.pi)
        self.arrow(a2[0], a2[1], ang)
        rot = math.degrees(ang)
        if rot > 90 or rot <= -90:
            rot -= 180 if rot > 0 else -180
        up = (math.sin(math.radians(rot)), -math.cos(math.radians(rot)))
        mx, my = (a1[0] + a2[0]) / 2 + up[0] * 1.0, (a1[1] + a2[1]) / 2 + up[1] * 1.0
        self.text(mx, my, label, size, "middle", DIM, rot=round(rot, 2))

    def leader(self, x, y, tx, ty, label, size=3.0):
        self.line(x, y, tx, ty, 0.2, INK)
        self.circle(x, y, 0.6, 0.1, INK)
        self.line(tx, ty, tx + (len(label) * size * 0.52) * (1 if tx >= x else -1), ty, 0.2, INK)
        self.text(tx + (1 if tx >= x else -1), ty - 1, label, size, "start" if tx >= x else "end")

    def svg(self):
        return '<svg class="sheet" viewBox="0 0 420 297" xmlns="http://www.w3.org/2000/svg">' + "".join(self.el) + "</svg>"


class View:
    """Projection d'une vue : coordonnées objet (mm, b vers le haut) → papier à l'échelle 1/k."""

    def __init__(self, svg, ox, oy, k, title=None, ty=9):
        self.s, self.ox, self.oy, self.f = svg, ox, oy, 1.0 / k
        if title:
            svg.text(ox, oy + ty, title, 3.4, "start", INK, "bold")

    def p(self, a, b):
        return self.ox + a * self.f, self.oy - b * self.f

    def rect(self, a0, b0, a1, b1, **kw):
        x0, y0 = self.p(a0, b1)
        x1, y1 = self.p(a1, b0)
        self.s.rect(x0, y0, x1 - x0, y1 - y0, **kw)

    def line(self, a0, b0, a1, b1, **kw):
        self.s.line(*self.p(a0, b0), *self.p(a1, b1), **kw)

    def circle(self, a, b, r, **kw):
        self.s.circle(*self.p(a, b), r * self.f, **kw)

    def poly(self, pts, **kw):
        self.s.poly([self.p(a, b) for a, b in pts], **kw)

    def axis(self, a0, b0, a1, b1):
        self.s.axis(*self.p(a0, b0), *self.p(a1, b1))

    def ellipse(self, a, b, ra, rb, rot=0, sw=0.35, dash=None, fill="none"):
        x, y = self.p(a, b)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.s.add(f'<ellipse cx="{x:.2f}" cy="{y:.2f}" rx="{ra * self.f:.2f}" ry="{rb * self.f:.2f}" transform="rotate({-rot:.2f} {x:.2f} {y:.2f})" fill="{fill}" stroke="{INK}" stroke-width="{sw}"{d}/>')

    def dim(self, a0, b0, a1, b1, off, label):
        self.s.dim(*self.p(a0, b0), *self.p(a1, b1), off, label)

    def leader(self, a, b, da, db, label):
        x, y = self.p(a, b)
        self.s.leader(x, y, x + da, y + db, label)

    def text(self, a, b, s, **kw):
        self.s.text(*self.p(a, b), s, **kw)

    def band(self, a0, b0, a1, b1, r, **kw):
        """Cylindre vu de côté (rectangle orienté entre deux points de l'axe)."""
        dx, dy = a1 - a0, b1 - b0
        n = math.hypot(dx, dy)
        nx, ny = -dy / n * r, dx / n * r
        self.poly([(a0 + nx, b0 + ny), (a1 + nx, b1 + ny), (a1 - nx, b1 - ny), (a0 - nx, b0 - ny)], **kw)


def frame(svg, num, title, scale, notes=()):
    svg.rect(10, 10, 400, 277, 0.6)
    x0, y0 = 250, 252
    svg.rect(x0, y0, 160, 35, 0.5, "#fff")
    svg.line(x0, y0 + 11, x0 + 160, y0 + 11, 0.3)
    svg.line(x0, y0 + 23, x0 + 160, y0 + 23, 0.3)
    svg.line(x0 + 112, y0, x0 + 112, y0 + 35, 0.3)
    svg.text(x0 + 3, y0 + 7.5, "EduPilote · Tourniquet tripode P1", 4.2, weight="bold")
    svg.text(x0 + 3, y0 + 18.5, title, 4.4, weight="bold")
    svg.text(x0 + 3, y0 + 29, f"Unités : mm · Échelle {scale} · Tolérances générales ISO 2768-m", 2.8)
    svg.text(x0 + 3, y0 + 33.2, "Prototype à valider par un mécanicien avant la découpe", 2.6, c=AXIS)
    svg.text(x0 + 136, y0 + 8.3, f"{num}", 6.5, "middle", weight="bold")
    svg.text(x0 + 136, y0 + 18, "Indice A", 3.2, "middle")
    svg.text(x0 + 136, y0 + 29, DATE, 3.2, "middle")
    y = 258
    for n in notes:
        svg.text(16, y, n, 3.0)
        y += 4.6


def lisse_profile(v, a, b, size=g.FRAME):
    v.rect(a - size / 2, b - size / 2, a + size / 2, b + size / 2, sw=0.3, fill=CUT)


# ================================================================== P01 ensemble
def p01():
    s = Svg()
    k = 10
    # Vue de face, depuis le passage (x vers la droite, z vers le haut)
    v = View(s, 28, 235, k, "Vue de face (côté passage)")
    v.rect(0, 0, L, H, sw=0.5)
    v.rect(-15, 0, L + 15, g.BASE_T, sw=0.3, fill=CUT)
    v.line(-80, 0, L + 80, 0, w=0.4)
    v.rect(65, H, 235, H + 32, sw=0.3, fill="#dfe6f5")
    v.circle(HX, HZ, g.PLATE_R, sw=0.4, fill="#fff")
    v.circle(HX, HZ, g.ARM_R, sw=0.4)
    for d in g.ARMS[1:]:
        v.band(HX + d[0] * g.ARM_START, HZ + d[2] * g.ARM_START, HX + d[0] * g.ARM_LEN, HZ + d[2] * g.ARM_LEN, g.ARM_R, sw=0.35, fill="#fff")
    v.rect(-12, 905, 0, 1015, sw=0.3, fill="#c8ead6")
    v.rect(L, 905, L + 12, 1015, sw=0.3, fill="#c8ead6")
    v.rect(HX - 40, Z_PANEL - 55, HX + 40, Z_PANEL + 55, sw=0.3, dash="2 1")
    v.axis(HX, 300, HX, H + 60)
    v.axis(-40, HZ, L + 40, HZ)
    v.dim(0, H, L, H, 24, f"{L:.0f}")
    v.dim(HX, 0, HX, HZ, -25, f"{HZ:.0f}")
    v.dim(HX + SIDE_TIP, 0, HX + SIDE_TIP, LOW_TIP, -8, f"{LOW_TIP:.0f}")
    v.dim(0, HZ, HX, HZ, 6, f"{HX:.0f}")
    v.leader(150, H + 32, 8, -10, "Lecteur NFC + QR")
    v.leader(HX - 0.6 * SIDE_TIP, HZ - 0.6 * (HZ - LOW_TIP), -10, -20, "Bras Ø38 × 2")
    v.leader(HX + 40, Z_PANEL + 40, 22, -18, "Lumière 80 × 110 dans le panneau")

    # Vue de bout, depuis l'entrée (y vers la droite = vers le passage, z vers le haut)
    e = View(s, 205, 235, k, "Vue de bout (côté entrée)")
    e.rect(-W, 0, 0, H, sw=0.5)
    e.line(-W - 40, 0, PASSAGE + 120, 0, w=0.4)
    e.rect(-W - 10, H, 10, H + 2, sw=0.3, fill=CUT)
    e.rect(-W / 2 - 55, 905, -W / 2 + 55, 1015, sw=0.3, fill="#c8ead6")
    a0, a1 = g.P(g.CARTER_S0), g.P(g.CARTER_S1)
    e.band(a0[1], a0[2], a1[1], a1[2], g.CARTER_R, sw=0.35, fill="#e6e9ee")
    h0, h1, h2 = g.P(g.HUB_S0), g.P(g.HUB_S0 + g.PLATE_T), g.P(g.HUB_S1)
    e.band(h1[1], h1[2], h2[1], h2[2], g.HUB_R, sw=0.4, fill="#fff")
    e.band(h0[1], h0[2], h1[1], h1[2], g.PLATE_R, sw=0.4, fill="#fff")
    e.band(HY + g.ARM_START, HZ, PASSAGE, HZ, g.ARM_R, sw=0.35, fill="#fff")
    e.band(HY + g.ARMS[1][1] * g.ARM_START, HZ + g.ARMS[1][2] * g.ARM_START, OUT_TIP, LOW_TIP, g.ARM_R, sw=0.35, fill="#fff")
    s0, s1 = g.P(g.SHAFT_S0 - 20), g.P(g.SHAFT_S1 + 30)
    e.axis(s0[1], s0[2], s1[1], s1[2])
    e.rect(0, 0, PASSAGE, 900, sw=0.2, dash="3 2", c="#b8860b")
    e.text(PASSAGE / 2, 450, "passage", size=3, anchor="middle", c="#b8860b")
    e.dim(-W, H + 2, 0, H + 2, 8, f"{W:.0f}")
    e.dim(0, HZ, PASSAGE, HZ, 8, f"{PASSAGE:.0f}")
    e.dim(-W, 0, -W, H, 10, f"{H:.0f}")
    e.leader(-W / 2, 905, -2, 14, "Voyant")
    e.text(60, 1110, f"axe incliné à {g.TILT:.0f}°", size=3)

    # Vue de dessus (x vers la droite, y vers le haut de la feuille = vers le passage)
    t = View(s, 300, 120, 12.5, "Vue de dessus", ty=W / 12.5 + 16)
    t.rect(0, -W, L, 0, sw=0.5)
    t.rect(65, -W / 2 - 60, 235, -W / 2 + 60, sw=0.3, fill="#dfe6f5")
    t.band(HX, HY + g.ARM_START, HX, PASSAGE, g.ARM_R, sw=0.35, fill="#fff")
    for d in g.ARMS[1:]:
        t.band(HX + d[0] * g.ARM_START, HY + d[1] * g.ARM_START, HX + d[0] * g.ARM_LEN, HY + d[1] * g.ARM_LEN, g.ARM_R, sw=0.35, fill="#fff")
    t.circle(HX, HY, g.PLATE_R * 0.75, sw=0.4, fill="#fff")
    t.dim(0, -W, L, -W, -8, f"{L:.0f}")
    t.dim(L, -W, L, 0, -8, f"{W:.0f}")
    t.dim(HX - 60, 0, HX - 60, PASSAGE, 6, f"{PASSAGE:.0f}")
    t.text(L / 2, PASSAGE + 120, "↑ passage (largeur contrôlée par le bras)", size=2.8, anchor="middle")

    frame(s, "P01", "Ensemble – vues générales", "1:10 (dessus 1:12,5)", [
        f"Hauteur des bras : {HZ:.0f} mm · bras le plus bas : {LOW_TIP:.0f} mm · largeur de passage libre : {PASSAGE:.0f} mm.",
        "Habillage inox 316L 1,5 mm brossé (air salin). Ossature tube inox 30×30×2. Platine acier galvanisé 10 mm.",
        "Fixation au sol : 4 chevilles chimiques M12 dans une dalle béton ≥ 120 mm. Passage voisin : mur ou 2e caisson.",
    ])
    return s


# ================================================================== P02 habillage (développés)
def p02():
    s = Svg()
    k = 10
    v = View(s, 25, 140, k, "Panneau côté passage – 1 pièce")
    ph = H - g.BASE_T
    v.rect(0, 0, L, ph, sw=0.5, fill="#f7f8fa")
    v.rect(HX - 40, Z_PANEL - g.BASE_T - 55, HX + 40, Z_PANEL - g.BASE_T + 55, sw=0.4, fill="#fff")
    for x, z in g.PANEL_SCREWS:
        v.circle(x, z - g.BASE_T, 3.5, sw=0.3)
    v.dim(0, ph, L, ph, 12, f"{L:.0f}")
    v.dim(L, 0, L, ph, -10, f"{ph:.0f}")
    v.dim(HX - 40, Z_PANEL - g.BASE_T + 55, HX + 40, Z_PANEL - g.BASE_T + 55, 5, "80")
    v.dim(HX + 40, Z_PANEL - g.BASE_T - 55, HX + 40, Z_PANEL - g.BASE_T + 55, -8, "110")
    v.dim(0, Z_PANEL - g.BASE_T, HX - 40, Z_PANEL - g.BASE_T, 0.0001 + 6, f"{HX - 40:.0f}")
    v.dim(0, 0, 0, Z_PANEL - g.BASE_T, 10, f"{Z_PANEL - g.BASE_T:.0f}")
    v.text(L / 2, 160, "Panneau arrière : identique, sans lumière", size=3, anchor="middle")
    v.text(60, 120, f"{len(g.PANEL_SCREWS)} trous Ø6,5 : vis M6 dans rivets-écrous (poteaux et lisses)", size=2.6)

    j = View(s, 175, 140, k, "Joues d'extrémité – 2 pièces")
    j.rect(0, 0, W, ph, sw=0.5, fill="#f7f8fa")
    j.rect(W / 2 - 55, 905 - g.BASE_T, W / 2 + 55, 1015 - g.BASE_T, sw=0.4, fill="#fff")
    j.dim(0, ph, W, ph, 12, f"{W:.0f}")
    j.dim(W, 0, W, ph, -10, f"{ph:.0f}")
    j.dim(W / 2 - 55, 905 - g.BASE_T, W / 2 + 55, 905 - g.BASE_T, 0.0001 - 6, "110")
    j.dim(0, 0, 0, 905 - g.BASE_T, 10, f"{905 - g.BASE_T:.0f}")
    j.text(W / 2, 860, "découpe voyant", size=2.6, anchor="middle")
    for y, z in g.SIDE_SCREWS:
        j.circle(y + W, z - g.BASE_T, 3.5, sw=0.3)

    c = View(s, 236, 140, 8, "Capot – développé (bords pliés 20 mm)")
    cw, cl = W + 20, L + 20
    c.rect(-20, -20, cl + 20, cw + 20, sw=0.5, fill="#f7f8fa")
    c.rect(0, 0, cl, cw, sw=0.25, dash="3 1.5")
    c.rect(75, cw / 2 - 30, 235, cw / 2 + 30, sw=0.4, fill="#fff")
    for x in (300, cl - 300):
        c.circle(x, -10, 6, sw=0.3)
    c.dim(-20, cw + 20, cl + 20, cw + 20, 8, f"{cl + 40:.0f} (développé)")
    c.dim(cl + 20, -20, cl + 20, cw + 20, -8, f"{cw + 40:.0f}")
    c.dim(0, cw / 2 + 30, 75, cw / 2 + 30, 4, "75")
    c.text(155, cw / 2 - 52, "découpe lecteur 160 × 60", size=2.4, anchor="middle")
    c.text(cl / 2 + 100, cw / 2 + 6, "pointillés : pliage à 90°", size=2.6, anchor="middle")
    c.text(cl / 2 + 100, cw / 2 - 22, "2 serrures à clé Ø12 (bord avant)", size=2.6, anchor="middle")

    frame(s, "P02", "Habillage inox – développés et découpes", "1:10 (capot 1:8)", [
        "Matière : inox 316L, 1,5 mm, finition brossée grain 240. Ébavurer toutes les découpes ; aucune arête vive côté passage.",
        "Découpe laser ou plasma fin, pliage à la presse-plieuse. Protéger le film plastique jusqu'au montage.",
        "Lumière du panneau : oblong 80 × 110 centré sur la traversée de l'axe (axe incliné à 45°).",
    ])
    return s


# ================================================================== P03 socle, ossature, débit
def p03():
    s = Svg()
    k = 10
    v = View(s, 25, 95, k, "Platine de base – acier galvanisé 10 mm (vue de dessus)", ty=22)
    v.rect(0, 0, L, W, sw=0.5, fill="#f2f2f2")
    holes = [(60, 60), (L - 60, 60), (60, W - 60), (L - 60, W - 60)]
    for x, y in holes:
        v.circle(x, y, 7, sw=0.35)
    for x, y in ((g.FX0, -g.FY0), (g.FX1, -g.FY0), (g.FX0, -g.FY1), (g.FX1, -g.FY1)):
        lisse_profile(v, x, y)
    v.rect(830, W / 2 - 100, 1130, W / 2 + 100, sw=0.25, dash="2 1")
    v.rect(120, W / 2 - 95, 400, W / 2 + 95, sw=0.25, dash="2 1")
    v.text(980, W / 2, "coffret contrôleur", size=2.4, anchor="middle")
    v.text(260, W / 2, "alimentation + batteries", size=2.4, anchor="middle")
    v.circle(600, W / 2, 20, sw=0.3)
    v.text(600, W / 2 - 40, "passe-câbles Ø40", size=2.4, anchor="middle")
    v.dim(0, W, L, W, 10, f"{L:.0f}")
    v.dim(L, 0, L, W, -10, f"{W:.0f}")
    v.dim(0, 0, 60, 0, 0.0001 - 6, "60")
    v.dim(0, 60, 0, W - 60, 6, f"{W - 120:.0f}")
    v.dim(60, 0, L - 60, 0, 0.0001 - 12, f"{L - 120:.0f}")

    o = View(s, 25, 238, k, "Ossature – vue de face (tube 30×30×2)")
    o.rect(T, g.BASE_T, T + g.FRAME, H - 2, sw=0.35, fill=CUT)
    o.rect(L - T - g.FRAME, g.BASE_T, L - T, H - 2, sw=0.35, fill=CUT)
    for z in (g.BASE_T + g.FRAME / 2, 620, H - g.FRAME / 2 - 2):
        o.rect(T + g.FRAME, z - g.FRAME / 2, L - T - g.FRAME, z + g.FRAME / 2, sw=0.35, fill=CUT)
    o.rect(0, 0, L, g.BASE_T, sw=0.3, fill="#ddd")
    o.dim(T, H - 2, L - T, H - 2, 8, f"{L - 2 * T:.0f} hors tout")
    o.dim(L, g.BASE_T, L, H - 2, -8, f"{H - 2 - g.BASE_T:.0f}")
    o.dim(0, g.BASE_T, 0, 620, 8, f"{620 - g.BASE_T:.0f}")

    rows = [
        ("Poteau", "30×30×2 inox", f"{H - 2 - g.BASE_T:.0f}", "4", "coupe droite, soudé sur la platine"),
        ("Lisse avant / arrière", "30×30×2 inox", f"{g.LISSE:.0f}", "6", "3 niveaux : bas, 620, haut"),
        ("Traverse d'extrémité", "30×30×2 inox", f"{g.TRAVERSE:.0f}", "4", "bas et haut, côtés entrée et sortie"),
        ("Bras", "Ø38×2 inox 316", f"{ARM_TUBE:.0f}", "3", "sur l'axe ; coupe biaise 45° côté moyeu"),
        ("Plateau du moyeu", "rond inox 304 Ø160", f"{g.PLATE_T:.0f}", "1", "voir P04"),
        ("Platine", "tôle 10 acier", f"{L:.0f}×{W:.0f}", "1", "galvanisée à chaud après perçage"),
        ("Bride du carter", "tôle 8 acier", f"{g.FLANGE_SIZE:.0f}×{g.FLANGE_SIZE:.0f}", "1", "voir P07"),
        ("Disque indexeur", "tôle 10 S355", f"Ø{2 * g.DISC_R:.0f}", "1", "voir P06"),
    ]
    tx, ty = 175, 180
    s.text(tx, ty - 6, "Liste de débit", 3.6, weight="bold")
    cols = [0, 40, 75, 100, 112]
    heads = ["Pièce", "Profil / matière", "Longueur", "Qté", "Remarque"]
    for c, h in zip(cols, heads):
        s.text(tx + c, ty, h, 2.8, weight="bold")
    for i, r in enumerate(rows):
        y = ty + 5.5 * (i + 1)
        s.line(tx, y - 4, tx + 175, y - 4, 0.15, "#999")
        for c, val in zip(cols, r):
            s.text(tx + c, y, val, 2.7)
    tube = 4 * (H - 2 - g.BASE_T) + 6 * g.LISSE + 4 * g.TRAVERSE
    s.text(tx, ty + 5.5 * (len(rows) + 1) + 2, f"Total tube 30×30×2 : {tube / 1000:.1f} m (+10 % de chute)", 2.8, weight="bold")

    frame(s, "P03", "Socle, ossature et liste de débit", "1:10", [
        "Platine : 4 trous Ø14 à 60 mm des bords (chevilles M12). Ossature soudée TIG sur gabarit plat ; vérifier l'équerrage par les diagonales (écart ≤ 2 mm).",
        "Poteaux soudés sur la platine après galvanisation : retoucher la soudure avec une peinture riche en zinc.",
        "Ossature en retrait de 1,5 mm (épaisseur de tôle) : l'habillage se pose à fleur de la platine.",
        "Le coffret électrique repose sur entretoises, à 80 mm du sol minimum (pluie, lavage).",
    ])
    return s


# ================================================================== P04 bras et moyeu
def p04():
    s = Svg()
    k = 2
    PR, BR = g.PLATE_R, g.HUB_R
    v = View(s, 70, 105, k, "Moyeu – vue de face (côté passage)", ty=PR / k + 16)
    v.circle(0, 0, PR, sw=0.5, fill="#f7f8fa")
    v.circle(0, 0, g.SHAFT_R, sw=0.4, fill="#fff")
    for ang in (90, 210, 330):
        a = math.radians(ang)
        v.ellipse(FOOT * math.cos(a), FOOT * math.sin(a), g.ARM_R / math.cos(math.radians(45)), g.ARM_R, rot=ang, sw=0.35, dash="1.5 1")
        v.axis(0, 0, (PR + 12) * math.cos(a), (PR + 12) * math.sin(a))
    v.circle(0, 0, FOOT, sw=0.2, dash="4 1 1 1")
    v.dim(-PR, -PR, PR, -PR, -8, f"Ø{2 * PR:.0f}")
    v.leader(g.SHAFT_R * 0.7, g.SHAFT_R * 0.7, 30, -26, "alésage Ø25 H7 + rainure 8 mm")
    v.leader(FOOT * math.cos(math.radians(330)) + 10, FOOT * math.sin(math.radians(330)) - 8, 22, 14, f"pied de bras centré à R{FOOT:.0f}, soudé TIG")

    c = View(s, 225, 105, k, "Moyeu – coupe par l'axe de deux bras", ty=PR / k + 16)
    hl = g.HUB_S1 - g.HUB_S0
    c.rect(0, -PR, g.PLATE_T, PR, sw=0.5, fill=CUT)
    c.rect(g.PLATE_T, -BR, hl, BR, sw=0.5, fill=CUT)
    c.rect(0, -g.SHAFT_R, hl, g.SHAFT_R, sw=0.4, fill="#fff")
    c.axis(-60, 0, hl + 15, 0)
    h = g.ARM_R * math.sqrt(2)  # demi-largeur du tube mesurée le long de la face
    for sg in (1, -1):
        # le bras touche la face avant (x = 0) au rayon FOOT et part à 45° vers le passage
        c.poly([(0, sg * (FOOT - h)), (-55, sg * (FOOT - h + 55)), (-55, sg * (FOOT + h + 55)), (0, sg * (FOOT + h))], sw=0.35, fill="#fff")
        c.axis(FOOT, 0, -70, sg * (FOOT + 70))
    c.dim(0, PR, hl, PR, 8, f"{hl:.0f}")
    c.dim(0, -PR, g.PLATE_T, -PR, -8, f"{g.PLATE_T:.0f}")
    c.dim(hl, -BR, hl, BR, -8, f"Ø{2 * BR:.0f}")
    c.text(hl + 6, -BR - 14, "vis de pression M8 + clavette 8 × 7", size=2.6)
    c.text(-30, 4, "45°", size=3, anchor="middle")

    b = View(s, 40, 215, 4, "Bras – tube inox 316 Ø38 × 2 (3 pièces)", ty=20)
    d = 2 * g.ARM_R
    end = ARM_TUBE + d / 2
    b.poly([(0, -g.ARM_R), (end, -g.ARM_R), (end, g.ARM_R), (d, g.ARM_R)], sw=0.5, fill="#f7f8fa")
    b.rect(end, -g.ARM_R - 1, end + 12, g.ARM_R + 1, sw=0.4, fill="#444")
    b.axis(-15, 0, end + 25, 0)
    b.dim(d / 2, g.ARM_R, end, g.ARM_R, 8, f"{ARM_TUBE:.0f} sur l'axe")
    b.dim(0, -g.ARM_R, end, -g.ARM_R, -6, f"{end:.0f} côté long")
    b.dim(end + 12, -g.ARM_R - 1, end + 12, g.ARM_R + 1, -10, "Ø40")
    b.text(ARM_TUBE - 60, g.ARM_R + 70, "embout caoutchouc ou PA6", size=2.6)
    b.text(0, g.ARM_R + 70, "coupe biaise à 45° : pied soudé sur le plateau", size=2.6)

    frame(s, "P04", "Moyeu et bras", "1:2 (bras 1:4)", [
        f"Moyeu en 2 pièces inox 304 soudées puis réusinées : plateau Ø{2 * PR:.0f} × {g.PLATE_T:.0f} et fût Ø{2 * BR:.0f}. Alésage Ø25 H7 fait après soudure.",
        f"Les 3 bras sont soudés TIG sur la face du plateau, centrés à R{FOOT:.0f}, à 120°, sur gabarit : extrémités sur un même cercle (± 2 mm).",
        "Un bras toujours horizontal en position de repos : contrôler à 850 mm du sol après montage.",
    ])
    return s


# ================================================================== P05 axe
def p05():
    s = Svg()
    k = 1
    v = View(s, 70, 120, k, "Axe principal – acier 42CrMo4 traité, Ø25 h7")
    total = g.SHAFT_S1 - g.SHAFT_S0
    r = g.SHAFT_R
    v.rect(0, -r, total, r, sw=0.5, fill="#f7f8fa")
    v.rect(g.SHOULDER_S0 - SH0, -g.SHOULDER_R, g.BEARINGS_S[0] - 7.5 - SH0, g.SHOULDER_R, sw=0.5, fill="#f7f8fa")
    v.dim(g.SHOULDER_S0 - SH0, g.SHOULDER_R, g.BEARINGS_S[0] - 7.5 - SH0, g.SHOULDER_R, 4, f"Ø30 × {g.BEARINGS_S[0] - 7.5 - g.SHOULDER_S0:.1f}")
    v.axis(-12, 0, total + 12, 0)
    marks = [("moyeu", g.HUB_S0, g.HUB_S1), ("roulement 1", g.BEARINGS_S[0] - 7.5, g.BEARINGS_S[0] + 7.5),
             ("roulement 2", g.BEARINGS_S[1] - 7.5, g.BEARINGS_S[1] + 7.5), ("disque", g.DISC_S - g.DISC_T / 2, g.DISC_S + g.DISC_T / 2)]
    for i, (name, a, b) in enumerate(marks):
        a, b = a - SH0, b - SH0
        v.rect(a, -r - 2, b, r + 2, sw=0.25, dash="1.5 1", c=DIM)
        v.text((a + b) / 2, r + 6 + (i % 2) * 6, name, size=2.8, anchor="middle", c=DIM)
    v.rect(g.HUB_S0 - SH0 + 10, r - 4, g.HUB_S1 - SH0 - 10, r, sw=0.3, fill="#fff")
    k0 = g.DISC_S + g.DISC_T / 2 - 1 - g.KEY_D_L
    v.rect(k0 - SH0, r - 4, k0 + g.KEY_D_L - SH0, r, sw=0.3, fill="#fff")
    ext_thread(v, g.DISC_S + g.DISC_T / 2 + 1 - SH0, total, 25, 1.5)
    v.text(total - 12, -r - 3.5, "M25×1,5", size=2.6, anchor="middle", c=DIM)
    for i, (name, a, b) in enumerate(marks):
        v.dim(0, -r, (a + b) / 2 - SH0, -r, -8 - 6 * i, f"{(a + b) / 2 - SH0:.1f}")
    v.dim(0, -r, total, -r, -8 - 6 * len(marks), f"{total:.0f}")
    v.dim(total, -r, total, r, -8, "Ø25 h7")

    s.text(70, 175, "Cotes depuis l'extrémité côté moyeu :", 3.2, weight="bold")
    lines = [
        f"• Moyeu : portée de {g.HUB_S1 - g.HUB_S0:.0f} mm, rainure de clavette 8 × 4 longueur 40, trou taraudé M8 en bout (rondelle d'arrêt).",
        f"• Épaulement Ø30 de {g.SHOULDER_S0 - SH0:.0f} à {g.BEARINGS_S[0] - 7.5 - SH0:.1f} : appui du moyeu et de la bague intérieure 1 (congé R0,6 maxi).",
        f"• Roulements 6205-2RS (Ø25 k6) : centres à {g.BEARINGS_S[0] - SH0:.0f} et {g.BEARINGS_S[1] - SH0:.0f} ; entre eux, entretoise Ø32 × Ø25 × 105.",
        f"• Disque indexeur : centre à {g.DISC_S - SH0:.0f}, rainure de clavette 8 × 4 longueur 28, écrou à encoches M25 × 1,5 en bout.",
        "• Chanfreins 1 × 45° aux deux extrémités. Rectifier ou polir les portées de roulements (Ra ≤ 0,8).",
    ]
    for i, t in enumerate(lines):
        s.text(70, 183 + i * 6, t, 3.0)

    frame(s, "P05", "Axe principal", "1:1", [
        "Matière : acier 42CrMo4 (42CD4) traité ≥ 750 MPa, rond Ø32. L'inox 304 est trop faible au forçage (voir Vérification). Graisser à la pose.",
        "Portées des roulements Ø25 k6 (+0,015 / +0,002) : montage à la presse ; reste de l'axe Ø25 h7 (25,000 / 24,979). Vérifier au micromètre.",
    ])
    return s


# ================================================================== P06 disque indexeur
def p06():
    s = Svg()
    k = 1
    v = View(s, 120, 125, k, "Disque indexeur – S355, 10 mm")
    R = g.DISC_R
    v.poly(g.disc_outline(720), sw=0.5, fill="#f2f3f5")
    v.circle(0, 0, g.SHAFT_R, sw=0.4, fill="#fff")
    v.rect(-4, g.SHAFT_R - 1, 4, g.SHAFT_R + 3.3, sw=0.3, fill="#fff")
    for c in g.DISC_LOCKS:
        a = math.radians(c)
        v.axis(0, 0, (R + 18) * math.cos(a), (R + 18) * math.sin(a))
    # position de repos : dent du cliquet (à 270°) et galet (à 180°), en pointillés
    v.rect(-6, -R - 1, 6, -R + g.LOCK_D - 1, sw=0.3, dash="1.5 1")
    v.circle(g.GALET_C[0], g.GALET_C[1], 11, sw=0.3, dash="1.5 1")
    v.dim(-R, -R - 20, R, -R - 20, -6, f"Ø{2 * R:.0f}")
    l0, v0 = math.radians(g.DISC_LOCKS[0]), math.radians(g.DISC_VS[0])
    v.leader((R - 7) * math.cos(l0), (R - 7) * math.sin(l0), 26, -14, f"3 crans de verrouillage {g.LOCK_W:.0f} × {g.LOCK_D:.0f} (à {', '.join(f'{c:.0f}°' for c in g.DISC_LOCKS)})")
    v.leader((R - 4) * math.cos(v0), (R - 4) * math.sin(v0), 18, -24, f"3 crans en V à 90°, prof. {g.V_D:.0f} (à {', '.join(f'{c:.0f}°' for c in g.DISC_VS)})")
    v.leader(g.SHAFT_R * 0.7, -g.SHAFT_R * 0.7, 30, 30, "alésage Ø25 H7 + rainure de clavette 8 mm")
    v.leader(0, -R + 8, -30, 24, "dent du cliquet au repos (pointillés)")
    v.leader(g.GALET_C[0] - 8, g.GALET_C[1] + 8, 10, -50, "galet Ø22 au repos (pointillés)")

    s.text(232, 150, "Principe de fonctionnement", 3.6, weight="bold")
    txt = [
        "1. Au repos, le galet du levier de crantage repose dans un cran en V",
        "   (à 180°) : un bras est horizontal, le tripode est centré.",
        "2. La dent du cliquet (acier trempé) entre dans un cran (à 270°)",
        "   rectangulaire : la rotation est bloquée dans les deux sens.",
        "3. Carte ou QR valide : l'électroaimant soulève le cliquet pour",
        "   un seul passage. L'effort de poussée passe dans le cliquet et",
        "   son axe, jamais dans l'électroaimant.",
        "4. Le capteur inductif voit passer le cran : passage compté, le",
        "   cliquet retombe sur le cran suivant (120° plus loin).",
        "Effort de forçage à reprendre : 500 N au bout d'un bras",
        "= 250 N·m sur l'axe = environ 3,6 kN sur le cliquet à r = 70 mm.",
        "→ cliquet sur colonne-pivot Ø14 : σ ≈ 106 MPa, vérifié.",
    ]
    for i, t in enumerate(txt):
        s.text(232, 158 + i * 5.6, t, 3.0, c=AXIS if i >= 9 else INK)

    frame(s, "P06", "Disque indexeur (verrouillage et centrage)", "1:1", [
        "Découpe laser puis reprise de l'alésage au tour (Ø25 H7) et rainure de clavette 8 mm à la mortaiseuse.",
        "Traitement : trempe superficielle des crans (ou disque en 42CrMo4 traité). Graisser les crans au montage.",
    ])
    return s


# ================================================================== P07 carter et bride
def p07():
    s = Svg()
    k = 1.5
    v = View(s, 40, 130, k, "Carter – coupe longitudinale (acier, soudé sur la bride)")
    Lc = g.CARTER_S1 - g.CARTER_S0
    R = g.CARTER_R
    v.rect(0, -R, Lc, R, sw=0.5, fill=CUT)
    v.rect(0, -26, Lc, 26, sw=0.35, fill="#fff")
    for sb in g.BEARINGS_S:
        a = sb - g.CARTER_S0
        v.rect(a - 7.5, -26, a + 7.5, 26, sw=0.4, fill="#f3e2a8")
        v.rect(a - 7.5, -g.SHAFT_R, a + 7.5, g.SHAFT_R, sw=0.2, fill="#fff")
    v.rect(g.BEARINGS_S[0] - g.CARTER_S0 + 7.5, -22, g.BEARINGS_S[1] - g.CARTER_S0 - 7.5, 22, sw=0.3, fill=CUT)
    fs = g.FLANGE_S - g.CARTER_S0
    v.rect(fs - 4, -g.FLANGE_SIZE / 2, fs + 4, g.FLANGE_SIZE / 2, sw=0.5, fill="#cfd5dc")
    v.axis(-12, 0, Lc + 20, 0)
    v.dim(0, R, Lc, R, 18, f"{Lc:.0f}")
    v.dim(Lc + 5, -R, Lc + 5, R, -16, f"Ø{2 * R:.0f}")
    v.dim(g.BEARINGS_S[0] - g.CARTER_S0 - 7.5, -26, g.BEARINGS_S[0] - g.CARTER_S0 - 7.5, 26, 10, "Ø52 H7")
    v.dim(0, -R, g.BEARINGS_S[0] - g.CARTER_S0, -R, -10, f"{g.BEARINGS_S[0] - g.CARTER_S0:.0f}")
    v.dim(0, -R, g.BEARINGS_S[1] - g.CARTER_S0, -R, -18, f"{g.BEARINGS_S[1] - g.CARTER_S0:.0f}")
    v.dim(0, -R, fs, -R, -26, f"{fs:.0f}")
    v.text(Lc / 2, 0, "épaulement intérieur Ø44 (arrêt des bagues ext.)", size=2.4, anchor="middle")

    b = View(s, 300, 130, k, "Bride 130 × 130 × 8")
    F = g.FLANGE_SIZE / 2
    b.rect(-F, -F, F, F, sw=0.5, fill="#eef0f3")
    b.circle(0, 0, R + 0.5, sw=0.4, fill="#fff")
    for x in (-50, 50):
        for y in (-50, 50):
            b.circle(x, y, 5.5, sw=0.35)
    b.dim(-F, F, F, F, 8, f"{2 * F:.0f}")
    b.dim(-50, -F, 50, -F, -8, "100")
    b.dim(-R, 0, R, 0, 0.0001 + 10, f"Ø{2 * R + 1:.0f}")
    b.text(0, -F - 22, "4 × Ø11 (M10)", size=2.8, anchor="middle")

    s.text(205, 200, "Fixation de la bride", 3.4, weight="bold")
    for i, t in enumerate([
        "En haut : 2 vis M10 (trous du haut) sur 2 pattes soudées",
        "sous la lisse haute avant. En bas : 2 flasques soudées au",
        "carter, vissées dans la lisse milieu (détail : feuille P09).",
        f"L'axe traverse le panneau à {Z_PANEL:.0f} mm du sol, incliné à {g.TILT:.0f}°.",
    ]):
        s.text(205, 207 + i * 5.4, t, 3.0)

    frame(s, "P07", "Carter des roulements et bride", "1:1,5", [
        "Tube acier Ø70 × 9 (ou rond plein alésé). Les deux logements Ø52 H7 sont alésés dans le même serrage (coaxialité).",
        "Souder la bride avant l'alésage final, sinon la soudure déforme les logements. Peinture époxy après usinage.",
    ])
    return s


# ================================================================== P08 schéma électrique
def p08():
    s = Svg()

    def block(x, y, w, h, title, lines=(), fill="#fff"):
        s.rect(x, y, w, h, 0.5, fill)
        s.text(x + w / 2, y + 6, title, 3.3, "middle", weight="bold")
        for i, t in enumerate(lines):
            s.text(x + w / 2, y + 11.5 + i * 4.4, t, 2.7, "middle")

    def wire(pts, label=None, c=INK, w=0.45, at=0):
        s.poly(pts, w, "none", c, close=False)
        if label:
            (x1, y1), (x2, y2) = pts[at], pts[at + 1]
            s.text((x1 + x2) / 2, (y1 + y2) / 2 - 1.2, label, 2.6, "middle", c)

    block(20, 30, 50, 26, "Secteur 230 V", ["disjoncteur 2 A", "+ différentiel 30 mA"], "#fdecea")
    block(95, 30, 55, 26, "Alimentation 24 V", ["rail DIN, 5 A"], "#eef3fd")
    block(175, 30, 60, 26, "Module de secours", ["2 × batteries 12 V 7 Ah", "(en série = 24 V)"], "#eef3fd")
    block(150, 85, 120, 60, "Contrôleur ESP32 industriel", ["24 V, Ethernet RJ45 (PoE possible)", "entrées optocouplées 24 V", "sorties transistor 24 V", "I2C / UART 3,3 V", "programme : firmware/door_nfc"], "#e9f7ef")
    block(300, 30, 90, 26, "Réseau de l'école", ["switch / routeur", "→ serveur EduPilote"], "#f4f4f4")
    block(20, 95, 95, 20, "Lecteur NFC PN532", ["I2C : SDA GPIO33 · SCL GPIO32 · 3,3 V"])
    block(20, 125, 95, 20, "Lecteur QR 2D", ["UART : TX → GPIO 5 · 5 V"])
    block(300, 85, 90, 22, "Électroaimant du cliquet", ["24 V, via MOSFET + diode 1N4007"], "#fdecea")
    block(300, 115, 90, 20, "Capteur inductif M12", ["PNP 24 V → entrée IN1"])
    block(300, 143, 90, 20, "Voyants entrée / sortie", ["flèche verte · croix rouge (24 V)"])
    block(150, 175, 120, 20, "Buzzer · bouton maintenance · clé", ["arrêt d'urgence : déverrouille le cliquet"])

    wire([(70, 43), (95, 43)], "L / N / PE")
    wire([(150, 43), (175, 43)], "24 V", "#c0392b")
    wire([(205, 56), (205, 85)], "24 V secouru", "#c0392b")
    wire([(235, 43), (300, 43)], None)
    wire([(345, 56), (345, 70), (250, 70), (250, 85)], "câble RJ45 cat. 6", "#1f4fbf", at=1)
    wire([(115, 105), (150, 105)], "I2C", "#1f4fbf")
    wire([(115, 135), (150, 135)], "UART", "#1f4fbf")
    wire([(270, 96), (300, 96)], "OUT1")
    wire([(270, 125), (300, 125)], "IN1")
    wire([(270, 140), (285, 140), (285, 153), (300, 153)], "OUT2/3", at=1)
    wire([(210, 145), (210, 175)], None)
    s.rect(229, 40, 18, 6, 0.1, "#fff", "#fff")

    notes = [
        "Toute la partie basse tension (24 V) est séparée du 230 V ; le 230 V reste dans le coffret, derrière un capot.",
        "Masse commune 0 V ; la terre (PE) est reliée à l'ossature inox et à la platine.",
        "Sur coupure de courant : les batteries tiennent environ 4 h. Batterie vide = cliquet relâché selon le mode choisi (voir guide).",
        "Le PN532 et le lecteur QR sont derrière le plastron en polycarbonate (pas de métal devant l'antenne NFC).",
    ]
    for i, t in enumerate(notes):
        s.text(20, 212 + i * 6, t, 3.0)
    frame(s, "P08", "Schéma électrique de principe", "sans échelle", [])
    return s


# ================================================================== P09 fixation du carter sur l'ossature
def p09():
    s = Svg()
    k = 3
    v = View(s, 128, 400, k, "Coupe verticale par l'axe (vue côté entrée)", ty=-373)
    K = math.cos(math.radians(g.TILT))
    E2 = (g.E2[1], g.E2[2])

    def pt(sv, e2=0.0):
        q = g.P(sv)
        return (q[1] + e2 * E2[0], q[2] + e2 * E2[1])

    def quad(s0, s1, e0, e1, **kw):
        v.poly([pt(s0, e0), pt(s1, e0), pt(s1, e1), pt(s0, e1)], **kw)

    # ossature et habillage
    v.rect(-T, 560, 0, H, sw=0.3, fill="#dfe3e8")
    v.rect(-W, 560, -W + T, H, sw=0.3, fill="#dfe3e8")
    v.rect(-W - 10, H, 10, H + 2, sw=0.3, fill="#dfe3e8")
    for y0 in (-T - g.FRAME, -W + T):
        for z0 in (H - 2 - g.FRAME, 620 - g.FRAME / 2):
            v.rect(y0, z0, y0 + g.FRAME, z0 + g.FRAME, sw=0.4, fill="#b9c0c8")
            v.rect(y0 + 2, z0 + 2, y0 + g.FRAME - 2, z0 + g.FRAME - 2, sw=0.2, fill="#fff")
    # mécanisme
    quad(g.HUB_S0, g.HUB_S0 + g.PLATE_T, -g.PLATE_R, g.PLATE_R, sw=0.35, fill="#eef0f3")
    quad(g.HUB_S0 + g.PLATE_T, g.HUB_S1, -g.HUB_R, g.HUB_R, sw=0.35, fill="#eef0f3")
    quad(g.CARTER_S0, g.CARTER_S1, -g.CARTER_R, g.CARTER_R, sw=0.45, fill="#d5dae0")
    quad(g.FLANGE_S - 4, g.FLANGE_S + 4, -g.FLANGE_SIZE / 2, g.FLANGE_SIZE / 2, sw=0.45, fill="#9aa3ad")
    quad(g.DISC_S - g.DISC_T / 2, g.DISC_S + g.DISC_T / 2, -g.DISC_R, g.DISC_R, sw=0.35, fill="#555")
    quad(g.MECH_PLATE_S - 4, g.MECH_PLATE_S + 4, -135, -50, sw=0.3, fill="#cfd5dc")
    v.poly(g.FLASQUE, sw=0.5, fill="#f3c969")
    quad(g.PATTE_S - 3, g.PATTE_S + 3, g.PATTE_Y - 20, g.PATTE_Y + 20, sw=0.5, fill="#e07a2e")
    a0, a1 = pt(g.SHAFT_S0 - 30), pt(g.SHAFT_S1 + 30)
    v.axis(a0[0], a0[1], a1[0], a1[1])
    # repères
    lh = (-T - g.FRAME / 2, H - 2 - g.FRAME / 2)
    v.leader(-T - 5, H - 8, 10, -10, "Lisse haute avant 30×30")
    v.leader(-T - 5, 625, 12, 8, "Lisse milieu avant 30×30")
    pp = pt(g.PATTE_S, g.PATTE_Y + 10)
    v.leader(pp[0], pp[1], 40, 12, "① 2 pattes soudées sous la lisse haute ; bride boulonnée 2 × M10")
    fb = g.FLASQUE[1]
    v.leader(-55, 760, 34, 6, "② 2 flasques 8 mm soudées sur le carter, boulonnées 2 × M8 sur la lisse milieu")
    cb = pt(110, -g.CARTER_R)
    v.leader(cb[0], cb[1], -16, 22, "Carter Ø70")
    bb = pt(g.FLANGE_S, -g.FLANGE_SIZE / 2 + 8)
    v.leader(bb[0], bb[1], -18, 16, "Bride 130×130×8")
    dd = pt(g.DISC_S + 5, g.DISC_R - 10)
    v.leader(dd[0], dd[1], -26, -12, "Disque indexeur")
    v.text(-T / 2 + 30, 575, "panneau", size=2.4)
    # cotes de la flasque
    (ya, za), (yb, zb), (yc, zc), (yd, zd) = g.FLASQUE
    v.dim(yc, zd, yd, zd, -6, f"{yd - yc:.1f}")
    v.dim(ya, zd, ya, za, -18, f"{za - zd:.1f}")

    # Développé de la flasque, coté depuis le coin bas-avant
    f = View(s, 330, 205, k, "Flasque – développé (× 2, tôle 8 mm)", ty=-152)
    poly = [(y - ya, z - zd) for y, z in g.FLASQUE]
    f.poly(poly, sw=0.5, fill="#f3c969")
    tab = [(0, 0), (g.TAB_L, 0), (g.TAB_L, 55), (0, 55)]
    f.poly(tab, sw=0.35, fill="#f8e2a8")
    f.line(0, 0, 0, 55, dash="2 1", w=0.3)
    for xx in g.TAB_HOLES:
        f.circle(xx, 35, 4.5, sw=0.3)
    (xa, za_), (xb, zb_), (xc, zc_), (xd, zd_) = poly
    f.dim(xc, 0, xd, 0, -6, f"{xd - xc:.1f}")
    f.dim(xa + g.TAB_L, 0, xa + g.TAB_L, za_, -8, f"{za_:.1f}")
    f.text(90, za_ - 10, "Sommets (mm), depuis le coin bas-avant :", size=2.6, weight="bold")
    for i, (nm, (x, z)) in enumerate(zip("ABCD", poly)):
        f.text(90, za_ - 25 - i * 12, f"{nm}  ({x:.1f} ; {z:.1f})", size=2.6)
        f.text(x + (2 if x >= 0 else -6), z + (3 if z > 0 else -9), nm, size=2.8, weight="bold")
    f.text(90, 70, f"languette {g.TAB_L:.0f} × 55 pliée à 90° (Ri {g.BEND_PLATE[0]:.0f}, K {g.BEND_PLATE[1]})", size=2.4)
    f.text(90, 60, f"2 trous Ø9 à {g.TAB_HOLES[0]:.0f} et {g.TAB_HOLES[1]:.0f} mm de la face, à 35 mm du bas", size=2.4)
    f.text(90, 50, "longueurs à plat exactes : voir le DXF de la flasque", size=2.4)

    x0, y0 = 180, 206
    s.text(x0, y0, "Comment le carter tient à l'ossature (3 appuis)", 3.4, weight="bold")
    lines = [
        "En haut : la bride (soudée au bout du carter) est boulonnée par ses 2 trous",
        "du haut sur 2 pattes 30×40×6 soudées sous la lisse haute avant.",
        "En bas : 2 flasques 8 mm, de part et d'autre du carter, sont soudées sur",
        "lui ; leur languette pliée est vissée (2 × M8) dans des rivets-écrous.",
        "L'effort de poussée sur les bras passe ainsi dans deux lisses différentes.",
        "Démontage : 2 vis M10 + 4 vis M8 et le carter sort avec l'axe.",
    ]
    for i, t in enumerate(lines):
        s.text(x0, y0 + 6.5 + i * 5.2, t, 2.9)
    frame(s, "P09", "Fixation du carter sur l'ossature", "1:3", [
        "Pointer pattes et flasques en place, carter monté et axe réglé à 45° (rapporteur), puis souder. Contrôler qu'un bras est horizontal à 850 mm.",
        "Flasques et pattes : acier S235 8 mm et 6 mm, peints époxy ; vis inox A4 avec rondelles isolantes contre l'inox.",
    ])
    return s


# ================================================================== P10 taraudages et filetages (dessin normalisé simplifié)
THIN = 0.22


def ext_thread(v, a0, a1, d, pitch, end_line=True):
    """Filetage extérieur sur [a0, a1] (axe b = 0) : trait fin au diamètre à fond de filet."""
    r1 = (d - 1.2269 * pitch) / 2
    v.line(a0, r1, a1, r1, w=THIN)
    v.line(a0, -r1, a1, -r1, w=THIN)
    if end_line:
        v.line(a0, -d / 2, a0, d / 2, w=0.5)


def int_thread(v, a0, sens, d, pitch, depth_thr, depth_drill):
    """Trou taraudé débouchant en a0, vers sens (+1/-1) : perçage au foret, trait fin au diamètre nominal."""
    rd = (d - 1.0825 * pitch) / 2
    a_d, a_t = a0 + sens * depth_drill, a0 + sens * depth_thr
    tip = a_d + sens * rd * 0.6
    v.poly([(a0, rd), (a_d, rd), (tip, 0), (a_d, -rd), (a0, -rd)], sw=0.45, fill="#fff", close=False)
    v.line(a0, d / 2, a_t, d / 2, w=THIN)
    v.line(a0, -d / 2, a_t, -d / 2, w=THIN)
    v.line(a_t, -d / 2, a_t, d / 2, w=0.5)


def p10():
    s = Svg()
    k = 0.5                                  # échelle 2:1
    # D1 : bout d'axe côté moyeu, taraudage M8
    v = View(s, 30, 70, k, "D1 · Bout d'axe côté moyeu : taraudage M8 × 20", ty=42)
    v.rect(0, -12.5, 50, 12.5, sw=0.5, fill="#f2f3f5")
    v.poly([(0, -11.5), (1, -12.5)], close=False, sw=0.4)
    int_thread(v, 0, 1, 8, 1.25, 20, 26)
    v.axis(-6, 0, 56, 0)
    v.dim(0, 12.5, 20, 12.5, 6, "20")
    v.dim(0, -12.5, 26, -12.5, -6, "26 (foret Ø6,8)")
    v.leader(8, 4, 16, -14, "M8×1,25")
    v.dim(50, -12.5, 50, 12.5, -6, "Ø25")

    # D2 : bout d'axe côté disque, filetage M25×1,5 + gorge
    v = View(s, 160, 70, k, "D2 · Bout d'axe côté disque : filetage M25×1,5", ty=42)
    v.rect(0, -12.5, 18, 12.5, sw=0.5, fill="#f2f3f5")
    v.rect(18, -11.25, 21, 11.25, sw=0.5, fill="#f2f3f5")
    v.rect(21, -12.5, 45, 12.5, sw=0.5, fill="#f2f3f5")
    ext_thread(v, 21, 44, 25, 1.5)
    v.poly([(44, 12.5), (45, 11.5), (45, -11.5), (44, -12.5)], close=False, sw=0.4)
    v.axis(-6, 0, 51, 0)
    v.dim(21, 12.5, 45, 12.5, 6, "24")
    v.dim(18, -12.5, 21, -12.5, -6, "3")
    v.leader(19.5, -11.25, -10, 16, "gorge Ø22,5")
    v.leader(33, 9, 12, -14, "M25×1,5 (écrou à encoches)")

    # D3 : colonne Ø16, taraudage M8 côté platine
    v = View(s, 300, 70, k, "D3 · Colonne Ø16 : taraudage M8 × 16", ty=42)
    v.rect(0, -8, 29, 8, sw=0.5, fill="#f2f3f5")
    int_thread(v, 29, -1, 8, 1.25, 16, 22)
    v.axis(-6, 0, 35, 0)
    v.dim(0, 8, 29, 8, 6, "29")
    v.dim(29, -8, 13, -8, 6, "16")
    v.text(-2, -15, "côté bride : soudé", size=2.6, anchor="middle")
    v.text(31, -15, "côté platine", size=2.6, anchor="middle")

    # D4 : axe du cliquet (et du levier), filetage M10
    v = View(s, 30, 175, k, "D4 · Axes du cliquet et du levier : filetage M10 × 14", ty=34)
    v.rect(0, -5, 41, 5, sw=0.5, fill="#f2f3f5")
    v.rect(-3, -8, 0, 8, sw=0.5, fill="#f2f3f5")
    ext_thread(v, 27, 41, 10, 1.5)
    v.axis(-8, 0, 47, 0)
    v.dim(27, 5, 41, 5, 6, "14")
    v.dim(-3, -8, 41, -8, -6, "44")
    v.leader(34, 4, 10, -14, "M10×1,5 + écrou Nylstop")
    v.leader(-1.5, 8, 8, -12, "épaulement Ø16")

    # D5 : rivet-écrou M6 dans le tube 30×30×2
    v = View(s, 170, 175, k, "D5 · Rivet-écrou M6 (habillage) : perçage Ø9", ty=38)
    v.rect(-20, 0, 40, 1.5, sw=0.4, fill="#dfe3e8")            # tôle inox
    v.rect(-20, -2, 40, 0, sw=0.4, fill="#b9c0c8")             # paroi du tube
    v.rect(-4.5, -14, 4.5, -2, sw=0.45, fill="#ffd7b0")        # corps du rivet-écrou
    v.poly([(-4.5, -9), (-6.2, -7), (-4.5, -5)], close=False, sw=0.4)
    v.poly([(4.5, -9), (6.2, -7), (4.5, -5)], close=False, sw=0.4)
    v.rect(-3, -13, 3, 6.5, sw=0.45, fill="#fff")              # vis M6
    v.rect(-6, 1.5, 6, 5, sw=0.45, fill="#e9ecef")             # tête bombée
    v.text(14, -10, "corps serti (bourrelet)", size=2.4)
    v.text(14, 3, "tôle inox 1,5 percée Ø6,5", size=2.4)
    v.text(14, -1, "paroi du tube 2 mm percée Ø9", size=2.4)
    v.axis(0, -18, 0, 9)

    # D6 : cheville chimique M12 (échelle 1:2)
    v = View(s, 330, 185, 2, "D6 · Cheville chimique M12 (1:2)", ty=-26)
    v.rect(-40, -120, 40, 0, sw=0.4, fill="#e4ded4")
    v.rect(-7, -110, 7, 0, sw=0.4, fill="#c9b9a0")
    v.rect(-6, -110, 6, 24 + 10, sw=0.45, fill="#fff")
    v.line(-5, -110, -5, 34, w=THIN)
    v.line(5, -110, 5, 34, w=THIN)
    v.rect(-30, 0, 30, 10, sw=0.45, fill="#dfe3e8")
    v.rect(-12, 10, 12, 12.5, sw=0.4, fill="#eee")
    v.rect(-10, 12.5, 10, 22.5, sw=0.45, fill="#eee")
    v.dim(-7, -110, -7, 0, 14, "110")
    v.dim(-7, -120, 7, -120, -4, "Ø14")
    v.text(16, 4, "platine 10", size=2.6)
    v.text(16, -60, "résine", size=2.6)

    frame(s, "P10", "Taraudages et filetages (détails)", "2:1 (D6 1:2)", [
        "Représentation : trait fort = matière ; trait fin = fond de filet (vis) ou diamètre nominal (trou taraudé). Les fichiers STEP contiennent les filets réels (hélices ISO 60°).",
        "Tarauder droit (guide de taraudage), huile de coupe ; inox : taraud spécial inox, vitesse lente.",
    ])
    return s


# ================================================================== pages texte
def bom_page():
    rows = "".join(
        f"<tr><td>{esc(b['groupe'])}</td><td>{esc(b['designation'])}</td><td class=c>{esc(b['quantite'])}</td><td>{esc(b['fabrication'])}</td><td class=r>{b['prix']} $</td></tr>"
        for b in g.design["bom"])
    total = sum(b["prix"] for b in g.design["bom"])
    return f"""<h2>Nomenclature et budget matière</h2>
<p class=lead>Prix indicatifs (achats en ligne ou marché local, en dollars), hors main-d'œuvre et hors transport. À remplacer par les devis réels des artisans.</p>
<table class=bom><thead><tr><th>Groupe</th><th>Désignation</th><th>Qté</th><th>Qui le fait</th><th>Prix</th></tr></thead>
<tbody>{rows}</tbody><tfoot><tr><td colspan=4>Total matière et composants du prototype</td><td class=r>≈ {total} $</td></tr></tfoot></table>
<p class=small>Main-d'œuvre : à chiffrer avec chaque artisan sur la base de ces plans. En série (10 caissons et plus), la tôle découpée au laser et les pièces tournées en lot font baisser nettement le coût par tourniquet.</p>"""


def text_pages():
    return [
        """<h2>Qui fait quoi : les métiers à mobiliser</h2>
<table class=grid><thead><tr><th>Métier</th><th>Travail</th><th>Plans</th><th>Matériel nécessaire</th></tr></thead><tbody>
<tr><td><b>Chaudronnier / soudeur inox</b></td><td>Débit, ossature soudée, habillage, soudure des bras sur le moyeu, équerres de la bride</td><td>P02, P03, P04, P07</td><td>Poste TIG, cisaille ou découpe plasma, plieuse, meuleuse avec disques inox (jamais de disque ayant servi sur l'acier noir)</td></tr>
<tr><td><b>Tourneur-fraiseur</b></td><td>Axe, moyeu, carter et alésages, disque indexeur (alésage, clavette), cliquet</td><td>P04 à P07</td><td>Tour, fraiseuse avec diviseur, mortaiseuse ou broche à clavette</td></tr>
<tr><td><b>Découpe laser (atelier ou sous-traitant)</b></td><td>Tôles de l'habillage, platine, bride, disque</td><td>P02, P03, P06, P07</td><td>Fichiers à tirer de ces plans (DXF à préparer)</td></tr>
<tr><td><b>Galvanisation / peinture</b></td><td>Platine galvanisée, carter et bride en époxy</td><td>P03, P07</td><td>—</td></tr>
<tr><td><b>Électricien / électronicien</b></td><td>Coffret, alimentation et batteries, câblage 24 V, lecteurs, programmation</td><td>P08</td><td>Multimètre, fer à souder, PC avec Arduino IDE</td></tr>
<tr><td><b>Maçon</b></td><td>Dalle béton et chevilles chimiques au point de pose</td><td>P01, P03</td><td>Perforateur, foret Ø14</td></tr>
</tbody></table>
<h2>Planning du prototype (4 semaines)</h2>
<table class=grid><tbody>
<tr><td><b>Semaine 1</b></td><td>Valider les plans avec le tourneur et le chaudronnier ; commander roulements, électroaimant, électronique ; lancer l'usinage (axe, moyeu, carter, disque).</td></tr>
<tr><td><b>Semaine 2</b></td><td>Ossature et platine ; découpe et pliage de l'habillage ; soudure des bras sur le moyeu sur gabarit.</td></tr>
<tr><td><b>Semaine 3</b></td><td>Montage du mécanisme, réglage du crantage et du cliquet ; coffret électrique ; premiers essais à l'atelier.</td></tr>
<tr><td><b>Semaine 4</b></td><td>Essais d'endurance (10 000 rotations), corrections ; pose sur site pilote ; recette avec EduPilote.</td></tr>
</tbody></table>""",
        """<h2>Guide de montage</h2>
<ol class=steps>
<li><b>Platine et ossature.</b> Souder l'ossature sur un marbre ou une table plane, contrôler les diagonales, puis la souder sur la platine galvanisée. Retoucher au zinc.</li>
<li><b>Carter.</b> Souder la bride sur le carter, faire aléser les deux logements Ø52 H7 ensuite, peindre.</li>
<li><b>Axe et roulements.</b> Presser le roulement 1 sur l'axe contre l'épaulement Ø30 (par la bague intérieure). Entrer l'axe dans le carter côté passage jusqu'à l'épaulement intérieur. Glisser l'entretoise, presser le roulement 2 côté disque (bagues intérieure et extérieure en même temps).</li>
<li><b>Disque indexeur.</b> Clavette, disque, écrou à encoches M25 × 1,5 freiné. Graisser les crans.</li>
<li><b>Mise en place.</b> Présenter le carter dans la lumière du panneau, pointer les équerres sous la lisse haute avant, boulonner la bride (4 × M10), vérifier que l'axe est à 45° (rapporteur d'angle), souder les équerres.</li>
<li><b>Crantage, cliquet, capteur.</b> Monter le levier à galet et son ressort ; régler pour qu'un bras soit exactement horizontal au repos. Monter le cliquet et l'électroaimant : le cliquet doit tomber franchement dans les crans. Régler le capteur inductif à 2 mm du disque.</li>
<li><b>Moyeu et bras.</b> Enfiler le moyeu (clavette), vis de pression M8, rondelle d'arrêt en bout d'axe. Poser les embouts.</li>
<li><b>Électricité.</b> Coffret sur entretoises, alimentation, batteries, contrôleur ; câbler suivant P08 ; presse-étoupes sur toutes les entrées de câbles.</li>
<li><b>Habillage.</b> Panneaux, joues (voyants), capot avec ses deux serrures, plastron du lecteur. Enlever le film de protection en dernier.</li>
<li><b>Pose sur site.</b> Dalle béton ≥ 120 mm, perçage Ø14, chevilles chimiques M12, mise de niveau (cales inox), serrage.</li>
</ol>
<h2>Sécurité</h2>
<ul>
<li>Le tourniquet ne doit jamais être la seule issue : prévoir à côté un <b>portillon de secours</b> qui s'ouvre librement de l'intérieur.</li>
<li>Bouton ou clé d'urgence qui libère le cliquet ; en cas d'alarme incendie, le contrôleur libère la rotation.</li>
<li>Aucune pièce en mouvement accessible : le disque et le cliquet restent sous le capot fermé à clé.</li>
<li>Pas d'arête vive : ébavurer, embouts sur les bras, angles du capot rayonnés.</li>
</ul>""",
        """<h2>Recette du prototype</h2>
<table class=grid><thead><tr><th>Essai</th><th>Méthode</th><th>Résultat attendu</th></tr></thead><tbody>
<tr><td>Rotation déverrouillée</td><td>Pousser un bras au peson</td><td>Démarre sous 30 N en bout de bras, revient seul à la position de repos (un bras horizontal)</td></tr>
<tr><td>Verrouillage</td><td>Carte refusée, pousser le bras</td><td>Aucune rotation au-delà du jeu du cran (≤ 5 mm en bout de bras)</td></tr>
<tr><td>Forçage</td><td>500 N en bout de bras, 1 minute, dans chaque sens</td><td>Pas de déformation permanente du cliquet, du disque ni du bras</td></tr>
<tr><td>Un seul passage</td><td>Carte valide, deux personnes à la suite</td><td>La première passe ; le cliquet retombe et bloque la seconde</td></tr>
<tr><td>Comptage</td><td>100 passages</td><td>100 présences « porte » dans EduPilote, 0 manquant</td></tr>
<tr><td>Endurance</td><td>10 000 rotations (motoréducteur ou banc)</td><td>Pas de jeu supplémentaire, roulements silencieux, crantage net</td></tr>
<tr><td>Réseau coupé</td><td>Débrancher le câble RJ45</td><td>Décision hors ligne ; passages renvoyés au retour du réseau</td></tr>
<tr><td>Coupure secteur</td><td>Couper le 230 V</td><td>Fonctionne sur batteries ; voyants allumés</td></tr>
<tr><td>Urgence</td><td>Bouton d'urgence / clé</td><td>Rotation libre immédiate</td></tr>
<tr><td>Pluie</td><td>Jet d'eau 5 minutes sur le capot et le plastron</td><td>Pas d'eau dans le coffret ni sur le lecteur</td></tr>
<tr><td>Lecture</td><td>Carte NFC, puis QR de l'application</td><td>Décision en moins de 1 s</td></tr>
</tbody></table>
<h2>Points à faire valider par un mécanicien ou un ingénieur</h2>
<ul>
<li>Les calculs de la page Vérification sont des ordres de grandeur : faire l'essai de forçage réel (500 N en bout de bras) avant la série ; contrôler la dureté des crans et de la dent.</li>
<li>Choix « verrouillé » ou « libre » en cas de coupure totale (batteries vides) selon le règlement de sécurité du bâtiment.</li>
<li>Rigidité du support de bride (deux équerres) et de l'ancrage au sol ; ajouter une jambe de force si l'essai de forçage fait bouger le carter.</li>
<li>Corrosion : inox 316L partout à l'extérieur, visserie inox A4, aucun contact direct inox / acier noir (rondelles isolantes).</li>
<li>Les dimensions de passage et les hauteurs suivent les tripodes du marché ; vérifier les règles locales d'accessibilité (un passage large pour fauteuil roulant à côté).</li>
</ul>""",
    ]


CSS = """
@page { size: A3 landscape; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff }
.page { width: 420mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
svg.sheet { width: 420mm; height: 297mm; display: block }
.txt { padding: 18mm 22mm 16mm; }
.txt h2 { font-size: 20pt; color: #1c2b5a; margin: 0 0 4mm }
.txt h2:not(:first-child) { margin-top: 9mm }
.txt p, .txt li, .txt td { font-size: 11.5pt; line-height: 1.45 }
.txt .lead { color: #444; margin: 0 0 5mm }
.txt .small { font-size: 10pt; color: #555 }
table { border-collapse: collapse; width: 100% }
th, td { border: 0.3mm solid #c8cdd5; padding: 1.8mm 2.6mm; text-align: left; vertical-align: top }
th { background: #1c2b5a; color: #fff; font-size: 11pt }
table.bom td { font-size: 10.5pt; padding: 1.3mm 2.4mm }
td.c { text-align: center } td.r { text-align: right; white-space: nowrap }
tfoot td { font-weight: bold; background: #f1f3f7 }
ol.steps li { margin-bottom: 2.4mm }
.foot { position: absolute; left: 22mm; right: 22mm; bottom: 9mm; font-size: 9pt; color: #777; display: flex; justify-content: space-between }
.cover { background: #1c2b5a; color: #fff; display: grid; grid-template-columns: 150mm 1fr; }
.cover .l { padding: 26mm 18mm 18mm 24mm; display: flex; flex-direction: column }
.cover h1 { font-size: 34pt; margin: 0 0 4mm; line-height: 1.1 }
.cover .sub { font-size: 15pt; color: #f5b700; margin-bottom: 12mm }
.cover dl { display: grid; grid-template-columns: auto 1fr; gap: 2.2mm 6mm; font-size: 12pt; margin: 0 }
.cover dt { color: #aeb9d6 } .cover dd { margin: 0 }
.cover .warn { margin-top: auto; font-size: 11pt; border-left: 1.2mm solid #f5b700; padding: 2mm 4mm; background: rgba(255,255,255,.07) }
.cover .r { background: #fff; display: flex; align-items: center; justify-content: center }
.cover .r img { width: 100%; }
.imgs { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm }
.imgs figure { margin: 0 } .imgs img { width: 100%; height: 104mm; object-fit: cover; border: 0.3mm solid #d5d9e0 }
.imgs figcaption { font-size: 10.5pt; color: #444; margin-top: 1.5mm }
.g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm 5mm }
.g3 figure, .g2 figure, .g4 figure { margin: 0 }
.g3 img { width: 100%; height: 64mm; object-fit: cover; border: 0.3mm solid #d5d9e0 }
.g3 figcaption, .g4 figcaption { font-size: 10pt; color: #333; margin-top: 1mm; line-height: 1.3 }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm }
.g2 img { width: 100%; height: 118mm; object-fit: cover; border: 0.3mm solid #d5d9e0 }
.g4 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 6mm }
.g4 img { width: 100%; height: 92mm; object-fit: cover; border: 0.3mm solid #d5d9e0 }
.legend { columns: 2; column-gap: 10mm; font-size: 10.5pt; margin: 4mm 0 0; padding-left: 5mm }
.legend li { margin-bottom: 1.2mm; break-inside: avoid }
.g3 + .g2t { margin-top: 5mm }
.g2t { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm }
.g2t h3 { font-size: 13pt; color: #1c2b5a; margin: 0 0 2mm }
.g2t table.bom td { font-size: 9.5pt; padding: 1mm 2mm }
table.tight td { font-size: 9pt; padding: 0.7mm 1.8mm; line-height: 1.25 }
table.tight th { font-size: 9.5pt; padding: 1mm 1.8mm }
.toc td { font-size: 12pt }
"""


def page(inner, cls=""):
    return f'<section class="page {cls}">{inner}</section>'


def txt_page(inner, n):
    return page(f'<div class=txt>{inner}</div><div class=foot><span>EduPilote · Tourniquet tripode P1 · dossier de fabrication</span><span>{n}</span></div>')


def main():
    p = g.design["params"]
    total = sum(b["prix"] for b in g.design["bom"])
    cover = f"""<div class=l><div style="font-size:12pt;letter-spacing:.2em;color:#aeb9d6;margin-bottom:8mm">ABM EDUPILOTE · FABRICATION LOCALE</div>
<h1>Tourniquet tripode<br>prototype P1</h1><div class=sub>Dossier de fabrication complet</div>
<dl><dt>Dimensions</dt><dd>{L:.0f} × {W:.0f} × {H:.0f} mm</dd><dt>Passage</dt><dd>{p['passage']} mm, bras à {HZ:.0f} mm du sol</dd>
<dt>Matière</dt><dd>inox 316L (extérieur, air salin)</dd><dt>Mécanisme</dt><dd>tripode semi-automatique, axe à 45°, cliquet 24 V</dd>
<dt>Lecture</dt><dd>carte NFC EduPilote + QR code</dd><dt>Réseau</dt><dd>Ethernet, fonctionne hors ligne</dd>
<dt>Matière première</dt><dd>≈ {total} $ (hors main-d'œuvre)</dd><dt>Date</dt><dd>{DATE} · indice A</dd><dt>Équipe</dt><dd>Brunel Atkossi et Fabrice Nachalane Boukal, cofondateurs d'ABM EduPilote</dd></dl>
<div class=warn>Première version de conception. Faire relire les plans par un mécanicien ou un ingénieur, puis fabriquer un seul prototype et passer la recette avant toute série.</div></div>
<div class=r><img src="3d-perspective.png"></div>"""
    toc_rows = [("Vues 3D", "assemblé, éclaté, transparence"), ("Mécanisme", "roulements, cliquet, galet, capteur"), ("Montage", "les 9 étapes en images"), ("Simulation", "un passage, du badge au reverrouillage"), ("Fixations", "chaque vis, écrou, cheville et soudure"), ("P01", "Ensemble – vues générales"), ("P02", "Habillage inox"),
                ("P03", "Socle, ossature, débit"), ("P04", "Moyeu et bras"), ("P05", "Axe principal"), ("P06", "Disque indexeur"),
                ("P07", "Carter et bride"), ("P08", "Schéma électrique"), ("P09", "Fixation du carter sur l'ossature"), ("P10","Taraudages et filetages"), ("Filetages", "tableau : perçage, outil, serrage, freinage"), ("Vérification", "liaisons, contrôles, corrections"), ("Nomenclature", "pièces et budget"),
                ("Métiers et planning", ""), ("Montage et sécurité", ""), ("Recette et validations", "")]
    toc = "<h2>Contenu du dossier</h2><table class=toc><tbody>" + "".join(f"<tr><td><b>{a}</b></td><td>{b}</td></tr>" for a, b in toc_rows) + "</tbody></table>"
    toc += """<h2>Fichiers fournis</h2><ul>
<li><b>tourniquet-3d.html</b> : maquette 3D interactive (tourner, vue éclatée, voir à travers l'inox, cliquer sur une pièce).</li>
<li><b>tourniquet_P1_assemblage.stl</b> : maquette 3D à l'échelle 1 (mm) pour un logiciel de CAO ou une impression 3D réduite.</li>
<li><b>Dossier Tourniquet_P1_CAO</b> : fichiers STEP (assemblage, sous-ensembles soudés, 32 pièces) pour tout logiciel de CAO, et 16 DXF de découpe laser (tôles, platines, disque, cliquet, levier, capot développé).</li>
<li><b>Video_Tourniquet_P1.mp4</b> : le montage pas à pas puis la simulation d'un passage, commentés.</li>\n<li><b>gen_design.py</b> : source unique des cotes ; modifier une valeur régénère la 3D, les plans et la nomenclature.</li></ul>"""
    imgs = """<h2>Maquette 3D</h2><div class=imgs>
<figure><img src="3d-eclate.png"><figcaption>Vue éclatée : socle, ossature, habillage, mécanisme, moyeu et bras, électronique.</figcaption></figure>
<figure><img src="3d-transparence.png"><figcaption>À travers l'inox : carter incliné à 45°, platine du mécanisme, coffrets électriques en bas.</figcaption></figure>
<figure><img src="3d-face.png"><figcaption>Face passage : un bras horizontal à 850 mm, les deux autres repliés vers le bas.</figcaption></figure>
<figure><img src="3d-bout.png"><figcaption>Vue de bout : l'axe à 45° qui sort du caisson, le bras horizontal qui ferme le passage.</figcaption></figure></div>"""
    meca = """<h2>Le mécanisme en détail</h2><div class=g2>
<figure><img src="sim-1.png"><figcaption>Vu de derrière, au repos (platine du mécanisme rendue transparente) : disque indexeur, dent du cliquet dans son cran, électroaimant, levier à galet, capteur.</figcaption></figure>
<figure><img src="3d-coupe.png"><figcaption>Coupe par l'axe : carter et son épaulement intérieur, deux roulements 6205 et leurs billes, entretoise, épaulement de l'axe, clavettes, moyeu du disque, écrou.</figcaption></figure></div>
<ol class=legend>
<li><b>Carter Ø70</b> soudé sur sa bride : il porte les deux roulements, à 120 mm l'un de l'autre.</li>
<li><b>Axe Ø25 h7</b> : il relie le moyeu (côté passage) au disque indexeur (dans le caisson).</li>
<li><b>Roulements 6205-2RS</b> (Ø25 × Ø52 × 15, 9 billes) : étanches, sans entretien.</li>
<li><b>Épaulements et entretoise</b> : l'écrou serre l'empilage contre l'épaulement de l'axe, le carter arrête les bagues extérieures (montage en X) : aucun jeu.</li>
<li><b>Disque indexeur</b> claveté, serré par un écrou à encoches : 3 crans droits pour le cliquet, 3 crans en V pour le galet.</li>
<li><b>Cliquet</b> en acier trempé sur une colonne-pivot Ø14 placée sur la ligne de l'effort : auto-bloquant, l'électroaimant ne fait que le soulever.</li>
<li><b>Électroaimant 24 V</b> et ressort de rappel : sans courant, le ressort garde le cliquet dans le cran.</li>
<li><b>Levier à galet</b> et ressort de traction : ramène toujours un bras à l'horizontale.</li>
<li><b>Capteur inductif M12</b> : voit passer les crans, donc compte chaque passage.</li>
<li><b>Moyeu</b> (plateau Ø150 + fût Ø60) claveté sur l'axe, bloqué par rondelle et vis M8 ; les 3 bras y sont soudés.</li>
</ol>"""
    steps = "".join(f'<figure><img src="montage-{i + 1}.png"><figcaption><b>{i + 1}. {esc(st["title"])}</b> — {esc(st["text"])}</figcaption></figure>' for i, st in enumerate(g.design["steps"]))
    montage = f"<h2>Montage pas à pas</h2><div class=g3>{steps}</div>"
    sim = """<h2>Simulation d'un passage</h2><div class=g4>
<figure><img src="sim-1.png"><figcaption><b>1. Repos.</b> La dent du cliquet est dans un cran : le tripode est bloqué dans les deux sens. Le galet tient un bras à l'horizontale.</figcaption></figure>
<figure><img src="sim-2.png"><figcaption><b>2. Carte acceptée.</b> Voyant vert ; l'électroaimant soulève le cliquet hors du cran.</figcaption></figure>
<figure><img src="sim-3.png"><figcaption><b>3. Rotation.</b> L'étudiant pousse : le tripode tourne de 120°, le galet sort du V et roule ; le cliquet frotte sur le bord du disque.</figcaption></figure>
<figure><img src="sim-4.png"><figcaption><b>4. Reverrouillage.</b> Le cliquet retombe dans le cran suivant ; le capteur a compté le passage, la présence est enregistrée.</figcaption></figure></div>
<p class=small>La vue 3D interactive (tourniquet-3d.html) rejoue ces étapes : boutons « Montage pas à pas », « Simuler un passage » et « Carte refusée », avec ralenti.</p>"""
    fx = {}
    for pt in g.design["parts"]:
        if pt["group"] != "Fixations":
            continue
        base = pt["id"].rsplit("-", 1)[0] if pt["id"].rsplit("-", 1)[-1] in ("tete", "tige", "rondelle", "ecrou") else pt["id"]
        e = fx.setdefault(pt["name"], {"ids": set(), "step": pt["step"], "weld": pt["color"] == g.FIX_S})
        e["ids"].add(base if not e["weld"] or not pt["id"].startswith("soudure-poteau") else base.rsplit("-", 1)[0])
    rows_v = "".join(f"<tr><td>{esc(n)}</td><td class=c>{len(e['ids'])}</td><td>{e['step']}. {esc(g.design['steps'][e['step'] - 1]['title'])}</td></tr>"
                     for n, e in sorted(fx.items(), key=lambda kv: kv[1]["step"]) if not e["weld"])
    rows_s = "".join(f"<tr><td>{esc(n)}</td><td class=c>{len(e['ids'])}</td><td>{e['step']}. {esc(g.design['steps'][e['step'] - 1]['title'])}</td></tr>"
                     for n, e in sorted(fx.items(), key=lambda kv: kv[1]["step"]) if e["weld"])
    fixp = f"""<h2>Toutes les fixations</h2><div class=g3>
<figure><img src="fix-carter.png"><figcaption><b>Carter</b> : pattes soudées sous la lisse haute, 2 vis M10 dans la bride, flasques soudées au carter (cordons jaunes).</figcaption></figure>
<figure><img src="fix-meca.png"><figcaption><b>Platine du mécanisme</b> : vis M8 sur les colonnes, écrous des axes, 2 vis M5 de l'électroaimant, écrous M12 du capteur.</figcaption></figure>
<figure><img src="fix-socle.png"><figcaption><b>Socle</b> : 4 chevilles chimiques M12 dans la dalle, cordons au pied des poteaux, entretoises des coffrets.</figcaption></figure></div>
<div class=g2t><div><h3>Visserie</h3><table class=bom><thead><tr><th>Fixation</th><th>Nb</th><th>Étape</th></tr></thead><tbody>{rows_v}</tbody></table></div>
<div><h3>Soudures</h3><table class=bom><thead><tr><th>Cordon</th><th>Nb</th><th>Étape</th></tr></thead><tbody>{rows_s}</tbody></table>
<p class=small>Dans la vue 3D, le bouton « Fixations » fait ressortir en orange chaque vis, écrou, rondelle, cheville, entretoise et cordon de soudure.</p></div></div>"""
    th = "".join(f"<tr><td>{esc(t['type'])}</td><td><b>{esc(t['filetage'])}</b></td><td>{esc(t['ou'])}</td><td class=c>{t['nombre']}</td><td>{esc(t['preparation'])}</td><td class=c>{esc(t['longueur'])}</td><td>{esc(t['outil'])}</td><td>{esc(t['serrage'])}</td><td>{esc(t['freinage'])}</td></tr>" for t in g.design["threads"])
    sc = "".join(f"<tr><td>{esc(x['designation'])}</td><td class=c>{x['nombre']}</td><td>{esc(x['ou'])}</td></tr>" for x in g.design["screws"])
    thp = f"""<h2>Taraudages et filetages</h2>
<p class=lead>Tous les trous taraudés, rivets-écrous et pièces filetées du tourniquet, dessinés en 3D avec leurs vrais filets (hélice ISO 60°) dans les fichiers STEP. Couples de serrage indicatifs pour visserie inox A4-70, à confirmer avec le fournisseur.</p>
<table class=bom><thead><tr><th>Type</th><th>Filetage</th><th>Où</th><th>Nb</th><th>Préparation</th><th>Long. utile</th><th>Outil</th><th>Serrage</th><th>Freinage</th></tr></thead><tbody>{th}</tbody></table>
<div class=g2t style="margin-top:6mm"><div><h3>Visserie à acheter (inox A4)</h3><table class=bom><thead><tr><th>Désignation</th><th>Nb</th><th>Pour</th></tr></thead><tbody>{sc}</tbody></table></div>
<div><figure style="margin:0"><img src="fil-zoom.png" style="width:100%;height:74mm;object-fit:cover;border:0.3mm solid #d5d9e0"><figcaption class=small>Bouton « Filetages » de la vue 3D : filets en jaune (axe M25×1,5, capteur M12×1, vis), trous taraudés et rivets-écrous en orange.</figcaption></figure></div></div>"""
    V = json.loads((g.HERE / "verif.json").read_text(encoding="utf-8"))
    nok = sum(c["ok"] for c in V["checks"])
    li = "".join(f"<tr><td>{esc(x['liaison'])}</td><td>{esc(x['type'])}</td><td>{esc(x['realisation'])}</td><td>{esc(x['mobilite'])}</td><td class=c>{'✔' if x['ok'] else '✘'} {x['ecart_mm']:.1f}</td></tr>" for x in V["liaisons"])
    ver1 = f"""<h2>Vérification : les liaisons</h2>
<p class=lead>Chaque liaison mécanique a été contrôlée sur le modèle : les deux pièces se touchent bien (écart en mm, 0 = contact). L'ensemble tournant n'a qu'un mouvement : la rotation autour de l'axe ; le cliquet et le levier n'ont que leur petite rotation de commande.</p>
<table class="bom tight"><thead><tr><th>Liaison</th><th>Type</th><th>Réalisation</th><th>Mobilité</th><th>Contact</th></tr></thead><tbody>{li}</tbody></table>"""
    cats = []
    for c in V["checks"]:
        if c["categorie"] == "Liaisons":
            continue
        cats.append(f"<tr><td>{esc(c['categorie'])}</td><td>{esc(c['controle'])}</td><td>{esc(c['detail'])}</td><td class=c>{'✔' if c['ok'] else '✘'}</td></tr>")
    corr = "".join(f"<tr><td>{esc(c['avant'])}</td><td>{esc(c['apres'])}</td></tr>" for c in V["corrections"])
    ver2 = f"""<h2>Vérification : {nok} contrôles sur {len(V['checks'])} validés</h2>
<table class="bom tight"><colgroup><col style="width:11%"><col style="width:38%"><col style="width:47%"><col style="width:4%"></colgroup><thead><tr><th>Domaine</th><th>Contrôle</th><th>Résultat</th><th>OK</th></tr></thead><tbody>{''.join(cats)}</tbody></table>
<p class=small>Efforts : forçage = 500 N en bout de bras ({V['efforts']['forcage_Nm']:.0f} N·m) ; usage normal = 50 N ({V['efforts']['usage_Nm']:.0f} N·m). Ordres de grandeur à confirmer par l'essai de forçage du prototype.</p>"""
    ver3 = f"""<h2>Incohérences trouvées et corrigées</h2>
<p class=lead>La vérification a relevé ces défauts dans la version précédente ; tous sont corrigés dans la 3D, les plans et la nomenclature.</p>
<table class=bom><thead><tr><th>Défaut trouvé</th><th>Correction</th></tr></thead><tbody>{corr}</tbody></table>"""
    sheets = [p01(), p02(), p03(), p04(), p05(), p06(), p07(), p08(), p09(), p10()]
    texts = text_pages()
    body = [page(cover, "cover"), txt_page(toc, 2), txt_page(imgs, 3), txt_page(meca, 4), txt_page(montage, 5), txt_page(sim, 6), txt_page(fixp, 7), txt_page(thp, 8), txt_page(ver1, 9), txt_page(ver2, 10), txt_page(ver3, 11)]
    body += [page(sh.svg()) for sh in sheets]
    n = len(body) + 1
    body.append(txt_page(bom_page(), n))
    for i, t in enumerate(texts):
        body.append(txt_page(t, n + 1 + i))
    doc = f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Tourniquet P1</title><style>{CSS}</style></head><body>{"".join(body)}</body></html>'
    (OUT / "dossier.html").write_text(doc, encoding="utf-8")
    print(f"dossier : {len(body)} pages")


if __name__ == "__main__":
    main()
