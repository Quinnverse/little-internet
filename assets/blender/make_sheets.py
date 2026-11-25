"""
Builds the review material from assets/review: contact sheets per category and a README table.

    python assets/blender/make_sheets.py          (needs Pillow)

Reads  assets/review/manifest.json, renders/*.jpg, scenes/*.png
Writes assets/review/sheets/<category>.jpg and assets/review/README.md
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.environ.get("REVIEW_OUT", "/projects/sandbox/little-internet/assets/review")
THUMB = 300
COLS = 4
LABEL_H = 54

TITLES = {
    "furniture": "Furniture (6)",
    "functional": "Functional props (22)",
    "ambient": "Ambient (12)",
    "decor": "Decor the owner can place",
    "keepsake": "Keepsakes the owner picks (8)",
    "pet": "Pet: small ghost (3 animation clips)",
    "house": "House: shells, exteriors",
}
ORDER = ["furniture", "functional", "ambient", "decor", "keepsake", "pet", "house"]


def font(size, bold=False):
    for p in (
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sheet(category, items):
    rows = (len(items) + COLS - 1) // COLS
    W = COLS * THUMB
    H = rows * (THUMB + LABEL_H) + 70
    img = Image.new("RGB", (W, H), "#f4ecdc")
    d = ImageDraw.Draw(img)
    d.text((16, 18), TITLES.get(category, category), fill="#3a2a20", font=font(26, True))
    for i, it in enumerate(items):
        x = (i % COLS) * THUMB
        y = 70 + (i // COLS) * (THUMB + LABEL_H)
        path = os.path.join(ROOT, "renders", f"{it['file']}.jpg")
        if os.path.exists(path):
            im = Image.open(path).convert("RGB").resize((THUMB, THUMB), Image.LANCZOS)
            img.paste(im, (x, y))
        d.rectangle((x, y + THUMB, x + THUMB, y + THUMB + LABEL_H), fill="#fffaf0")
        d.text((x + 10, y + THUMB + 6), it["label"], fill="#3a2a20", font=font(16, True))
        d.text((x + 10, y + THUMB + 28), it["sub"], fill="#86705c", font=font(13))
    os.makedirs(os.path.join(ROOT, "sheets"), exist_ok=True)
    out = os.path.join(ROOT, "sheets", f"{category}.jpg")
    img.save(out, quality=88)
    return out


def main():
    manifest = {m["name"]: m for m in json.load(open(os.path.join(ROOT, "manifest.json")))}
    by_cat = {}
    for m in manifest.values():
        if m.get("category") == "scene" or not m.get("ok"):
            continue
        by_cat.setdefault(m["category"], []).append(m)

    rows = []
    for cat in ORDER:
        items = sorted(by_cat.get(cat, []), key=lambda m: m["name"])
        cards = []
        for m in items:
            flag = "" if m["within_budget"] else "  OVER BUDGET"
            cards.append({"file": m["name"], "label": m["name"], "sub": f"{m['triangles']} tris, {m['glb_bytes'] // 1024} KB{flag}"})
            rows.append(m)
        if cat == "pet":
            for pose in ("idle", "move", "sleep"):
                cards.append({"file": f"pet_ghost_{pose}", "label": f"pet_ghost / {pose} clip", "sub": "pose preview (animation is in pet_ghost.glb)"})
        if cards:
            sheet(cat, cards)

    total_tris = sum(m["triangles"] for m in rows)
    total_kb = sum(m["glb_bytes"] for m in rows) / 1024
    lines = [
        "# Little Internet: 3D model review",
        "",
        "Made in Blender 5.0 (bpy) by `assets/blender/build_props.py`, rendered with Cycles (CPU). Models are low-poly,",
        "rounded, and use one shared palette. 42 of them are the kit the web app uses (`npm run assets:kit`).",
        "",
        "## Where to look",
        "",
        "| What | Where |",
        "|---|---|",
        "| Assembled scenes (day, night, villa, exterior, desk close-up) | `scenes/*.png` |",
        "| One contact sheet per category | `sheets/*.jpg` |",
        "| Each model, 3/4 view | `renders/<name>.jpg` |",
        "| The models themselves (glTF binary, metres, Y up, origin at the bottom centre) | `glb/<name>.glb` |",
        "| Assembled room and exterior as single models | `glb/room_cabin.glb`, `glb/room_villa.glb`, `glb/exterior_cabin.glb`, `glb/exterior_villa.glb` |",
        "| Numbers for every model | `manifest.json` and the table below |",
        "",
        f"**{len(rows)} models**, {total_tris:,} triangles in total, {total_kb:,.0f} KB of glb before any compression.",
        "",
        "## Conventions the web app will rely on",
        "",
        "- 1 unit = 1 m. Room floor is x 0..6, z 0..6, floor top at y = 0. x right, y up, z toward the viewer.",
        "- Room walls are separate nodes `wall_back`, `wall_left`, `wall_front`, `wall_right`, with real window and door openings,",
        "  so the app can fade whichever wall faces the camera. The door leaf hangs from the empty `door_pivot` (rotate it to open).",
        "- Hotspot anchors are empties named `hs_*`: `hs_computer`, `hs_diary`, `hs_voice`, `hs_shelf`, `hs_window`, `hs_door`,",
        "  `hs_doorbell`, `hs_mailbox`, `hs_export` (the CD), `hs_photo_wall`, `hs_record_player`, `hs_pet`, `hs_desk`.",
        "- The computer screen material is `screen`. Lit things use materials named `emissive_*` so the app can dim them by day.",
        "- Budgets: props < 2,000 triangles, furniture < 5,000, buildings < 15,000. The table flags anything over.",
        "",
        "## Models",
        "",
        "| Model | Category | Triangles | KB | Budget |",
        "|---|---|---:|---:|---|",
    ]
    for cat in ORDER:
        for m in sorted(by_cat.get(cat, []), key=lambda m: m["name"]):
            lines.append(f"| `{m['name']}` | {cat} | {m['triangles']:,} | {m['glb_bytes'] // 1024} | {'ok' if m['within_budget'] else 'OVER'} |")
    scenes = [m for m in manifest.values() if m.get("category") == "scene"]
    lines += ["", "## Scenes", "", "| Scene | Triangles |", "|---|---:|"]
    for m in sorted(scenes, key=lambda m: m["name"]):
        lines.append(f"| `{m['name']}` | {m.get('triangles', 0):,} |")
    lines += [
        "",
        "## Known gaps (honest list)",
        "",
        "- Ambient occlusion is **not** baked into vertex colours yet. These renders are Cycles-lit; the web app will light the same models in real time and will look flatter.",
        "- The pet's three clips (`idle`, `move`, `sleep`) are node animations (bob, lean, squash, blink). There is no skeleton, which is enough for a rounded ghost.",
        "- Shapes are built from code (rounded boxes, cylinders, spheres). Organic things (leaves, shell, ghost) are simple and toy-like, not sculpted.",
        "- SketchUp was not used (no Linux build in the sandbox); the white-box layout was done in Blender.",
        "- The glb files are uncompressed. See the size summary in the chat for what compression would save.",
        "",
    ]
    with open(os.path.join(ROOT, "README.md"), "w") as f:
        f.write("\n".join(lines))
    print(f"{len(rows)} models, {total_tris} tris, {total_kb:.0f} KB; sheets written")


if __name__ == "__main__":
    main()
