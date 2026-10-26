"""Assemble la vue 3D : out/tourniquet-3d.html (viewer.html + design.json embarqué), sa version autonome,
et la page du site ABM EduPilote (tourniquet.html à la racine du dépôt, servie à /tourniquet)."""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
SITE = "https://abmedupilote.abmcy.com"
NL = "\n"

d = json.loads((HERE / "design.json").read_text(encoding="utf-8"))
h = (HERE / "viewer.html").read_text(encoding="utf-8")
(HERE / "out").mkdir(exist_ok=True)
page = h.replace("/*DESIGN*/null", json.dumps(d, ensure_ascii=False, separators=(",", ":")))
(HERE / "out" / "tourniquet-3d.html").write_text(page, encoding="utf-8")
print("out/tourniquet-3d.html")


def standalone(body):
    head = '<!doctype html>' + NL + '<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + NL
    return head + body.replace("</style>", "</style>" + NL + "</head><body>", 1) + NL + "</body></html>" + NL


# Version autonome (double-clic, navigateur).
(HERE / "out" / "Tourniquet_P1_3D.html").write_text(standalone(page), encoding="utf-8")
print("out/Tourniquet_P1_3D.html")

# Page du site : en-têtes de partage (réseaux sociaux) et lien de retour à l'accueil.
desc = "Le tourniquet EduPilote en 3D : simulez un passage, une carte refusée et le montage pièce par pièce."
meta = NL.join([
    f'<meta name="description" content="{desc}">',
    '<meta property="og:title" content="Tourniquet EduPilote en 3D">',
    f'<meta property="og:description" content="{desc}">',
    f'<meta property="og:image" content="{SITE}/assets/tourniquet-og.jpg">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Le tourniquet EduPilote en 3D : simulez un passage">',
    '<meta property="og:site_name" content="ABM EduPilote">',
    '<meta property="og:locale" content="fr_FR">',
    '<meta name="twitter:title" content="Tourniquet EduPilote en 3D">',
    f'<meta name="twitter:description" content="{desc}">',
    f'<meta name="twitter:image" content="{SITE}/assets/tourniquet-og.jpg">',
    f'<meta property="og:url" content="{SITE}/tourniquet">',
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="https://i.postimg.cc/5HMmW3HK/logo-abm-edu-pilote.png" type="image/png">',
])
home_css = (".home { font-size: 13px; font-weight: 600; color: var(--steel); text-decoration: none; border: 1px solid var(--line); "
            "border-radius: 6px; padding: 4px 10px; }" + NL + ".home:hover { border-color: var(--muted); }" + NL)
site = page.replace("<title>Tourniquet EduPilote P1</title>", "<title>Tourniquet EduPilote P1</title>" + NL + meta, 1)
site = site.replace("<h1>Tourniquet tripode semi-automatique</h1>", '<a class="home" href="/">← ABM EduPilote</a>' + NL + "    <h1>Tourniquet tripode semi-automatique</h1>", 1)
site = site.replace("</style>", home_css + "</style>", 1)
(HERE.parent.parent / "tourniquet.html").write_text(standalone(site), encoding="utf-8")
print("tourniquet.html (site)")
