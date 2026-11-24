"""
Blender models for the Little Internet room: every furniture piece, keepsake, the pet, and the house.

Run (inside the Blender Python environment; see assets/blender/README.md):
    python assets/blender/build_props.py            # everything
    python assets/blender/build_props.py desk lamp  # some items

For each item it writes:
    <out>/glb/<name>.glb     the model (glTF, meters, Y up)
    <out>/renders/<name>.png a preview rendered with Cycles (CPU)

Coordinate convention (same as the web app):
    x = right, y = up, z = toward the viewer, 1 unit = 1 meter.
    Each item's origin sits where it stands: floor items on the floor at their centre,
    items on a surface on that surface, wall items on the wall surface (facing +z).
"""

import math
import os
import random
import sys

import bpy  # must come before bmesh: it is provided by the bpy package
import bmesh
from mathutils import Euler, Vector

OUT = os.environ.get("REVIEW_OUT", "/projects/sandbox/little-internet/assets/review")

# ---------------------------------------------------------------- palette (matches src/room3d)
WOOD = "#b57d4a"
WOOD_L = "#d09a62"
WOOD_D = "#7d5233"
CREAM = "#f3e7d0"
CREAM2 = "#dcd3bd"
RED = "#c25b4a"
GREEN = "#6f9a82"
TEAL = "#5f9ea0"
BRASS = "#e8c15a"
INK = "#2c3640"
METAL = "#3d4a55"
PINK = "#f08ab0"
YELLOW = "#f7c948"
WHITE = "#ffffff"
LEAF = "#5aa06a"
LEAF2 = "#74b27d"
TERRA = "#d98a6c"
SOIL = "#4b3626"
GLASS = "#9ec6d8"

# ---------------------------------------------------------------- materials


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgb(hexc):
    return tuple(_lin(int(hexc[i : i + 2], 16) / 255) for i in (1, 3, 5))


_mats = {}


def M(hexc, rough=0.75, metal=0.0, emit=None, strength=0.0):
    key = (hexc, rough, metal, emit, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name=f"m{len(_mats)}_{hexc}")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    r, g, bb = _rgb(hexc)
    b.inputs["Base Color"].default_value = (r, g, bb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        er, eg, eb = _rgb(emit)
        b.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
        b.inputs["Emission Strength"].default_value = strength
    _mats[key] = m
    return m


def GLOW(hexc, strength):
    return M(hexc, rough=0.4, emit=hexc, strength=strength)


# ---------------------------------------------------------------- geometry helpers


def P(x, y, z):
    """App coordinates (y up) to Blender coordinates (z up)."""
    return (x, -z, y)


def make_torus(bm, R, r, nu=40, nv=14):
    verts = []
    for i in range(nu):
        u = 2 * math.pi * i / nu
        for j in range(nv):
            v = 2 * math.pi * j / nv
            rr = R + r * math.cos(v)
            verts.append(bm.verts.new((rr * math.cos(u), rr * math.sin(u), r * math.sin(v))))
    bm.verts.ensure_lookup_table()
    for i in range(nu):
        for j in range(nv):
            a = verts[i * nv + j]
            b = verts[((i + 1) % nu) * nv + j]
            c = verts[((i + 1) % nu) * nv + (j + 1) % nv]
            d = verts[i * nv + (j + 1) % nv]
            bm.faces.new((a, b, c, d))


def make_prism(bm, w, h, d):
    """Gable roof: triangle in the x/z plane (blender), extruded along blender y (= app z)."""
    hw = w / 2
    y0, y1 = -d / 2, d / 2
    v = [
        bm.verts.new((-hw, y0, 0)),
        bm.verts.new((hw, y0, 0)),
        bm.verts.new((0, y0, h)),
        bm.verts.new((-hw, y1, 0)),
        bm.verts.new((hw, y1, 0)),
        bm.verts.new((0, y1, h)),
    ]
    bm.faces.new((v[0], v[1], v[2]))
    bm.faces.new((v[5], v[4], v[3]))
    bm.faces.new((v[0], v[3], v[4], v[1]))
    bm.faces.new((v[1], v[4], v[5], v[2]))
    bm.faces.new((v[2], v[5], v[3], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def part(kind, dims, at, mat, rot=(0, 0, 0), bevel=0.0, smooth=False, name="part"):
    """One mesh piece. `rot` is an XYZ Euler in Blender axes; rot[2] is the yaw around the app's y."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if kind == "box":
        w, h, d = dims
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    elif kind in ("cyl", "cone"):
        r1, r2, h = dims[0], dims[1], dims[2]
        cap = dims[3] if len(dims) > 3 else True
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=32, radius1=r1, radius2=r2, depth=h)
        smooth = True
    elif kind == "ellipsoid":
        sx, sy, sz = dims
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
        smooth = True
    elif kind == "torus":
        make_torus(bm, dims[0], dims[1])
        smooth = True
    elif kind == "prism":
        make_prism(bm, *dims)
    else:
        raise ValueError(kind)
    rot_m = Euler(rot, "XYZ").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot_m, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = P(*at)
    me.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(35)
    return ob


def bx(w, h, d, at, col, rough=0.7, bevel=0.012, rot=(0, 0, 0), name="box"):
    return part("box", (w, h, d), at, M(col, rough), rot, bevel, name=name)


def cy(r, h, at, col, rough=0.7, rot=(0, 0, 0), cap=True, name="cyl"):
    return part("cyl", (r, r, h, cap), at, M(col, rough), rot, name=name)


def co(r1, r2, h, at, col, rough=0.7, cap=True, rot=(0, 0, 0), name="cone"):
    return part("cone", (r1, r2, h, cap), at, M(col, rough), rot, name=name)


def el(sx, sy, sz, at, col, rough=0.6, rot=(0, 0, 0), name="ellipsoid", mat=None):
    return part("ellipsoid", (sx, sy, sz), at, mat or M(col, rough), rot, name=name)


def to(R, r, at, col, rot=(0, 0, 0), name="torus"):
    return part("torus", (R, r), at, M(col, 0.7), rot, name=name)


def glow_el(r, at, col, strength, name="glow"):
    return part("ellipsoid", (r, r, r), at, GLOW(col, strength), name=name)


# ---------------------------------------------------------------- scene management


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
        for x in list(coll):
            if x.users == 0:
                coll.remove(x)
    _mats.clear()


def scene_bounds():
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.startswith("ground"):
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    center = Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
    size = max(hi[i] - lo[i] for i in range(3))
    return center, size, lo[2]


def add_camera_and_lights(center, size, floor_z, three_quarter=True):
    scene = bpy.context.scene
    # ground plane (catches shadows, keeps each piece from floating in grey space)
    g = bpy.data.meshes.new("ground")
    gb = bmesh.new()
    bmesh.ops.create_grid(gb, x_segments=1, y_segments=1, size=size * 3)
    gb.to_mesh(g)
    gb.free()
    go = bpy.data.objects.new("ground", g)
    bpy.context.collection.objects.link(go)
    go.location = (center.x, center.y, floor_z - 0.001)
    go.data.materials.append(M("#d6cbb6", 1.0))

    target = bpy.data.objects.new("target", None)
    target.empty_display_size = 0.1
    bpy.context.collection.objects.link(target)
    target.location = center

    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = 50 if size < 4 else 35
    cam = bpy.data.objects.new("cam", cam_d)
    bpy.context.collection.objects.link(cam)
    dist = size * 2.2 + 0.8
    # 3/4 view from the front-right, a little above (app offsets mapped with P())
    off = Vector(P(0.8, 0.85, 1.0)) * dist if three_quarter else Vector(P(0, 0.4, 1.0)) * dist
    cam.location = center + off
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    scene.camera = cam

    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 1.6
    sun.angle = math.radians(4)
    so = bpy.data.objects.new("sun", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), math.radians(8), math.radians(-38))

    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 70
    fill.size = max(2.0, size * 1.5)
    fo = bpy.data.objects.new("fill", fill)
    bpy.context.collection.objects.link(fo)
    fo.location = center + Vector(P(-size * 1.2, size * 1.1, size * 0.6))
    fo.rotation_euler = (math.radians(70), 0, math.radians(-30))

    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.78, 0.75, 0.70, 1.0)
    bg.inputs["Strength"].default_value = 0.55


def setup_render(res=720, samples=48):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"


def triangles():
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.startswith("ground"):
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        total += sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
    return total


def export_item(name, glb_dir, rend_dir, three_quarter=True):
    center, size, floor_z = scene_bounds()
    add_camera_and_lights(center, size, floor_z, three_quarter)
    setup_render()
    bpy.context.scene.render.filepath = os.path.join(rend_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    # remove helpers before exporting the model
    for o in list(bpy.context.scene.objects):
        if o.name.split(".")[0] in ("ground", "target", "cam", "sun", "fill"):
            bpy.data.objects.remove(o, do_unlink=True)
    tris = triangles()
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(glb_dir, f"{name}.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    return {"name": name, "triangles": tris, "parts": len(meshes), "size_m": [round(size, 2)]}


# ================================================================ furniture (fixed built-ins)


def item_desk():
    W, D, H = 1.9, 0.86, 0.75
    bx(W, 0.05, D, (0, H - 0.025, 0), WOOD_L, bevel=0.01, name="top")
    for sx in (-0.92, 0.92):
        bx(0.05, H - 0.05, D - 0.04, (sx, (H - 0.05) / 2, 0), WOOD, name="leg-panel")
    bx(W - 0.1, 0.4, 0.03, (0, 0.5, -D / 2 + 0.02), WOOD_D, name="back")
    bx(0.55, 0.62, 0.74, (0.6, 0.4, 0.0), WOOD, name="drawer-block")
    for y in (0.22, 0.46):
        bx(0.48, 0.2, 0.02, (0.6, y, 0.38), WOOD_L, bevel=0.005, name="drawer-front")
        el(0.025, 0.025, 0.025, (0.6, y, 0.395), BRASS, name="knob")


def item_computer():
    bx(0.3, 0.02, 0.26, (0, 0.02, 0.02), CREAM2, name="stand")
    bx(0.5, 0.42, 0.4, (0, 0.27, -0.02), CREAM2, name="body")
    bx(0.44, 0.34, 0.04, (0, 0.27, 0.18), CREAM2, name="bezel")
    bx(0.34, 0.26, 0.012, (0, 0.27, 0.205), "#2d5c8c", rough=0.3, bevel=0.0, name="screen")
    el(0.012, 0.012, 0.012, (0.17, 0.09, 0.2), "#7cf08a", name="led", mat=GLOW("#7cf08a", 3))
    bx(0.44, 0.03, 0.14, (0, 0.015, 0.38), CREAM2, name="keyboard")
    bx(0.06, 0.025, 0.09, (0.34, 0.013, 0.38), CREAM2, bevel=0.01, name="mouse")


def item_diary():
    bx(0.5, 0.045, 0.37, (0, 0.0225, 0), RED, bevel=0.01, name="cover")
    bx(0.46, 0.03, 0.33, (0.012, 0.06, 0), CREAM, bevel=0.004, name="pages")
    bx(0.04, 0.052, 0.375, (0.2, 0.026, 0), BRASS, bevel=0.004, name="band")
    bx(0.012, 0.004, 0.14, (-0.05, 0.052, 0.25), BRASS, bevel=0.0, name="ribbon")
    cy(0.01, 0.22, (0.1, 0.075, 0.12), INK, rot=(0, math.pi / 2, 0), name="pen")


def item_desk_lamp():
    cy(0.07, 0.03, (0, 0.015, 0), METAL, name="base")
    cy(0.012, 0.36, (0, 0.2, 0), METAL, name="arm")
    co(0.11, 0.04, 0.14, (0, 0.39, 0), "#e8b04a", cap=False, name="shade")
    glow_el(0.03, (0, 0.36, 0), "#ffe2a8", 6, name="bulb")


def item_chair():
    bx(0.5, 0.08, 0.5, (0, 0.5, 0), GREEN, bevel=0.03, name="seat")
    bx(0.5, 0.5, 0.07, (0, 0.8, 0.22), GREEN, bevel=0.03, name="back")
    for x in (-0.2, 0.2):
        for z in (-0.2, 0.2):
            cy(0.02, 0.48, (x, 0.24, z), WOOD_D, name="leg")


def item_bookshelf():
    random.seed(7)
    W, D, H = 1.9, 0.5, 2.55
    for sx in (-0.92, 0.92):
        bx(0.06, H, D, (sx, H / 2, D / 2), WOOD_D, bevel=0.01, name="side")
    for y in (0.03, 0.85, 1.65, 2.5):
        bx(1.84, 0.05, D, (0, y, D / 2), WOOD, bevel=0.005, name="shelf")
    bx(1.84, H, 0.02, (0, H / 2, 0.01), WOOD_D, bevel=0.0, name="back")
    palette = ["#c95f4a", "#e3b34f", "#5f8fb3", "#7aa57a", "#8d6bb0", "#f0e6d2", "#d98a6c"]
    for top in (0.055, 0.875, 1.675):
        x = -0.8
        while x < 0.7:
            w = random.uniform(0.035, 0.07)
            h = random.uniform(0.2, 0.3)
            if random.random() > 0.12:
                bx(w, h, 0.24, (x + w / 2, top + h / 2, D / 2), random.choice(palette), bevel=0.004, name="book")
            x += w + 0.004
    bx(0.6, 0.5, 0.36, (-0.4, 2.525 + 0.25, 0.28), "#c9a36d", bevel=0.03, name="wicker")
    co(0.1, 0.08, 0.14, (0.5, 2.525 + 0.07, 0.26), RED, name="pot")
    for i in range(5):
        a = i * 1.25
        el(0.07, 0.2, 0.03, (0.5 + math.cos(a) * 0.09, 2.525 + 0.3, 0.26 + math.sin(a) * 0.09), LEAF, name="leaf")


def item_answering_table():
    bx(0.8, 0.05, 0.8, (0, 0.62, 0), WOOD_L, bevel=0.01, name="top")
    for sx in (-1, 1):
        for sz in (-1, 1):
            cy(0.03, 0.6, (sx * 0.34, 0.3, sz * 0.34), WOOD_D, name="leg")


def item_answering_machine():
    bx(0.42, 0.12, 0.3, (0, 0.06, 0), CREAM2, bevel=0.02, name="body")
    bx(0.26, 0.012, 0.18, (-0.04, 0.125, -0.02), INK, bevel=0.0, name="deck")
    for x in (-0.1, 0.02):
        cy(0.035, 0.012, (x, 0.132, -0.02), "#eae6da", name="reel")
    glow_el(0.018, (0.16, 0.125, 0.09), "#ff3a3a", 3, name="led")
    for i in range(3):
        bx(0.045, 0.02, 0.03, (-0.12 + i * 0.07, 0.12, 0.11), RED if i == 0 else "#6c7a86", bevel=0.006, name="button")


def item_phone():
    bx(0.24, 0.08, 0.2, (0, 0.04, 0), RED, bevel=0.02, name="base")
    cy(0.06, 0.015, (0, 0.088, 0.02), CREAM, name="dial")
    bx(0.24, 0.04, 0.05, (0, 0.12, -0.04), RED, bevel=0.015, name="handset")


def item_pet_bed():
    to(0.36, 0.1, (0, 0.1, 0), "#d9a56b", name="rim")
    cy(0.42, 0.1, (0, 0.05, 0), "#f0d9bd", name="cushion")


def item_rug():
    a, b = "#c9786b", "#f0d9bd"
    cy(1.35, 0.02, (0, 0.01, 0), a, name="outer")
    cy(1.0, 0.024, (0, 0.012, 0), b, name="inner")
    cy(0.55, 0.028, (0, 0.014, 0), a, name="core")


# ================================================================ decor


def item_floor_lamp():
    cy(0.18, 0.04, (0, 0.02, 0), METAL, name="base")
    cy(0.018, 1.45, (0, 0.75, 0), METAL, name="pole")
    co(0.24, 0.16, 0.3, (0, 1.55, 0), "#ffd9a0", cap=False, name="shade")
    glow_el(0.05, (0, 1.5, 0), "#ffd9a0", 4, name="bulb")


def item_plant():
    co(0.15, 0.2, 0.3, (0, 0.15, 0), TERRA, name="pot")
    cy(0.19, 0.02, (0, 0.3, 0), SOIL, name="soil")
    greens = ["#4f9566", "#63ab74", "#3f8458"]
    for i in range(9):
        a = i / 9 * math.tau
        el(0.07, 0.22, 0.03, (math.cos(a) * 0.13, 0.62, math.sin(a) * 0.13), greens[i % 3],
           rot=(math.sin(a) * 0.5, 0, -a), name="leaf")
    el(0.05, 0.25, 0.03, (0, 0.72, 0), LEAF, name="leaf-mid")


def item_cactus():
    co(0.16, 0.13, 0.22, (0, 0.11, 0), "#e4c9a0", name="pot")
    cy(0.11, 0.55, (0, 0.5, 0), "#5d9a62", name="body")
    el(0.11, 0.11, 0.11, (0, 0.78, 0), "#5d9a62", name="top")
    for s in (-1, 1):
        cy(0.05, 0.2, (s * 0.17, 0.55, 0), "#5d9a62", rot=(0, math.pi / 2, 0), name="arm")
        el(0.05, 0.05, 0.05, (s * 0.27, 0.55, 0), "#5d9a62", name="arm-tip")
        cy(0.04, 0.12, (s * 0.1, 0.46, 0), "#5d9a62", rot=(0, math.pi / 2, 0), name="hold")
    el(0.04, 0.04, 0.04, (0, 0.9, 0), PINK, name="flower")


def item_armchair():
    c = TERRA
    bx(0.78, 0.28, 0.72, (0, 0.28, 0), c, bevel=0.06, name="seat")
    bx(0.78, 0.6, 0.18, (0, 0.6, 0.27), c, bevel=0.06, name="back")
    for sx in (-0.4, 0.4):
        bx(0.14, 0.4, 0.66, (sx, 0.38, 0), "#c97759", bevel=0.05, name="arm")
    bx(0.5, 0.1, 0.5, (0, 0.5, -0.04), "#efc9a8", bevel=0.04, name="cushion")
    for x in (-0.3, 0.3):
        for z in (-0.28, 0.28):
            cy(0.025, 0.14, (x, 0.07, z), WOOD_D, name="leg")


def item_stool():
    cy(0.22, 0.07, (0, 0.5, 0), TEAL, name="seat")
    for a in (0, 2.1, 4.2):
        cy(0.025, 0.5, (math.cos(a) * 0.14, 0.25, math.sin(a) * 0.14), WOOD_D, name="leg")


def item_basket():
    co(0.24, 0.3, 0.34, (0, 0.17, 0), "#c9a36d", name="wicker")
    el(0.26, 0.1, 0.26, (0, 0.36, 0), "#e8b4b8", name="blanket")


def item_mini_bookcase():
    bx(0.9, 0.9, 0.34, (0, 0.45, 0), WOOD, bevel=0.02, name="cabinet")
    for y in (0.3, 0.6):
        bx(0.8, 0.04, 0.3, (0, y, 0.02), WOOD_L, bevel=0.004, name="shelf")
    for i, c in enumerate(["#c95f4a", "#e3b34f", "#5f8fb3", "#7aa57a"]):
        bx(0.1, 0.22, 0.2, (-0.27 + i * 0.12, 0.43, 0.02), c, bevel=0.006, name="book")


# ================================================================ keepsakes (picked by the owner)


def item_keepsake_shell():
    el(0.12, 0.05, 0.1, (0, 0.03, 0), "#f4c7b9", rough=0.5, name="scallop")
    for a in (-0.5, -0.15, 0.2, 0.55):
        bx(0.04, 0.012, 0.09, (math.sin(a) * 0.05, 0.02, -0.04 * math.cos(a)), "#e9b5a4",
           bevel=0.003, rot=(0, a, 0), name="rib")


def item_keepsake_candle():
    cy(0.07, 0.02, (0, 0.01, 0), BRASS, name="holder")
    cy(0.05, 0.14, (0, 0.09, 0), CREAM, name="wax")
    glow_el(0.022, (0, 0.18, 0), "#ffb347", 3, name="flame")


def item_keepsake_book():
    bx(0.2, 0.04, 0.15, (0, 0.02, 0), "#5f8fb3", bevel=0.005, name="book-1")
    bx(0.18, 0.035, 0.14, (0.01, 0.058, 0), "#e3b34f", bevel=0.005, rot=(0, 0.3, 0), name="book-2")
    bx(0.19, 0.03, 0.13, (-0.01, 0.09, 0), RED, bevel=0.005, rot=(0, -0.15, 0), name="book-3")


def item_keepsake_flower_vase():
    cy(0.05, 0.12, (0, 0.06, 0), GLASS, rough=0.15, name="vase")
    for i, c in enumerate([PINK, YELLOW, WHITE]):
        a = i * 2.1
        x, z = math.cos(a) * 0.025, math.sin(a) * 0.025
        cy(0.006, 0.2, (x, 0.22, z), LEAF, name="stem")
        el(0.035, 0.035, 0.035, (x + math.cos(a) * 0.02, 0.33, z + math.sin(a) * 0.02), c, name="petal")


def item_keepsake_cassette():
    bx(0.19, 0.025, 0.12, (0, 0.0125, 0), CREAM2, bevel=0.005, name="body")
    bx(0.15, 0.004, 0.05, (0, 0.027, 0), "#2c3640", bevel=0.0, name="window")
    for x in (-0.04, 0.04):
        cy(0.014, 0.005, (x, 0.03, 0), INK, name="reel")
    bx(0.15, 0.003, 0.012, (0, 0.028, -0.04), RED, bevel=0.0, name="label")


def item_keepsake_postcard():
    bx(0.46, 0.32, 0.012, (0, 0, 0.006), CREAM, bevel=0.004, name="card")
    bx(0.4, 0.26, 0.004, (0, 0, 0.014), "#8fb8c9", bevel=0.0, name="picture")
    bx(0.07, 0.08, 0.004, (0.16, 0.1, 0.017), RED, bevel=0.0, name="stamp")
    for x, y in ((-0.2, 0.14), (0.2, 0.14)):
        bx(0.1, 0.03, 0.004, (x, y, 0.009), "#f5df9a", bevel=0.0, rot=(0, 0, 0.5 if x < 0 else -0.5), name="tape")


def item_keepsake_photo_frame():
    bx(0.5, 0.4, 0.035, (0, 0, 0.0175), WOOD_D, bevel=0.01, name="frame")
    bx(0.4, 0.3, 0.006, (0, 0, 0.037), "#cfe0ea", bevel=0.0, name="photo")


def item_keepsake_ticket():
    bx(0.34, 0.15, 0.008, (0, 0, 0.004), "#f4c95d", bevel=0.004, name="ticket")
    bx(0.003, 0.15, 0.01, (0.1, 0, 0.005), "#c9a02e", bevel=0.0, name="tear")


# ================================================================ the pet


def item_pet_ghost():
    body = M("#f1f4f9", rough=0.45)
    cy(0.3, 0.5, (0, 0.3, 0), "#f1f4f9", rough=0.45, name="body")
    el(0.3, 0.3, 0.3, (0, 0.55, 0), "#f1f4f9", rough=0.45, mat=body, name="head")
    for s in (-1, 1):
        el(0.035, 0.05, 0.03, (s * 0.1, 0.5, 0.27), INK, name="eye")
        el(0.03, 0.02, 0.01, (s * 0.19, 0.42, 0.25), "#ffa6b8", name="cheek")


# ================================================================ the house


def wall_seg(x0, x1, y0, y1, zc, col, T=0.16):
    return bx(x1 - x0, y1 - y0, T, ((x0 + x1) / 2, (y0 + y1) / 2, zc), col, bevel=0.0, name="wall")


def item_room_shell(villa=False):
    wall = "#f1e3c8" if not villa else "#f3efe6"
    trim = WOOD_D if not villa else "#f6f3ec"
    slab = "#8c6a4b" if not villa else "#d8d4cb"
    floor_col = WOOD_L if not villa else "#e1dbcd"
    H, T = 3.1, 0.16
    bx(6.5, 0.4, 6.5, (3, -0.2, 3), slab, bevel=0.03, name="slab")
    bx(6.0, 0.02, 6.0, (3, 0.01, 3), floor_col, bevel=0.0, rough=0.6, name="floor")
    # back wall (z = 0) with a window
    a0, a1, y0, y1 = 2.6, 3.8, 1.0, 2.4
    wall_seg(0, a0, 0, H, -T / 2, wall)
    wall_seg(a1, 6, 0, H, -T / 2, wall)
    wall_seg(a0, a1, 0, y0, -T / 2, wall)
    wall_seg(a0, a1, y1, H, -T / 2, wall)
    # left wall (x = 0) with a door opening at z 4.05 .. 4.95
    d0, d1, dh = 4.05, 4.95, 2.15
    for z0, z1, zb, zt in ((0, d0, 0, H), (d1, 6, 0, H), (d0, d1, dh, H)):
        bx(T, zt - zb, z1 - z0, (-T / 2, (zb + zt) / 2, (z0 + z1) / 2), wall, bevel=0.0, name="wall")
    # front (z = 6) and right (x = 6) walls
    bx(6.16, H, T, (3, H / 2, 6 + T / 2 - 0.08), wall, bevel=0.0, name="wall")
    bx(T, H, 6.16, (6 + T / 2 - 0.08, H / 2, 3), wall, bevel=0.0, name="wall")
    # baseboards and top caps
    bx(6.0, 0.14, 0.03, (3, 0.07, 0.015), trim, bevel=0.005, name="baseboard")
    bx(0.03, 0.14, 6.0, (0.015, 0.07, 3), trim, bevel=0.005, name="baseboard")
    bx(6.0, 0.14, 0.03, (3, 0.07, 5.985), trim, bevel=0.005, name="baseboard")
    bx(0.03, 0.14, 6.0, (5.985, 0.07, 3), trim, bevel=0.005, name="baseboard")
    # window: frame, glass, sill
    wx, wy = (a0 + a1) / 2, (y0 + y1) / 2
    ww, wh = a1 - a0, y1 - y0
    bx(ww, wh, 0.01, (wx, wy, -0.07), "#cfe8ff", bevel=0.0, name="glass")
    bx(ww + 0.14, 0.07, 0.1, (wx, y1 + 0.035, -0.05), trim, bevel=0.01, name="frame-top")
    bx(ww + 0.14, 0.07, 0.1, (wx, y0 - 0.035, -0.05), trim, bevel=0.01, name="frame-bottom")
    bx(0.07, wh, 0.1, (a0 - 0.035, wy, -0.05), trim, bevel=0.01, name="frame-left")
    bx(0.07, wh, 0.1, (a1 + 0.035, wy, -0.05), trim, bevel=0.01, name="frame-right")
    bx(0.04, wh, 0.06, (wx, wy, -0.08), trim, bevel=0.0, name="mullion")
    bx(ww, 0.04, 0.06, (wx, wy, -0.08), trim, bevel=0.0, name="transom")
    bx(ww + 0.3, 0.05, 0.3, (wx, y0 + 0.01, 0.13), trim if villa else "#c9a36d", bevel=0.02, name="sill")
    if not villa:
        for s in (-1, 1):
            bx(0.3, wh + 0.2, 0.07, (wx + s * (ww / 2 + 0.05), wy, 0.07), "#e3a88f", bevel=0.03, name="curtain")
    else:
        bx(ww + 0.2, 0.22, 0.06, (wx, y1 - 0.02, 0.07), "#e9e5da", bevel=0.02, name="blind")
    # top caps
    bx(6.16, 0.1, 0.24, (3, H + 0.03, -0.08), trim, bevel=0.02, name="cap")
    bx(6.16, 0.1, 0.24, (3, H + 0.03, 6.08), trim, bevel=0.02, name="cap")
    bx(0.24, 0.1, 6.16, (-0.08, H + 0.03, 3), trim, bevel=0.02, name="cap")
    bx(0.24, 0.1, 6.16, (6.08, H + 0.03, 3), trim, bevel=0.02, name="cap")


def item_house_door():
    """A closed door leaf. Origin at the bottom of the hinge; the leaf runs along +x. Rotate it in the app."""
    W, Hd = 0.9, 2.13
    bx(W, Hd, 0.06, (W / 2, Hd / 2, 0), "#a1693b", bevel=0.02, name="leaf")
    bx(0.55, 0.9, 0.02, (W / 2, 1.3, 0.04), "#8c5830", bevel=0.01, name="panel-top")
    bx(0.55, 0.6, 0.02, (W / 2, 0.55, 0.04), "#8c5830", bevel=0.01, name="panel-bottom")
    el(0.025, 0.025, 0.025, (W - 0.12, 1.0, 0.07), BRASS, name="knob")


def item_exterior(villa=False):
    body = "#f3efe6" if villa else "#e6dcc4"
    trim = "#f6f3ec" if villa else WOOD_D
    roof = "#f6f3ec" if villa else "#a8553a"
    T, bw, bh = 0.8, 5.4, 2.9
    dw, dh = 0.95, 1.95
    hw = dw / 2
    # front wall with the doorway
    bx(bw / 2 - hw, bh, T, (-(bw / 2 + hw) / 2, bh / 2, -T / 2), body, bevel=0.0, name="front-left")
    bx(bw / 2 - hw, bh, T, ((bw / 2 + hw) / 2, bh / 2, -T / 2), body, bevel=0.0, name="front-right")
    bx(dw, bh - dh, T, (0, (bh + dh) / 2, -T / 2), body, bevel=0.0, name="front-top")
    bx(bw, bh, 3.2, (0, bh / 2, -T - 1.6), body, bevel=0.0, name="back")
    if not villa:
        prism_at = (0, bh, -2.0)
        part("prism", (6.3, 1.7, 4.6), prism_at, M(roof, 0.85), bevel=0.0, name="roof")
        bx(0.5, 1.3, 0.5, (1.7, bh + 1.0, -2.4), "#8a5a45", bevel=0.0, name="chimney")
        el(0.28, 0.28, 0.02, (0, bh + 0.8, 0.32), "#f2e3c0", name="gable-window")
    else:
        bx(bw + 0.8, 0.28, 4.8, (0, bh + 0.14, -2.0), roof, bevel=0.03, name="roof-slab")
        bx(3.4, 1.3, 3.0, (-0.6, bh + 0.28 + 0.65, -2.4), "#ece7dc", bevel=0.03, name="upper")
        bx(3.8, 0.2, 3.4, (-0.6, bh + 0.28 + 1.4, -2.4), roof, bevel=0.03, name="upper-cap")
        bx(2.4, 0.8, 0.02, (-0.6, bh + 0.98, -0.9), "#cfe8ff", bevel=0.0, name="upper-glass")
    # door frame (the leaf is a separate item)
    bx(0.09, dh + 0.05, 0.14, (-hw - 0.045, dh / 2, 0.05), trim, bevel=0.01, name="frame")
    bx(0.09, dh + 0.05, 0.14, (hw + 0.045, dh / 2, 0.05), trim, bevel=0.01, name="frame")
    bx(dw + 0.2, 0.1, 0.14, (0, dh + 0.05, 0.05), trim, bevel=0.01, name="frame-top")
    bx(2.6, 0.14, 1.3, (0, 0.07, 0.6), "#d8d4cb" if villa else "#a98258", bevel=0.02, name="porch")
    for s in (-1, 1):
        x = s * 1.9
        bx(1.0, 0.95, 0.1, (x, 1.55, 0.02), trim, bevel=0.01, name="window-frame")
        bx(0.82, 0.77, 0.02, (x, 1.55, 0.075), "#ffe3b0", bevel=0.0, name="window-glass")
        bx(1.0, 0.18, 0.22, (x, 0.95, 0.18), "#a98258", bevel=0.02, name="window-box")
        for i, c in enumerate([PINK, YELLOW, WHITE, "#c58bd9"]):
            el(0.07, 0.07, 0.07, (x - 0.36 + i * 0.24, 1.1, 0.2), c, name="flower")
    bx(0.16, 0.26, 0.04, (1.05, 1.15, 0.05), METAL, bevel=0.01, name="bell-plate")
    cy(0.035, 0.03, (1.05, 1.15, 0.085), BRASS, rot=(math.pi / 2, 0, 0), name="bell")
    cy(0.07, 0.2, (-1.05, 1.9, 0.12), METAL, name="sconce")
    glow_el(0.08, (-1.05, 2.05, 0.12), "#ffd9a0", 4, name="sconce-light")
    # mailbox
    bx(0.1, 0.9, 0.1, (2.6, 0.45, 3.0), WOOD_D, bevel=0.005, name="post")
    bx(0.5, 0.3, 0.32, (2.6, 1.0, 3.0), RED, bevel=0.06, name="mailbox")
    bx(0.04, 0.22, 0.04, (2.88, 1.1, 3.0), YELLOW, bevel=0.005, name="flag")
    # garden
    for i in range(7):
        bx(0.9, 0.06, 0.55, (((i % 2) - 0.5) * 0.25, 0.05, 1.6 + i * 0.85), "#d8d2c4" if i % 2 else "#e6e0d2",
           bevel=0.02, rot=(0, ((i % 3) - 1) * 0.08, 0), name="stone")
    for x, z, s in [(-4.2, 1.2, 1.1), (4.4, -0.5, 1.0), (-3.2, -3.6, 1.3), (3.6, -4.2, 1.2)]:
        cy(0.18 * s, 1.2 * s, (x, 0.6 * s, z), WOOD_D, name="trunk")
        el(0.95 * s, 0.95 * s, 0.95 * s, (x, 1.7 * s, z), "#5f9d6a", name="crown")
        el(0.7 * s, 0.7 * s, 0.7 * s, (x + 0.4 * s, 2.3 * s, z + 0.1 * s), LEAF2, name="crown")
    for x, z, s in [(-2.6, 0.5, 0.45), (2.7, 0.55, 0.5), (-2.2, 1.7, 0.35), (3.2, 1.6, 0.4)]:
        el(s, s * 0.8, s, (x, s * 0.7, z), LEAF, name="bush")


ITEMS = {
    # fixed furniture
    "desk": item_desk,
    "computer": item_computer,
    "diary": item_diary,
    "desk_lamp": item_desk_lamp,
    "chair": item_chair,
    "bookshelf": item_bookshelf,
    "answering_table": item_answering_table,
    "answering_machine": item_answering_machine,
    "phone": item_phone,
    "pet_bed": item_pet_bed,
    "rug": item_rug,
    # decor
    "floor_lamp": item_floor_lamp,
    "plant": item_plant,
    "cactus": item_cactus,
    "armchair": item_armchair,
    "stool": item_stool,
    "basket": item_basket,
    "mini_bookcase": item_mini_bookcase,
    # keepsakes
    "keepsake_shell": item_keepsake_shell,
    "keepsake_candle": item_keepsake_candle,
    "keepsake_book": item_keepsake_book,
    "keepsake_flower_vase": item_keepsake_flower_vase,
    "keepsake_cassette": item_keepsake_cassette,
    "keepsake_postcard": item_keepsake_postcard,
    "keepsake_photo_frame": item_keepsake_photo_frame,
    "keepsake_ticket": item_keepsake_ticket,
    # character
    "pet_ghost": item_pet_ghost,
    # house
    "cabin_room_shell": lambda: item_room_shell(False),
    "villa_room_shell": lambda: item_room_shell(True),
    "house_door": item_house_door,
    "cabin_exterior": lambda: item_exterior(False),
    "villa_exterior": lambda: item_exterior(True),
}

def main(argv):
    names = argv or list(ITEMS)
    glb_dir = os.path.join(OUT, "glb")
    rend_dir = os.path.join(OUT, "renders")
    os.makedirs(glb_dir, exist_ok=True)
    os.makedirs(rend_dir, exist_ok=True)
    manifest = []
    for n in names:
        clear_scene()
        try:
            ITEMS[n]()
            info = export_item(n, glb_dir, rend_dir, three_quarter=True)
            info["ok"] = True
            print(f"OK   {n}: {info['triangles']} tris, {info['parts']} parts")
        except Exception as e:  # keep going; report what failed
            info = {"name": n, "ok": False, "error": str(e)[:300]}
            print(f"FAIL {n}: {e}")
        manifest.append(info)
    import json

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    main(argv)
