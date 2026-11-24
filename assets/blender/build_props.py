"""
Blender models for the Little Internet room: furniture, props, keepsakes, the pet, and the house.

Run inside a Blender Python environment (the `bpy` pip package works; see assets/blender/README.md):

    python assets/blender/build_props.py                 # every item + the assembled scenes
    python assets/blender/build_props.py desk lamp       # chosen items
    python assets/blender/build_props.py --scenes        # only the assembled room / exterior renders
    python assets/blender/build_props.py --only furniture  # one category

Output (REVIEW_OUT, default assets/review):
    glb/<name>.glb       model, metres, glTF Y-up, origin at the bottom centre
    renders/<name>.png   Cycles preview (CPU), 3/4 view on a neutral ground
    scenes/<name>.png    assembled room / exterior, day and night
    manifest.json        category, triangles, parts, file size, budget verdict

Conventions (the web app depends on them):
    * 1 unit = 1 m. Room floor spans x 0..6, z 0..6. x right, y up, z toward the viewer.
    * Hotspot anchors are empties named hs_<thing>. The computer screen material is named `screen`.
      Lit things (bulbs, flames, LEDs, windows) use materials named `emissive_<what>`.
    * Room walls are four separate objects (wall_back/left/front/right) with real openings, so the
      app can fade the ones that face the camera. The door leaf hangs from an empty `door_pivot`.
"""

import json
import math
import os
import random
import sys

import bpy  # must come before bmesh: bmesh is provided by the bpy package
import bmesh
from mathutils import Euler, Vector

OUT = os.environ.get("REVIEW_OUT", "/projects/sandbox/little-internet/assets/review")
ITEM_RES = int(os.environ.get("ITEM_RES", "560"))
ITEM_SAMPLES = int(os.environ.get("ITEM_SAMPLES", "24"))
SCENE_RES = int(os.environ.get("SCENE_RES", "1000"))
SCENE_SAMPLES = int(os.environ.get("SCENE_SAMPLES", "48"))

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
SILVER = "#c9ced4"
PINK = "#f08ab0"
YELLOW = "#f7c948"
WHITE = "#ffffff"
LEAF = "#5aa06a"
LEAF2 = "#74b27d"
TERRA = "#d98a6c"
SOIL = "#4b3626"
GLASS = "#9ec6d8"
PAPER = "#f6efdc"

# ---------------------------------------------------------------- materials


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgb(hexc):
    return tuple(_lin(int(hexc[i : i + 2], 16) / 255) for i in (1, 3, 5))


_mats = {}


def M(hexc, rough=0.75, metal=0.0, emit=None, strength=0.0, name=None):
    key = (hexc, rough, metal, emit, strength, name)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name=name or f"c{hexc[1:]}")
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


def GLOW(hexc, strength, role="light"):
    return M(hexc, rough=0.4, emit=hexc, strength=strength, name=f"emissive_{role}")


def SCREEN(hexc="#2d5c8c"):
    return M(hexc, rough=0.25, emit=hexc, strength=0.6, name="screen")


# ---------------------------------------------------------------- geometry helpers


def P(x, y, z):
    """App coordinates (y up, z toward viewer) to Blender coordinates (z up)."""
    return (x, -z, y)


def make_torus(bm, R, r, nu=36, nv=12):
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
    """Gable roof: triangle in the x/z plane, extruded along blender y (= app z)."""
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


def make_star(bm, R, r, depth, points=5):
    """Flat star (a sticker): lies in the blender x/y plane, `depth` thick along z."""
    outline = []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        rad = R if i % 2 == 0 else r
        outline.append((math.cos(a) * rad, math.sin(a) * rad))
    top = [bm.verts.new((x, y, depth / 2)) for x, y in outline]
    bot = [bm.verts.new((x, y, -depth / 2)) for x, y in outline]
    ctr_t = bm.verts.new((0, 0, depth / 2))
    ctr_b = bm.verts.new((0, 0, -depth / 2))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ctr_t, top[i], top[j]))
        bm.faces.new((ctr_b, bot[j], bot[i]))
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def make_ghost(bm, R=0.3, dome_z=0.38, hem_z=0.04, wave=0.05, seg=32):
    """A ghost: a dome on straight sides with a scalloped hem, closed underneath. Blender z is up."""
    rings = []
    for i in range(9):  # dome, top to the equator
        phi = (math.pi / 2) * i / 8
        rings.append((R * math.sin(phi), dome_z + R * math.cos(phi), 0.0))
    for z in (0.28, 0.18, 0.1):
        rings.append((R, z, 0.0))
    rings.append((R, hem_z, wave))  # the hem ring is displaced by the wave below
    verts = []
    for ri, (rad, z, w) in enumerate(rings):
        row = []
        for k in range(seg):
            a = math.tau * k / seg
            zz = z + (w * (0.5 + 0.5 * math.cos(a * 3)) if w else 0.0)
            row.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), zz)) if rad > 1e-6 else (bm.verts.new((0, 0, zz)) if k == 0 else row[0]))
        verts.append(row)
    for ri in range(len(rings) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            a, b, c, d = verts[ri][k], verts[ri][k2], verts[ri + 1][k2], verts[ri + 1][k]
            quad = []
            for v in (a, b, c, d):
                if v not in quad:
                    quad.append(v)
            if len(quad) >= 3:
                bm.faces.new(quad)
    centre = bm.verts.new((0, 0, hem_z + wave * 0.5))
    last = verts[-1]
    for k in range(seg):
        bm.faces.new((last[(k + 1) % seg], last[k], centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def _apply_modifiers(ob):
    for m in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=m.name)


def part(kind, dims, at, mat, rot=(0, 0, 0), bevel=0.0, smooth=False, name="part"):
    """One mesh piece. `rot` is an XYZ Euler in Blender axes (rot[2] is the yaw around app y)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if kind == "box":
        w, h, d = dims
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    elif kind in ("cyl", "cone"):
        r1, r2, h = dims[0], dims[1], dims[2]
        cap = dims[3] if len(dims) > 3 else True
        segs = dims[4] if len(dims) > 4 else 24
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        smooth = True
    elif kind == "ellipsoid":
        sx, sy, sz = dims
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
        smooth = True
    elif kind == "sphere_hi":
        sx, sy, sz = dims
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
        smooth = True
    elif kind == "torus":
        make_torus(bm, dims[0], dims[1], dims[2] if len(dims) > 2 else 24, dims[3] if len(dims) > 3 else 8)
        smooth = True
    elif kind == "prism":
        make_prism(bm, *dims)
    elif kind == "star":
        make_star(bm, *dims)
    elif kind == "ghost":
        make_ghost(bm)
        smooth = True
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
        _apply_modifiers(ob)
    return ob


def bx(w, h, d, at, col, rough=0.7, bevel=0.012, rot=(0, 0, 0), name="box", mat=None):
    return part("box", (w, h, d), at, mat or M(col, rough), rot, bevel, name=name)


def cy(r, h, at, col, rough=0.7, rot=(0, 0, 0), cap=True, name="cyl", mat=None, seg=24):
    return part("cyl", (r, r, h, cap, seg), at, mat or M(col, rough), rot, name=name)


def co(r1, r2, h, at, col, rough=0.7, cap=True, rot=(0, 0, 0), name="cone", mat=None):
    return part("cone", (r1, r2, h, cap), at, mat or M(col, rough), rot, name=name)


def el(sx, sy, sz, at, col, rough=0.6, rot=(0, 0, 0), name="ellipsoid", mat=None):
    return part("ellipsoid", (sx, sy, sz), at, mat or M(col, rough), rot, name=name)


def to(R, r, at, col, rot=(0, 0, 0), name="torus", mat=None, res=(24, 8)):
    return part("torus", (R, r, res[0], res[1]), at, mat or M(col, 0.7), rot, name=name)


def glow_el(r, at, col, strength, role="light", name="glow"):
    return part("ellipsoid", (r, r, r), at, GLOW(col, strength, role), name=name)


def anchor(name, at, size=0.06):
    e = bpy.data.objects.new(f"hs_{name}", None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = size
    bpy.context.collection.objects.link(e)
    e.location = P(*at)
    return e


def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    out.select_set(False)
    return out


def made(fn):
    """Run fn and return the objects it created."""
    before = set(bpy.data.objects)
    fn()
    return [o for o in bpy.data.objects if o not in before]


def placed(fn, at=(0, 0, 0), yaw=0.0):
    """Build an item and move/yaw it into a scene (app coordinates)."""
    new = made(fn)
    ax, ay, az = P(*at)
    c, s = math.cos(yaw), math.sin(yaw)
    for o in new:
        if o.parent:
            continue
        x, y, z = o.location
        o.location = (c * x - s * y + ax, s * x + c * y + ay, z + az)
        o.rotation_euler.z += yaw
    return new


def squash(ob, sx=1.0, sy=1.0, sz=1.0):
    ob.scale = (sx, sz, sy)  # app axes -> blender axes
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


# ---------------------------------------------------------------- scene management


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials, bpy.data.actions):
        for x in list(coll):
            if x.users == 0:
                coll.remove(x)
    _mats.clear()


def scene_bounds(skip=("ground",)):
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.split(".")[0] in skip or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    center = Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
    size = max(hi[i] - lo[i] for i in range(3))
    return center, size, lo[2]


def _obj(name, data):
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    return o


def add_ground(center, size, floor_z, col="#d6cbb6"):
    g = bpy.data.meshes.new("ground")
    gb = bmesh.new()
    bmesh.ops.create_grid(gb, x_segments=1, y_segments=1, size=size * 60)
    gb.to_mesh(g)
    gb.free()
    go = _obj("ground", g)
    go.location = (center.x, center.y, floor_z - 0.001)
    go.data.materials.append(M(col, 1.0, name="ground"))


def add_camera(loc, target, lens):
    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = lens
    cam = _obj("cam", cam_d)
    cam.location = loc
    tgt = _obj("target", None)
    tgt.location = target
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    bpy.context.scene.camera = cam


def add_sun(energy, euler_deg, color=(1, 1, 1), angle=4):
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = energy
    sun.angle = math.radians(angle)
    sun.color = color
    so = _obj("sun", sun)
    so.rotation_euler = tuple(math.radians(a) for a in euler_deg)
    return so


def add_area(energy, loc, euler_deg, size, color=(1, 1, 1)):
    a = bpy.data.lights.new("fill", "AREA")
    a.energy = energy
    a.size = size
    a.color = color
    ao = _obj("fill", a)
    ao.location = loc
    ao.rotation_euler = tuple(math.radians(v) for v in euler_deg)
    return ao


def add_point(energy, at, color=(1, 0.8, 0.55), radius=0.05):
    p = bpy.data.lights.new("lamp", "POINT")
    p.energy = energy
    p.color = color
    p.shadow_soft_size = radius
    po = _obj("lamp", p)
    po.location = P(*at)
    return po


def set_world(color, strength):
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1.0)
    bg.inputs["Strength"].default_value = strength


def setup_render(res, samples, jpeg=False):
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
    scene.render.image_settings.file_format = "JPEG" if jpeg else "PNG"
    if jpeg:
        scene.render.image_settings.quality = 90


def triangles():
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.split(".")[0] in ("ground",):
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        total += sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
    return total


HELPER_NAMES = ("ground", "target", "cam", "sun", "fill", "lamp")


def export_glb(path, animations=False):
    for o in list(bpy.context.scene.objects):
        if o.name.split(".")[0] in HELPER_NAMES:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    objs = [o for o in bpy.context.scene.objects if not o.hide_render]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    if animations:
        kw.update(export_animations=True, export_animation_mode="NLA_TRACKS")
    else:
        kw.update(export_animations=False)
    bpy.ops.export_scene.gltf(**kw)


# ================================================================ furniture (V1: 6)


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
    anchor("desk", (0, H, 0))


def item_office_chair():
    bx(0.5, 0.08, 0.5, (0, 0.5, 0), GREEN, bevel=0.03, name="seat")
    bx(0.5, 0.5, 0.07, (0, 0.8, 0.22), GREEN, bevel=0.03, name="back")
    cy(0.03, 0.3, (0, 0.3, 0), METAL, name="column")
    for i in range(5):
        a = i * math.tau / 5
        bx(0.3, 0.03, 0.04, (math.cos(a) * 0.15, 0.1, math.sin(a) * 0.15), METAL, bevel=0.005, rot=(0, 0, -a), name="foot")
        cy(0.025, 0.04, (math.cos(a) * 0.3, 0.04, math.sin(a) * 0.3), INK, name="wheel")


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
            w = random.uniform(0.04, 0.07)
            h = random.uniform(0.2, 0.3)
            if random.random() > 0.12:
                bx(w, h, 0.24, (x + w / 2, top + h / 2, D / 2), random.choice(palette), bevel=0.0, name="book")
            x += w + 0.004
    bx(0.6, 0.5, 0.36, (-0.4, 2.525 + 0.25, 0.28), "#c9a36d", bevel=0.03, name="wicker")
    co(0.1, 0.08, 0.14, (0.5, 2.525 + 0.07, 0.26), RED, name="pot")
    for i in range(5):
        a = i * 1.25
        el(0.05, 0.2, 0.03, (0.5 + math.cos(a) * 0.09, 2.525 + 0.3, 0.26 + math.sin(a) * 0.09), LEAF, name="leaf")
    anchor("shelf", (0, 2.85, 0.3))


def item_dresser():
    """Low chest of drawers (fits under the window)."""
    bx(1.0, 0.66, 0.45, (0, 0.43, 0), WOOD, bevel=0.015, name="body")
    bx(1.06, 0.04, 0.49, (0, 0.78, 0), WOOD_L, bevel=0.012, name="top")
    for x in (-0.44, 0.44):
        for z in (-0.18, 0.18):
            co(0.03, 0.022, 0.1, (x, 0.05, z), WOOD_D, name="leg")
    for i, y in enumerate((0.24, 0.46, 0.66)):
        bx(0.9, 0.19, 0.02, (0, y - 0.0, 0.23), WOOD_L, bevel=0.006, name="drawer-front")
        el(0.025, 0.025, 0.02, (-0.12, y, 0.255), BRASS, name="knob")
        el(0.025, 0.025, 0.02, (0.12, y, 0.255), BRASS, name="knob")


def item_side_table():
    bx(0.8, 0.05, 0.8, (0, 0.62, 0), WOOD_L, bevel=0.01, name="top")
    for sx in (-1, 1):
        for sz in (-1, 1):
            cy(0.03, 0.6, (sx * 0.34, 0.3, sz * 0.34), WOOD_D, name="leg")


def item_coffee_table():
    cy(0.42, 0.04, (0, 0.42, 0), WOOD_L, name="top")
    to(0.4, 0.015, (0, 0.4, 0), WOOD_D, name="rim")
    for a in (0.3, 2.4, 4.5):
        cy(0.025, 0.42, (math.cos(a) * 0.3, 0.21, math.sin(a) * 0.3), WOOD_D, name="leg")
    cy(0.3, 0.02, (0, 0.14, 0), WOOD, name="lower-shelf")


# ================================================================ functional props (V1: 22)


def item_computer():
    bx(0.3, 0.02, 0.26, (0, 0.01, 0.02), CREAM2, name="stand")
    bx(0.5, 0.42, 0.4, (0, 0.23, -0.02), CREAM2, name="body")
    bx(0.44, 0.34, 0.04, (0, 0.23, 0.18), CREAM2, name="bezel")
    bx(0.34, 0.26, 0.012, (0, 0.23, 0.205), "#2d5c8c", bevel=0.0, name="screen", mat=SCREEN())
    el(0.012, 0.012, 0.012, (0.17, 0.05, 0.2), "#7cf08a", name="led", mat=GLOW("#7cf08a", 3, "led"))
    el(0.1, 0.02, 0.012, (-0.12, 0.05, 0.2), CREAM2, name="floppy-slot")
    anchor("computer", (0, 0.5, 0.05))


def item_keyboard_mouse():
    bx(0.44, 0.025, 0.15, (0, 0.0125, 0), CREAM2, bevel=0.008, name="board")
    for r in range(4):
        for c in range(12):
            bx(0.03, 0.01, 0.026, (-0.2 + c * 0.0365, 0.03, -0.05 + r * 0.033), "#9a927f" if (r + c) % 5 else BRASS, bevel=0.0, name="key")
    el(0.032, 0.018, 0.048, (0.34, 0.015, 0.0), CREAM2, name="mouse")
    bx(0.002, 0.004, 0.05, (0.34, 0.032, -0.02), INK, bevel=0.0, name="mouse-split")
    cy(0.004, 0.18, (0.34, 0.01, -0.12), INK, rot=(math.pi / 2, 0, 0), name="mouse-cable")


def item_diary():
    bx(0.5, 0.045, 0.37, (0, 0.0225, 0), RED, bevel=0.01, name="cover")
    bx(0.46, 0.03, 0.33, (0.012, 0.06, 0), PAPER, bevel=0.004, name="pages")
    bx(0.04, 0.052, 0.375, (0.2, 0.026, 0), BRASS, bevel=0.004, name="band")
    bx(0.012, 0.004, 0.14, (-0.05, 0.052, 0.25), BRASS, bevel=0.0, name="ribbon")
    cy(0.01, 0.22, (0.1, 0.075, 0.12), INK, rot=(0, math.pi / 2, 0), name="pen")
    anchor("diary", (0, 0.14, 0))


def item_typewriter():
    c = "#8fb09a"
    bx(0.38, 0.1, 0.3, (0, 0.08, 0), c, bevel=0.025, name="body")
    bx(0.36, 0.03, 0.12, (0, 0.025, 0.12), c, bevel=0.01, name="front-rise")
    bx(0.3, 0.07, 0.08, (0, 0.17, -0.1), c, bevel=0.015, name="back-block")
    cy(0.022, 0.4, (0, 0.2, -0.1), INK, rot=(0, math.pi / 2, 0), name="platen")
    for s in (-1, 1):
        el(0.03, 0.03, 0.03, (s * 0.21, 0.2, -0.1), SILVER, name="knob")
    bx(0.26, 0.2, 0.004, (0, 0.28, -0.13), PAPER, bevel=0.0, rot=(-0.12, 0, 0), name="paper")
    for r in range(3):
        for k in range(8 - r):
            cy(0.013, 0.014, (-0.13 + k * 0.034 + r * 0.017, 0.14 + r * 0.01, 0.0 + r * 0.045), CREAM, name="key", seg=10)
    bx(0.3, 0.015, 0.025, (0, 0.11, 0.16), SILVER, bevel=0.003, name="space-bar")


def item_pen_cup():
    cy(0.045, 0.1, (0, 0.05, 0), TEAL, name="cup")
    cy(0.035, 0.005, (0, 0.1, 0), "#1f2a30", name="inside")
    for i, (col, tilt) in enumerate([(INK, 0.25), (RED, -0.2), (YELLOW, 0.05), ("#5f8fb3", -0.35)]):
        a = i * 1.7
        cy(0.007, 0.16, (math.cos(a) * 0.012, 0.14, math.sin(a) * 0.012), col, rot=(tilt * math.sin(a), tilt * math.cos(a), 0), name="pen")


def item_record_player():
    """留声机: a record player with a tone arm and a record."""
    bx(0.44, 0.07, 0.36, (0, 0.035, 0), WOOD, bevel=0.02, name="plinth")
    cy(0.16, 0.025, (-0.04, 0.0825, 0), METAL, name="platter")
    cy(0.15, 0.006, (-0.04, 0.097, 0), "#15181c", rough=0.3, name="record")
    cy(0.05, 0.007, (-0.04, 0.101, 0), RED, name="label")
    cy(0.008, 0.012, (-0.04, 0.106, 0), SILVER, name="spindle")
    cy(0.03, 0.06, (0.17, 0.1, -0.12), SILVER, name="arm-base")
    bx(0.01, 0.01, 0.2, (0.13, 0.13, -0.03), SILVER, bevel=0.002, rot=(0, 0, -0.35), name="tone-arm")
    bx(0.04, 0.012, 0.025, (0.07, 0.125, 0.07), INK, bevel=0.003, name="head-shell")
    el(0.012, 0.012, 0.012, (0.19, 0.08, 0.12), RED, name="start-knob")
    anchor("record_player", (0, 0.14, 0))


def item_microphone():
    cy(0.07, 0.015, (0, 0.0075, 0), METAL, name="base")
    cy(0.012, 0.28, (0, 0.15, 0), SILVER, mat=M(SILVER, 0.25, 1.0), name="stem")
    cy(0.02, 0.02, (0, 0.3, 0), METAL, name="clamp")
    capsule = el(0.045, 0.075, 0.045, (0, 0.37, 0), SILVER, name="capsule", mat=M("#aab0b6", 0.35, 1.0))
    for y in (0.34, 0.37, 0.4):
        to(0.046, 0.004, (0, y, 0), METAL, name="grille-ring", res=(20, 5))
    del capsule


def item_rotary_phone():
    bx(0.24, 0.07, 0.2, (0, 0.035, 0), RED, bevel=0.03, name="base")
    cy(0.065, 0.02, (0, 0.082, 0.02), CREAM, name="dial-plate")
    for i in range(10):
        a = -0.6 + i * 0.52
        cy(0.008, 0.022, (math.cos(a) * 0.048, 0.085, 0.02 + math.sin(a) * 0.048), INK, name="finger-hole", seg=10)
    cy(0.012, 0.022, (0, 0.092, 0.02), SILVER, name="centre")
    for s in (-1, 1):
        bx(0.025, 0.04, 0.03, (s * 0.1, 0.095, -0.05), SILVER, bevel=0.005, name="cradle")
    bx(0.26, 0.03, 0.05, (0, 0.13, -0.05), RED, bevel=0.012, name="handset")
    for s in (-1, 1):
        el(0.04, 0.03, 0.03, (s * 0.12, 0.125, -0.05), RED, name="handset-end")


def item_answering_machine():
    bx(0.42, 0.12, 0.3, (0, 0.06, 0), CREAM2, bevel=0.02, name="body")
    bx(0.26, 0.012, 0.18, (-0.04, 0.125, -0.02), INK, bevel=0.0, name="deck")
    for x in (-0.1, 0.02):
        cy(0.035, 0.012, (x, 0.132, -0.02), "#eae6da", name="reel")
    glow_el(0.018, (0.16, 0.125, 0.09), "#ff3a3a", 3, "led", name="led")
    for i in range(3):
        bx(0.045, 0.02, 0.03, (-0.12 + i * 0.07, 0.12, 0.11), RED if i == 0 else "#6c7a86", bevel=0.006, name="button")
    anchor("voice", (0, 0.2, 0))


def item_polaroid_camera():
    bx(0.15, 0.1, 0.1, (0, 0.08, 0), CREAM, bevel=0.02, name="body")
    bx(0.15, 0.045, 0.1, (0, 0.04, 0), "#3a3a3a", bevel=0.015, name="lower")
    cy(0.036, 0.03, (0.01, 0.085, 0.065), INK, rot=(math.pi / 2, 0, 0), name="lens-barrel")
    cy(0.024, 0.006, (0.01, 0.085, 0.082), "#3b5a78", rough=0.1, name="glass")
    bx(0.04, 0.025, 0.02, (-0.05, 0.14, 0.03), CREAM2, bevel=0.005, name="flash")
    el(0.012, 0.012, 0.012, (0.055, 0.13, 0.05), RED, name="shutter")
    for i, col in enumerate([RED, YELLOW, "#7aa57a", "#5f8fb3"]):
        bx(0.15, 0.008, 0.002, (0, 0.062 + i * 0.01, 0.0505), col, bevel=0.0, name="stripe")
    bx(0.09, 0.07, 0.006, (0.0, 0.1, -0.046), PAPER, bevel=0.0, rot=(0.3, 0, 0), name="photo")


def item_photo_wall():
    """Clothesline with six clipped polaroids. Hangs on a wall facing +z; origin at the wall surface."""
    cy(0.004, 1.5, (0, 0.0, 0.02), "#8a6d4a", rot=(0, math.pi / 2, 0), name="string")
    for x in (-0.75, 0.75):
        cy(0.012, 0.03, (x, 0.0, 0.012), BRASS, rot=(math.pi / 2, 0, 0), name="nail")
    cols = ["#8fb8c9", "#e8b4a0", "#9fc79b", "#f0d28a", "#b5a1d0", "#8fb8c9"]
    for i in range(6):
        x = -0.62 + i * 0.25
        tilt = (-1) ** i * 0.06
        bx(0.2, 0.24, 0.006, (x, -0.13, 0.02), WHITE, bevel=0.002, rot=(0, 0, tilt), name="polaroid")
        bx(0.17, 0.165, 0.004, (x, -0.1, 0.025), cols[i], bevel=0.0, rot=(0, 0, tilt), name="picture")
        bx(0.025, 0.05, 0.012, (x, -0.005, 0.03), WOOD_L, bevel=0.003, name="clip")
    anchor("photo_wall", (0, -0.12, 0.1))


def item_photo_album_open():
    """An open spiral photo album, lying flat."""
    bx(0.3, 0.012, 0.4, (-0.155, 0.006, 0), "#a1693b", bevel=0.005, name="cover-left")
    bx(0.3, 0.012, 0.4, (0.155, 0.006, 0), "#a1693b", bevel=0.005, name="cover-right")
    bx(0.28, 0.012, 0.38, (-0.15, 0.018, 0), PAPER, bevel=0.003, name="page-left")
    bx(0.28, 0.012, 0.38, (0.15, 0.018, 0), PAPER, bevel=0.003, name="page-right")
    cols = ["#8fb8c9", "#e8b4a0", "#9fc79b", "#f0d28a"]
    for i, (x, z) in enumerate([(-0.22, -0.1), (-0.1, 0.08), (0.1, -0.08), (0.21, 0.1)]):
        bx(0.1, 0.002, 0.12, (x, 0.026, z), cols[i], bevel=0.0, rot=(0, 0, (-1) ** i * 0.1), name="photo")
    for i in range(7):
        to(0.018, 0.004, (0, 0.02, -0.17 + i * 0.057), SILVER, rot=(0, math.pi / 2, 0), name="ring", res=(12, 5))
    el(0.05, 0.004, 0.035, (0.19, 0.03, 0.15), YELLOW, name="sticker-star")


def item_books_row():
    random.seed(11)
    palette = ["#c95f4a", "#e3b34f", "#5f8fb3", "#7aa57a", "#8d6bb0", "#d98a6c", "#f0e6d2"]
    x = -0.18
    for i in range(7):
        w = random.uniform(0.035, 0.06)
        h = random.uniform(0.2, 0.3)
        x += w / 2
        bx(w, h, 0.2, (x, h / 2, 0), palette[i], bevel=0.004, name="book")
        x += w / 2 + 0.003
    bx(0.04, 0.22, 0.2, (x + 0.07, 0.14, 0), "#2c3640", bevel=0.004, rot=(0, 0, 0.35), name="leaning-book")
    bx(0.02, 0.18, 0.14, (x + 0.11, 0.09, 0), METAL, bevel=0.003, name="bookend")


def item_books_stack():
    cols = ["#5f8fb3", "#e3b34f", RED, "#7aa57a"]
    y = 0.0
    for i, c in enumerate(cols):
        h = 0.04 + (i % 2) * 0.012
        y += h / 2
        bx(0.22 - i * 0.012, h, 0.16, (0.005 * i, y, 0.0), c, bevel=0.005, rot=(0, 0, (i - 1.5) * 0.12), name="book")
        bx(0.2 - i * 0.012, h - 0.012, 0.15, (0.005 * i, y, 0.003), PAPER, bevel=0.002, rot=(0, 0, (i - 1.5) * 0.12), name="pages")
        y += h / 2


def item_cd_disc():
    """A CD standing on a jewel case. Used for the 'take your website with you' hotspot."""
    bx(0.142, 0.125, 0.01, (0, 0.0625, 0), "#e9eef2", rough=0.2, bevel=0.003, name="case")
    bx(0.12, 0.118, 0.002, (0, 0.0625, 0.006), "#5f8fb3", bevel=0.0, name="booklet")
    disc = cy(0.06, 0.003, (0.0, 0.07, 0.03), SILVER, rot=(math.pi / 2, 0, 0), name="disc", mat=M("#d4d9de", 0.2, 1.0))
    cy(0.02, 0.004, (0.0, 0.07, 0.03), "#22262b", rot=(math.pi / 2, 0, 0), name="hole-ring")
    cy(0.045, 0.0032, (0.0, 0.07, 0.03), "#9ec6d8", rot=(math.pi / 2, 0, 0), name="rainbow-band", mat=M("#b9a0e0", 0.15, 0.6))
    del disc
    anchor("export", (0, 0.12, 0.03))


def item_desk_lamp():
    cy(0.07, 0.03, (0, 0.015, 0), METAL, name="base")
    cy(0.012, 0.36, (0, 0.2, 0), METAL, name="arm", rot=(0, 0.35, 0))
    co(0.11, 0.04, 0.14, (-0.12, 0.38, 0), "#e8b04a", cap=False, rot=(0, 0.5, 0), name="shade")
    glow_el(0.03, (-0.11, 0.36, 0), "#ffe2a8", 6, "bulb", name="bulb")


def item_mailbox():
    bx(0.1, 0.9, 0.1, (0, 0.45, 0), WOOD_D, bevel=0.005, name="post")
    bx(0.5, 0.3, 0.32, (0, 1.0, 0), RED, bevel=0.06, name="box")
    bx(0.24, 0.002, 0.3, (0, 1.0, 0.0), INK, bevel=0.0, name="slot")
    bx(0.04, 0.22, 0.04, (0.28, 1.1, 0), YELLOW, bevel=0.005, name="flag")
    el(0.03, 0.03, 0.03, (-0.24, 1.0, 0.17), BRASS, name="catch")
    anchor("mailbox", (0, 1.25, 0))


def item_doorbell():
    bx(0.16, 0.26, 0.04, (0, 0.13, 0), METAL, bevel=0.01, name="plate")
    cy(0.035, 0.03, (0, 0.17, 0.035), BRASS, rot=(math.pi / 2, 0, 0), name="button")
    glow_el(0.012, (0, 0.17, 0.05), "#ffe08a", 4, "bell", name="button-light")
    bx(0.09, 0.05, 0.004, (0, 0.07, 0.022), PAPER, bevel=0.0, name="label")
    anchor("doorbell", (0, 0.17, 0.08))


def item_nameplate():
    bx(0.32, 0.11, 0.02, (0, 0, 0.01), WOOD_D, bevel=0.01, name="plaque")
    for i, w in enumerate((0.05, 0.035, 0.05, 0.04, 0.05)):
        bx(w, 0.035, 0.004, (-0.11 + i * 0.056, 0, 0.022), BRASS, bevel=0.0, name="letter")
    for s in (-1, 1):
        cy(0.008, 0.004, (s * 0.145, 0, 0.022), BRASS, rot=(math.pi / 2, 0, 0), name="screw")


def item_storage_box():
    bx(0.28, 0.12, 0.2, (0, 0.06, 0), "#8d6bb0", bevel=0.02, name="box")
    bx(0.25, 0.01, 0.17, (0, 0.118, 0), "#f0b4c8", bevel=0.0, name="velvet")
    bx(0.29, 0.05, 0.21, (0, 0.18, -0.07), "#8d6bb0", bevel=0.02, rot=(-1.2, 0, 0), name="lid")
    el(0.02, 0.02, 0.02, (0, 0.1, 0.105), BRASS, name="clasp")
    to(0.022, 0.004, (0.05, 0.13, 0.0), BRASS, rot=(1.2, 0, 0), name="ring")
    el(0.012, 0.012, 0.012, (0.05, 0.145, -0.014), "#8fd6ff", name="gem", mat=M("#8fd6ff", 0.1, 0.0))


def item_calendar():
    """Wall calendar. Facing +z, origin at the top-centre of the board on the wall."""
    bx(0.3, 0.38, 0.012, (0, -0.19, 0.006), WHITE, bevel=0.004, name="board")
    bx(0.3, 0.08, 0.014, (0, -0.04, 0.007), RED, bevel=0.003, name="header")
    for r in range(5):
        for c in range(7):
            bx(0.03, 0.03, 0.003, (-0.105 + c * 0.035, -0.1 - r * 0.045, 0.0135), CREAM if (r * 7 + c) % 9 else YELLOW, bevel=0.0, name="day")
    for s in (-1, 1):
        to(0.008, 0.002, (s * 0.06, 0.005, 0.01), SILVER, rot=(math.pi / 2, 0, 0), name="ring", res=(10, 5))


# ================================================================ ambient (V1: 12)


def item_lava_lamp():
    co(0.065, 0.04, 0.1, (0, 0.05, 0), BRASS, name="base")
    co(0.04, 0.055, 0.28, (0, 0.24, 0), "#e8505b", name="glass", mat=M("#e8505b", 0.2, emit="#e8505b", strength=0.8, name="emissive_lava"))
    for y, r in ((0.15, 0.03), (0.24, 0.025), (0.31, 0.02)):
        glow_el(r, (0.0, y, 0.0), "#ffb347", 3, "lava_blob", name="blob")
    co(0.015, 0.04, 0.06, (0, 0.41, 0), BRASS, name="cap")
    el(0.012, 0.012, 0.012, (0, 0.445, 0), BRASS, name="tip")


def item_mug():
    co(0.045, 0.04, 0.09, (0, 0.045, 0), CREAM, cap=False, name="cup")
    cy(0.04, 0.004, (0, 0.002, 0), CREAM, name="foot")
    cy(0.04, 0.003, (0, 0.078, 0), "#4b2e1e", rough=0.2, name="coffee")
    to(0.028, 0.007, (0.06, 0.045, 0), CREAM, rot=(math.pi / 2, 0, 0), name="handle")
    cy(0.06, 0.008, (0, -0.004, 0), "#f0d9bd", name="saucer")


def item_plant_small():
    co(0.04, 0.055, 0.1, (0, 0.05, 0), WHITE, name="pot")
    cy(0.047, 0.01, (0, 0.1, 0), SOIL, name="soil")
    for i in range(7):
        a = i * 0.9
        el(0.025, 0.09, 0.012, (math.cos(a) * 0.03, 0.18, math.sin(a) * 0.03), LEAF if i % 2 else LEAF2, rot=(math.sin(a) * 0.5, 0, -math.cos(a) * 0.5), name="leaf")


def item_wall_clock():
    """Round wall clock facing +z, origin at its centre on the wall."""
    to(0.13, 0.014, (0, 0, 0.02), WOOD_D, rot=(math.pi / 2, 0, 0), name="rim")
    cy(0.13, 0.014, (0, 0, 0.01), CREAM, rot=(math.pi / 2, 0, 0), name="face")
    for i in range(12):
        a = i * math.tau / 12
        bx(0.008, 0.026 if i % 3 == 0 else 0.016, 0.004, (math.sin(a) * 0.105, math.cos(a) * 0.105, 0.02), INK, bevel=0.0, rot=(0, 0, 0), name="tick")
    bx(0.01, 0.07, 0.005, (0.015, 0.025, 0.026), INK, bevel=0.0, rot=(0, 0, 1.0), name="hour-hand")
    bx(0.007, 0.1, 0.005, (-0.02, 0.04, 0.03), INK, bevel=0.0, rot=(0, 0, -0.4), name="minute-hand")
    cy(0.012, 0.008, (0, 0, 0.032), BRASS, rot=(math.pi / 2, 0, 0), name="centre-cap")


def item_radio():
    bx(0.3, 0.17, 0.12, (0, 0.085, 0), "#c9a36d", bevel=0.025, name="body")
    bx(0.17, 0.12, 0.004, (-0.05, 0.085, 0.062), "#2f2a28", bevel=0.0, name="grille-bg")
    for i in range(7):
        bx(0.15, 0.006, 0.005, (-0.05, 0.04 + i * 0.015, 0.066), BRASS, bevel=0.0, name="grille-slit")
    bx(0.07, 0.04, 0.004, (0.095, 0.12, 0.062), PAPER, bevel=0.0, name="dial-window")
    bx(0.002, 0.04, 0.005, (0.1, 0.12, 0.066), RED, bevel=0.0, name="dial-needle")
    for y in (0.07, 0.04):
        cy(0.016, 0.014, (0.095, y, 0.068), INK, rot=(math.pi / 2, 0, 0), name="knob")
    cy(0.003, 0.22, (0.1, 0.27, -0.03), SILVER, rot=(0.3, 0.5, 0), name="antenna", mat=M(SILVER, 0.3, 1.0))


def item_printer():
    bx(0.4, 0.14, 0.3, (0, 0.07, 0), "#d9d6cf", bevel=0.03, name="body")
    bx(0.3, 0.03, 0.1, (0, 0.15, 0.08), "#b9b5ac", bevel=0.01, name="top-cover")
    bx(0.28, 0.2, 0.004, (0, 0.24, -0.1), WHITE, bevel=0.0, rot=(-0.4, 0, 0), name="paper-in")
    bx(0.3, 0.012, 0.03, (0, 0.06, 0.155), "#22262b", bevel=0.0, name="paper-slot")
    bx(0.24, 0.004, 0.14, (0, 0.03, 0.22), WHITE, bevel=0.0, rot=(0.08, 0, 0), name="paper-out")
    for i, c in enumerate(("#7cf08a", RED)):
        glow_el(0.007, (0.14 - i * 0.03, 0.14, 0.15), c, 3, f"printer-led-{i}", name="led")


def item_cake():
    cy(0.13, 0.01, (0, 0.005, 0), WHITE, name="plate")
    cy(0.09, 0.07, (0, 0.045, 0), "#f4d6b0", name="sponge")
    cy(0.092, 0.012, (0, 0.062, 0), "#f0a0bd", name="cream-layer")
    cy(0.095, 0.014, (0, 0.087, 0), "#f9d1dc", name="frosting")
    to(0.085, 0.01, (0, 0.093, 0), "#f9d1dc", name="piping")
    for i in range(5):
        a = i * math.tau / 5
        el(0.013, 0.013, 0.013, (math.cos(a) * 0.06, 0.1, math.sin(a) * 0.06), "#d63a4a", name="berry")
    cy(0.004, 0.04, (0, 0.12, 0), BRASS, name="candle-stick")
    glow_el(0.01, (0, 0.15, 0), "#ffb347", 4, "flame", name="flame")


def item_stickers():
    """A sticker sheet with stars, a heart and sticky notes. Lies flat."""
    bx(0.3, 0.003, 0.22, (0, 0.0015, 0), WHITE, bevel=0.0, name="sheet")
    for i, (x, z, col) in enumerate([(-0.1, -0.05, YELLOW), (0.0, 0.05, PINK), (0.1, -0.04, "#7ac7a1")]):
        part("star", (0.04, 0.018, 0.004), (x, 0.005, z), M(col, 0.5), rot=(0, 0, i * 0.4), name="star")
    for s in (-1, 1):
        el(0.018, 0.003, 0.018, (-0.03 + s * 0.016, 0.005, 0.085), "#e8505b", name="heart-lobe")
    bx(0.03, 0.003, 0.03, (-0.03, 0.005, 0.085), "#e8505b", bevel=0.0, rot=(0, 0, math.pi / 4), name="heart-point")
    bx(0.07, 0.004, 0.06, (0.1, 0.006, 0.06), "#fff1a0", bevel=0.002, rot=(0, 0, 0.15), name="sticky-note")
    el(0.045, 0.003, 0.025, (-0.1, 0.005, 0.065), "#cfe8ff", name="bubble")


def item_floor_cushion():
    el(0.34, 0.09, 0.34, (0, 0.09, 0), "#e8b4b8", rough=0.9, name="cushion", mat=M("#e8b4b8", 0.9))
    cy(0.03, 0.02, (0, 0.17, 0), "#c98a95", name="button")


# ================================================================ decor the owner can place (7 kinds)


def item_floor_lamp():
    cy(0.18, 0.04, (0, 0.02, 0), METAL, name="base")
    cy(0.018, 1.45, (0, 0.75, 0), METAL, name="pole")
    co(0.24, 0.16, 0.3, (0, 1.55, 0), "#ffd9a0", cap=False, name="shade", mat=GLOW("#ffd9a0", 0.6, "lampshade"))
    glow_el(0.05, (0, 1.5, 0), "#ffd9a0", 4, "bulb", name="bulb")


def item_plant():
    co(0.15, 0.2, 0.3, (0, 0.15, 0), TERRA, name="pot")
    cy(0.19, 0.02, (0, 0.3, 0), SOIL, name="soil")
    greens = ["#4f9566", "#63ab74", "#3f8458"]
    for i in range(9):
        a = i / 9 * math.tau
        el(0.07, 0.22, 0.03, (math.cos(a) * 0.13, 0.62, math.sin(a) * 0.13), greens[i % 3], rot=(math.sin(a) * 0.5, 0, -a), name="leaf")
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
    to(0.28, 0.02, (0, 0.34, 0), "#b08a55", name="rim")


def item_mini_bookcase():
    """A small open bookcase (front toward +z). The Hunyuan3D version in the app is a separate asset."""
    W, H, D, t = 0.9, 0.9, 0.34, 0.04
    bx(t, H, D, (-W / 2 + t / 2, H / 2, 0), WOOD, bevel=0.008, name="side")
    bx(t, H, D, (W / 2 - t / 2, H / 2, 0), WOOD, bevel=0.008, name="side")
    bx(W, t, D, (0, H - t / 2, 0), WOOD_L, bevel=0.008, name="top")
    bx(W, t, D, (0, t / 2, 0), WOOD, bevel=0.008, name="bottom")
    bx(W - 2 * t, H - 2 * t, 0.02, (0, H / 2, -D / 2 + 0.01), "#8f6a47", bevel=0.0, name="back")
    for y in (0.31, 0.6):
        bx(W - 2 * t, t * 0.8, D - 0.04, (0, y, 0.0), WOOD_L, bevel=0.004, name="shelf")
    palette = ["#c95f4a", "#e3b34f", "#5f8fb3", "#7aa57a", "#8d6bb0"]
    for r, y0 in enumerate((t, 0.33, 0.62)):
        for i in range(5):
            h = 0.2 + ((i * 3 + r) % 3) * 0.02
            bx(0.07, h, 0.2, (-0.3 + i * 0.1 + r * 0.01, y0 + h / 2 + 0.005, 0.0), palette[(i + r) % 5], bevel=0.0, name="book")


# ================================================================ keepsakes the owner picks (8)


def item_keepsake_shell():
    """A scallop: a domed fan of ribs with a hinge, lying on its back."""
    el(0.115, 0.03, 0.1, (0, 0.02, 0.0), "#f2c4b4", rough=0.5, name="body")
    n = 7
    for i in range(n):
        a = (i - (n - 1) / 2) * 0.33  # fan angle
        length = 0.1
        cx, cz = math.sin(a) * length * 0.55, math.cos(a) * length * 0.55 - 0.02
        tone = "#f6d4c6" if i % 2 == 0 else "#eab3a2"
        bx(0.034, 0.03, length, (cx, 0.04 + 0.006 * (3 - abs(i - 3)), cz), tone, bevel=0.008, rot=(0, 0, -a), name="rib")
    bx(0.07, 0.03, 0.03, (0, 0.035, -0.085), "#e0a898", bevel=0.01, name="hinge")


def item_keepsake_candle():
    cy(0.07, 0.02, (0, 0.01, 0), BRASS, name="holder")
    cy(0.05, 0.14, (0, 0.09, 0), CREAM, name="wax")
    glow_el(0.022, (0, 0.18, 0), "#ffb347", 3, "flame", name="flame")


def item_keepsake_book():
    bx(0.2, 0.04, 0.15, (0, 0.02, 0), "#5f8fb3", bevel=0.005, name="book-1")
    bx(0.18, 0.035, 0.14, (0.01, 0.058, 0), "#e3b34f", bevel=0.005, rot=(0, 0, 0.3), name="book-2")
    bx(0.19, 0.03, 0.13, (-0.01, 0.09, 0), RED, bevel=0.005, rot=(0, 0, -0.15), name="book-3")


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
    for i in range(4):
        bx(0.05, 0.012, 0.004, (-0.08 + (i % 2) * 0.06, 0.03 - (i // 2) * 0.03, 0.01), "#7a4a12", bevel=0.0, name="text")


# ================================================================ the pet: a small ghost with 3 animation clips


GHOST_COLOR = "#f1f4f9"


def build_ghost(pose=None):
    """Returns a dict of the animated nodes. Parts are children of the empty `ghost`."""
    root = bpy.data.objects.new("ghost", None)
    bpy.context.collection.objects.link(root)
    body_mat = M(GHOST_COLOR, 0.45)
    parts = {}

    def child(ob, key):
        ob.parent = root
        parts[key] = ob
        return ob

    child(part("ghost", (0, 0, 0), (0, 0, 0), body_mat, name="body", smooth=True), "body")
    for s, k in ((-1, "eyeL"), (1, "eyeR")):
        child(el(0.036, 0.05, 0.03, (s * 0.1, 0.5, 0.272), INK, name="eye"), k)
    for s, k in ((-1, "cheekL"), (1, "cheekR")):
        child(el(0.03, 0.02, 0.012, (s * 0.18, 0.4, 0.232), "#ffa6b8", name="cheek"), k)
    child(anchor("pet", (0, 0.95, 0), 0.05), "anchor")
    parts["root"] = root
    return parts


_keyed = set()


def _key(ob, prop, frame, value):
    setattr(ob, prop, value)
    ob.keyframe_insert(prop, frame=frame)
    _keyed.add(ob.name)


def ghost_clips(parts):
    """Three clips: idle (float + blink), move (lean forward + bob), sleep (settle + eyes closed)."""
    root = parts["root"]
    base = {k: (tuple(o.location), tuple(o.scale), tuple(o.rotation_euler)) for k, o in parts.items()}

    def reset():
        for k, o in parts.items():
            o.location, o.scale, o.rotation_euler = base[k]

    def clip(name, length, build):
        reset()
        _keyed.clear()
        acts = {}
        for k, o in parts.items():
            o.animation_data_create()
            act = bpy.data.actions.new(f"{k}_{name}")
            o.animation_data.action = act
            acts[k] = act
        build(length)
        for k, o in parts.items():
            if o.name in _keyed:
                track = o.animation_data.nla_tracks.new()
                track.name = name
                track.strips.new(name, 1, acts[k])
            o.animation_data.action = None
        reset()

    def idle(n):
        for f, bob, sy in ((1, 0.0, 1.0), (n // 2, 0.04, 1.02), (n, 0.0, 1.0)):
            _key(root, "location", f, (base["root"][0][0], base["root"][0][1], base["root"][0][2] + bob))
            _key(root, "scale", f, (1.0, 1.0, sy))
        for k in ("eyeL", "eyeR"):
            o = parts[k]
            sc = base[k][1]
            for f, v in ((1, 1.0), (n - 14, 1.0), (n - 10, 0.08), (n - 6, 1.0), (n, 1.0)):
                _key(o, "scale", f, (sc[0], sc[1], sc[2] * v))

    def move(n):
        for f, bob in ((1, 0.0), (n // 4, 0.05), (n // 2, 0.0), (3 * n // 4, 0.05), (n, 0.0)):
            _key(root, "location", f, (base["root"][0][0], base["root"][0][1], base["root"][0][2] + bob))
            _key(root, "rotation_euler", f, (-0.22, 0.0, 0.05 * (1 if f < n // 2 else -1)))

    def sleep(n):
        # slow breathing; every channel really moves, so the exporter keeps it
        for f, sy, bob in ((1, 0.88, 0.0), (n // 2, 0.9, 0.006), (n, 0.88, 0.0)):
            _key(root, "scale", f, (1.08, 1.08, sy))
            loc = base["root"][0]
            _key(root, "location", f, (loc[0], loc[1], loc[2] + bob))
        for k in ("eyeL", "eyeR"):
            o = parts[k]
            sc = base[k][1]
            for f, w in ((1, 1.2), (n // 2, 1.26), (n, 1.2)):
                _key(o, "scale", f, (sc[0] * w, sc[1], sc[2] * 0.08))

    # The last track created sits on top at frame 1, so idle goes last: the exported rest pose is the neutral one.
    clip("sleep", 60, sleep)
    clip("move", 24, move)
    clip("idle", 48, idle)


def item_pet_ghost():
    parts = build_ghost()
    ghost_clips(parts)


def pet_pose_renders(glb_dir, rend_dir):
    """Preview stills of the three clips (the glb itself carries the real animation)."""
    out = []
    for pose in ("idle", "move", "sleep"):
        clear_scene()
        parts = build_ghost()
        root = parts["root"]
        if pose == "move":
            root.rotation_euler = (-0.22, 0, 0.05)
        if pose == "sleep":
            root.scale = (1.08, 1.08, 0.88)
            for k in ("eyeL", "eyeR"):
                parts[k].scale = (parts[k].scale[0] * 1.2, parts[k].scale[1], parts[k].scale[2] * 0.08)
        name = f"pet_ghost_{pose}"
        three_quarter(name, rend_dir, res=ITEM_RES, samples=ITEM_SAMPLES)
        out.append(name)
    return out


# ================================================================ the house


def _wall_boxes(segs, wall_col):
    objs = []
    for w, h, d, at in segs:
        objs.append(bx(w, h, d, at, wall_col, bevel=0.0, name="seg", rough=0.95))
    return objs


def room_shell(villa=False):
    wall = "#f1e3c8" if not villa else "#f3efe6"
    trim = WOOD_D if not villa else "#f6f3ec"
    slab = "#8c6a4b" if not villa else "#d8d4cb"
    floor_col = WOOD_L if not villa else "#e1dbcd"
    H, T = 3.1, 0.16
    bx(6.5, 0.4, 6.5, (3, -0.22, 3), slab, bevel=0.03, name="slab")
    bx(6.0, 0.02, 6.0, (3, -0.01, 3), floor_col, bevel=0.0, rough=0.6, name="floor")

    # back wall z = 0, window hole x 2.6..3.8, y 1.0..2.4 (the first segment also closes the corner)
    a0, a1, y0, y1 = 2.6, 3.8, 1.0, 2.4
    back = _wall_boxes(
        [
            (a0 + T, H, T, ((a0 - T) / 2, H / 2, -T / 2)),
            (6 - a1, H, T, ((a1 + 6) / 2, H / 2, -T / 2)),
            (a1 - a0, y0, T, ((a0 + a1) / 2, y0 / 2, -T / 2)),
            (a1 - a0, H - y1, T, ((a0 + a1) / 2, (y1 + H) / 2, -T / 2)),
        ],
        wall,
    )
    back.append(bx(6.16, 0.1, 0.24, (3 - 0.08, H + 0.03, -0.08), trim, bevel=0.02, name="cap"))
    back.append(bx(6.0, 0.14, 0.03, (3, 0.07, 0.015), trim, bevel=0.005, name="baseboard"))
    join(back, "wall_back")

    # left wall x = 0, door opening z 4.05..4.95 up to 2.15
    d0, d1, dh = 4.05, 4.95, 2.15
    left = []
    for z0, z1, zb, zt in ((0, d0, 0, H), (d1, 6, 0, H), (d0, d1, dh, H)):
        left.append(bx(T, zt - zb, z1 - z0, (-T / 2, (zb + zt) / 2, (z0 + z1) / 2), wall, bevel=0.0, name="seg", rough=0.95))
    left.append(bx(0.24, 0.1, 6.16, (-0.08, H + 0.03, 3), trim, bevel=0.02, name="cap"))
    left.append(bx(0.03, 0.14, 6.0, (0.015, 0.07, 3), trim, bevel=0.005, name="baseboard"))
    join(left, "wall_left")

    front = [
        bx(6.16, H, T, (3 + 0.08, H / 2, 6 + T / 2), wall, bevel=0.0, name="seg", rough=0.95),
        bx(6.16, 0.1, 0.24, (3 + 0.08, H + 0.03, 6.08), trim, bevel=0.02, name="cap"),
        bx(6.0, 0.14, 0.03, (3, 0.07, 5.985), trim, bevel=0.005, name="baseboard"),
    ]
    join(front, "wall_front")
    right = [
        bx(T, H, 6.0, (6 + T / 2, H / 2, 3), wall, bevel=0.0, name="seg", rough=0.95),
        bx(0.24, 0.1, 6.16, (6.08, H + 0.03, 3), trim, bevel=0.02, name="cap"),
        bx(0.03, 0.14, 6.0, (5.985, 0.07, 3), trim, bevel=0.005, name="baseboard"),
    ]
    join(right, "wall_right")

    # window: glass, frame, curtains / blind, sill
    wx, wy = (a0 + a1) / 2, (y0 + y1) / 2
    ww, wh = a1 - a0, y1 - y0
    bx(ww, wh, 0.01, (wx, wy, -0.07), "#cfe8ff", bevel=0.0, name="window_glass", mat=GLOW("#cfe8ff", 0.5, "window"))
    fr = [
        bx(ww + 0.14, 0.07, 0.1, (wx, y1 + 0.035, -0.05), trim, bevel=0.01, name="f"),
        bx(ww + 0.14, 0.07, 0.1, (wx, y0 - 0.035, -0.05), trim, bevel=0.01, name="f"),
        bx(0.07, wh, 0.1, (a0 - 0.035, wy, -0.05), trim, bevel=0.01, name="f"),
        bx(0.07, wh, 0.1, (a1 + 0.035, wy, -0.05), trim, bevel=0.01, name="f"),
        bx(0.04, wh, 0.06, (wx, wy, -0.08), trim, bevel=0.0, name="f"),
        bx(ww, 0.04, 0.06, (wx, wy, -0.08), trim, bevel=0.0, name="f"),
        bx(ww + 0.3, 0.05, 0.3, (wx, y0 + 0.01, 0.13), trim if villa else "#c9a36d", bevel=0.02, name="f"),
    ]
    join(fr, "window_frame")
    if not villa:
        cur = [bx(0.3, wh + 0.2, 0.07, (wx + s * (ww / 2 + 0.05), wy, 0.07), "#e3a88f", bevel=0.03, name="c") for s in (-1, 1)]
        cur.append(cy(0.02, ww + 0.7, (wx, y1 + 0.12, 0.1), WOOD_D, rot=(0, math.pi / 2, 0), name="rod"))
        join(cur, "window_curtains")
    else:
        bx(ww + 0.2, 0.22, 0.06, (wx, y1 - 0.02, 0.07), "#e9e5da", bevel=0.02, name="window_blind")
    anchor("window", (wx, wy, 0.1))

    # door: frame in the wall, leaf hanging from a pivot empty at the hinge (z = 4.95)
    fdoor = [
        bx(0.22, dh + 0.05, 0.07, (-0.05, (dh + 0.05) / 2, d0 - 0.035), trim, bevel=0.01, name="df"),
        bx(0.22, dh + 0.05, 0.07, (-0.05, (dh + 0.05) / 2, d1 + 0.035), trim, bevel=0.01, name="df"),
        bx(0.22, 0.07, d1 - d0 + 0.14, (-0.05, dh + 0.035, (d0 + d1) / 2), trim, bevel=0.01, name="df"),
    ]
    join(fdoor, "door_frame")
    pivot = bpy.data.objects.new("door_pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = P(-T / 2, 0, d1)  # hinge at z = 4.95; the leaf runs toward -z (closed)
    leaf = placed(lambda: _door_leaf("#7fa3a1" if villa else "#a1693b", "#6b908e" if villa else "#8c5830"), (0, 0, 0), math.pi / 2)
    for o in leaf:
        o.parent = pivot
    anchor("door", (0.05, 1.25, (d0 + d1) / 2))
    bx(0.7, 0.02, 0.9, (0.55, 0.011, (d0 + d1) / 2), "#b5614a", bevel=0.01, name="doormat")


def _door_leaf(color, panel):
    """A door leaf in its own frame: hinge at the origin, leaf running along local +x (app), closed."""
    W, Hd = 0.9, 2.13
    objs = [
        bx(W, Hd, 0.06, (W / 2, Hd / 2, 0), color, bevel=0.02, name="leaf"),
        bx(0.55, 0.9, 0.02, (W / 2, 1.3, 0.04), panel, bevel=0.01, name="panel-top"),
        bx(0.55, 0.6, 0.02, (W / 2, 0.55, 0.04), panel, bevel=0.01, name="panel-bottom"),
        el(0.025, 0.025, 0.025, (W - 0.12, 1.0, 0.07), BRASS, name="knob"),
        el(0.025, 0.025, 0.025, (W - 0.12, 1.0, -0.07), BRASS, name="knob"),
    ]
    return objs


def item_house_door():
    """Front door: a leaf that hangs from an empty `door_pivot` at the hinge. Rotate the empty to open it."""
    pivot = bpy.data.objects.new("door_pivot", None)
    bpy.context.collection.objects.link(pivot)
    for o in _door_leaf("#a1693b", "#8c5830"):
        o.parent = pivot
    anchor("door", (0.45, 1.25, 0.1))


def item_room_shell_cabin():
    room_shell(False)


def item_room_shell_villa():
    room_shell(True)


def item_exterior(villa=False):
    body = "#f3efe6" if villa else "#e6dcc4"
    trim = "#f6f3ec" if villa else WOOD_D
    roof = "#f6f3ec" if villa else "#a8553a"
    T, bw, bh = 0.8, 5.4, 2.9
    dw, dh = 0.95, 1.95
    hw = dw / 2
    walls = [
        bx(bw / 2 - hw, bh, T, (-(bw / 2 + hw) / 2, bh / 2, -T / 2), body, bevel=0.0, name="front-left", rough=0.95),
        bx(bw / 2 - hw, bh, T, ((bw / 2 + hw) / 2, bh / 2, -T / 2), body, bevel=0.0, name="front-right", rough=0.95),
        bx(dw, bh - dh, T, (0, (bh + dh) / 2, -T / 2), body, bevel=0.0, name="front-top", rough=0.95),
        bx(bw, bh, 3.2, (0, bh / 2, -T - 1.6), body, bevel=0.0, name="back", rough=0.95),
    ]
    join(walls, "house_walls")
    glow = bx(dw, dh, 0.01, (0, dh / 2, -T + 0.01), "#ffd9a0", bevel=0.0, name="doorway_light", mat=GLOW("#ffd9a0", 2.0, "doorway"))
    del glow
    if not villa:
        part("prism", (6.3, 1.7, 4.6), (0, bh, -2.0), M(roof, 0.85), name="roof")
        bx(0.5, 1.3, 0.5, (1.7, bh + 1.0, -2.4), "#8a5a45", bevel=0.0, name="chimney")
        el(0.28, 0.28, 0.02, (0, bh + 0.8, 0.32), "#f2e3c0", name="gable-window")
    else:
        bx(bw + 0.8, 0.28, 4.8, (0, bh + 0.14, -2.0), roof, bevel=0.03, name="roof-slab")
        bx(3.4, 1.3, 3.0, (-0.6, bh + 0.28 + 0.65, -2.4), "#ece7dc", bevel=0.03, name="upper")
        bx(3.8, 0.2, 3.4, (-0.6, bh + 0.28 + 1.4, -2.4), roof, bevel=0.03, name="upper-cap")
        bx(2.4, 0.8, 0.02, (-0.6, bh + 0.98, -0.9), "#cfe8ff", bevel=0.0, name="upper-glass", mat=GLOW("#ffe3b0", 0.5, "upper_window"))
    fr = [
        bx(0.09, dh + 0.05, 0.14, (-hw - 0.045, dh / 2, 0.05), trim, bevel=0.01, name="frame"),
        bx(0.09, dh + 0.05, 0.14, (hw + 0.045, dh / 2, 0.05), trim, bevel=0.01, name="frame"),
        bx(dw + 0.2, 0.1, 0.14, (0, dh + 0.05, 0.05), trim, bevel=0.01, name="frame-top"),
    ]
    join(fr, "door_frame")
    pivot = bpy.data.objects.new("door_pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = P(-hw, 0, -0.1)
    for o in made(lambda: _door_leaf("#7fa3a1" if villa else "#a1693b", "#6b908e" if villa else "#8c5830")):
        o.parent = pivot
    bx(2.6, 0.14, 1.3, (0, 0.07, 0.6), "#d8d4cb" if villa else "#a98258", bevel=0.02, name="porch")
    for s in (-1, 1):
        x = s * 1.9
        bx(1.0, 0.95, 0.1, (x, 1.55, 0.02), trim, bevel=0.01, name="window-frame")
        bx(0.82, 0.77, 0.02, (x, 1.55, 0.075), "#ffe3b0", bevel=0.0, name="window-glass", mat=GLOW("#ffe3b0", 0.55, "window"))
        bx(1.0, 0.18, 0.22, (x, 0.95, 0.18), "#a98258", bevel=0.02, name="window-box")
        for i, c in enumerate([PINK, YELLOW, WHITE, "#c58bd9"]):
            el(0.07, 0.07, 0.07, (x - 0.36 + i * 0.24, 1.1, 0.2), c, name="flower")
    placed(item_doorbell, (1.05, 1.0, 0.07))
    cy(0.07, 0.2, (-1.05, 1.9, 0.12), METAL, name="sconce")
    glow_el(0.08, (-1.05, 2.05, 0.12), "#ffd9a0", 4, "sconce", name="sconce-light")
    placed(item_mailbox, (2.6, 0.0, 3.0))
    for i in range(7):
        bx(0.9, 0.06, 0.55, (((i % 2) - 0.5) * 0.25, 0.05, 1.6 + i * 0.85), "#d8d2c4" if i % 2 else "#e6e0d2", bevel=0.02, rot=(0, 0, ((i % 3) - 1) * 0.08), name="stone")
    for x, z, s in [(-4.2, 1.2, 1.1), (4.4, -0.5, 1.0), (-3.2, -3.6, 1.3), (3.6, -4.2, 1.2)]:
        cy(0.18 * s, 1.2 * s, (x, 0.6 * s, z), WOOD_D, name="trunk")
        part("sphere_hi", (0.95 * s, 0.95 * s, 0.95 * s), (x, 1.7 * s, z), M("#5f9d6a", 0.8), name="crown")
        el(0.7 * s, 0.7 * s, 0.7 * s, (x + 0.4 * s, 2.3 * s, z + 0.1 * s), LEAF2, name="crown")
    for x, z, s in [(-2.6, 0.5, 0.45), (2.7, 0.55, 0.5), (-2.2, 1.7, 0.35), (3.2, 1.6, 0.4)]:
        el(s, s * 0.8, s, (x, s * 0.7, z), LEAF, name="bush")
    cy(8.4, 0.02, (0, 0.01, 0), "#a3cf8a", name="lawn")
    cy(9.0, 0.4, (0, -0.2, 0), "#8fbf7a", name="ground-disc")


def item_pet_bed():
    to(0.36, 0.1, (0, 0.1, 0), "#d9a56b", name="rim")
    cy(0.42, 0.1, (0, 0.05, 0), "#f0d9bd", name="cushion")


def item_rug():
    for r, h, col in ((1.35, 0.02, "#c9786b"), (1.0, 0.024, "#f0d9bd"), (0.55, 0.028, "#c9786b")):
        squash(cy(r, h, (0, h / 2 + 0.002, 0), col, name="rug-ring"), 1, 1, 0.82)


# ================================================================ registry

# name: (builder, category). Categories drive the review sheets and the budget checks.
ITEMS = {
    # furniture (6)
    "desk": (item_desk, "furniture"),
    "office_chair": (item_office_chair, "furniture"),
    "bookshelf": (item_bookshelf, "furniture"),
    "dresser": (item_dresser, "furniture"),
    "side_table": (item_side_table, "furniture"),
    "coffee_table": (item_coffee_table, "furniture"),
    # functional props (22)
    "computer": (item_computer, "functional"),
    "keyboard_mouse": (item_keyboard_mouse, "functional"),
    "diary": (item_diary, "functional"),
    "typewriter": (item_typewriter, "functional"),
    "pen_cup": (item_pen_cup, "functional"),
    "record_player": (item_record_player, "functional"),
    "microphone": (item_microphone, "functional"),
    "rotary_phone": (item_rotary_phone, "functional"),
    "answering_machine": (item_answering_machine, "functional"),
    "polaroid_camera": (item_polaroid_camera, "functional"),
    "photo_wall": (item_photo_wall, "functional"),
    "photo_album_open": (item_photo_album_open, "functional"),
    "books_row": (item_books_row, "functional"),
    "books_stack": (item_books_stack, "functional"),
    "cd_disc": (item_cd_disc, "functional"),
    "desk_lamp": (item_desk_lamp, "functional"),
    "mailbox": (item_mailbox, "functional"),
    "doorbell": (item_doorbell, "functional"),
    "nameplate": (item_nameplate, "functional"),
    "house_door": (item_house_door, "functional"),
    "storage_box": (item_storage_box, "functional"),
    "calendar": (item_calendar, "functional"),
    # ambient (12)
    "lava_lamp": (item_lava_lamp, "ambient"),
    "mug": (item_mug, "ambient"),
    "plant_small": (item_plant_small, "ambient"),
    "wall_clock": (item_wall_clock, "ambient"),
    "radio": (item_radio, "ambient"),
    "printer": (item_printer, "ambient"),
    "cake": (item_cake, "ambient"),
    "stickers": (item_stickers, "ambient"),
    "floor_cushion": (item_floor_cushion, "ambient"),
    "pet_bed": (item_pet_bed, "ambient"),
    "rug": (item_rug, "ambient"),
    "floor_lamp": (item_floor_lamp, "ambient"),
    # decor the owner places (the app's 7 kinds; floor_lamp is counted above)
    "plant": (item_plant, "decor"),
    "cactus": (item_cactus, "decor"),
    "armchair": (item_armchair, "decor"),
    "stool": (item_stool, "decor"),
    "basket": (item_basket, "decor"),
    "mini_bookcase": (item_mini_bookcase, "decor"),
    # keepsakes (8)
    "keepsake_shell": (item_keepsake_shell, "keepsake"),
    "keepsake_candle": (item_keepsake_candle, "keepsake"),
    "keepsake_book": (item_keepsake_book, "keepsake"),
    "keepsake_flower_vase": (item_keepsake_flower_vase, "keepsake"),
    "keepsake_cassette": (item_keepsake_cassette, "keepsake"),
    "keepsake_postcard": (item_keepsake_postcard, "keepsake"),
    "keepsake_photo_frame": (item_keepsake_photo_frame, "keepsake"),
    "keepsake_ticket": (item_keepsake_ticket, "keepsake"),
    # the pet (1, three animation clips)
    "pet_ghost": (item_pet_ghost, "pet"),
    # the house
    "cabin_room_shell": (item_room_shell_cabin, "house"),
    "villa_room_shell": (item_room_shell_villa, "house"),
    "cabin_exterior": (lambda: item_exterior(False), "house"),
    "villa_exterior": (lambda: item_exterior(True), "house"),
}

# Triangle budgets from the brief: props < 2k, furniture < 5k, buildings < 15k (pet gets a little more).
BUDGET = {"furniture": 5000, "functional": 2000, "ambient": 2000, "decor": 5000, "keepsake": 2000, "pet": 3000, "house": 15000}
WALL_MOUNTED = {"photo_wall", "calendar", "wall_clock", "nameplate", "keepsake_postcard", "keepsake_photo_frame", "keepsake_ticket"}


# ================================================================ preview rendering


def three_quarter(name, rend_dir, res, samples, from_front=False):
    center, size, floor_z = scene_bounds()
    add_ground(center, size, floor_z)
    dist = size * 2.9 + 0.15
    off = Vector(P(0.8, 0.85, 1.0)) * dist
    if name.replace("_", "") in {n.replace("_", "") for n in WALL_MOUNTED}:
        off = Vector(P(0.45, 0.35, 1.0)) * dist
    add_camera(center + off, center, 50 if size < 4 else 35)
    add_sun(1.6, (52, 8, -38))
    add_area(70, center + Vector(P(-size * 1.2, size * 1.1, size * 0.6)), (70, 0, -30), max(2.0, size * 1.5))
    set_world((0.78, 0.75, 0.70), 0.55)
    setup_render(res, samples, jpeg=True)
    bpy.context.scene.render.filepath = os.path.join(rend_dir, f"{name}.jpg")
    bpy.ops.render.render(write_still=True)


def build_item(name, glb_dir, rend_dir):
    fn, cat = ITEMS[name]
    clear_scene()
    fn()
    # wall items hang on a wall in the app: for the preview, lean them on a board
    if name in WALL_MOUNTED:
        bx(1.2, 1.0, 0.04, (0, -0.1 if name in ("photo_wall", "calendar") else 0, -0.02), "#efe3c8", bevel=0.0, name="ground-board")
    shell = name.endswith("_room_shell")
    if shell:
        hide_front_walls()
    three_quarter(name, rend_dir, ITEM_RES, ITEM_SAMPLES)
    if shell:
        for n in ("wall_front", "wall_right"):
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = False
                o.hide_viewport = False
    # drop helpers and preview boards, then export
    for o in list(bpy.context.scene.objects):
        if o.name.startswith("ground-board"):
            bpy.data.objects.remove(o, do_unlink=True)
    tris = triangles()
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    export_glb(os.path.join(glb_dir, f"{name}.glb"), animations=(cat == "pet"))
    size = os.path.getsize(os.path.join(glb_dir, f"{name}.glb"))
    return {
        "name": name,
        "category": cat,
        "triangles": tris,
        "meshes": len(meshes),
        "glb_bytes": size,
        "budget": BUDGET[cat],
        "within_budget": tris <= BUDGET[cat],
    }


# ================================================================ assembled scenes (room, exterior)

PLACE = {
    # name: (item, app position, yaw)
    "desk": ("desk", (1.0, 0, 0.47), 0),
    "chair": ("office_chair", (1.5, 0, 1.55), 0.25),
    "shelf": ("bookshelf", (5.0, 0, 0.0), 0),
    "dresser": ("dresser", (3.2, 0, 0.3), 0),
    "table": ("side_table", (0.46, 0, 2.5), 0),
    "pet_bed": ("pet_bed", (4.5, 0, 3.5), 0),
    "rug": ("rug", (2.9, 0, 3.0), 0),
    "coffee": ("coffee_table", (2.9, 0, 3.0), 0),
    "computer": ("computer", (1.4, 0.775, 0.3), 0.12),
    "keyboard": ("keyboard_mouse", (1.38, 0.775, 0.68), 0.12),
    "diary": ("diary", (0.62, 0.8, 0.55), 0.18),
    "desk_lamp": ("desk_lamp", (0.22, 0.775, 0.22), 0),
    "pen_cup": ("pen_cup", (1.8, 0.775, 0.22), 0),
    "mug": ("mug", (1.05, 0.8, 0.78), 0.5),
    "machine": ("answering_machine", (0.4, 0.645, 2.4), 0.35),
    "phone": ("rotary_phone", (0.5, 0.645, 2.72), -0.4),
    "records": ("record_player", (3.0, 0.8, 0.3), 0),
    "lava": ("lava_lamp", (3.5, 0.8, 0.3), 0),
    "typewriter": ("typewriter", (2.8, 0.46, 2.95), 0.4),
    "camera": ("polaroid_camera", (3.1, 0.46, 3.2), -0.5),
    "photo_wall": ("photo_wall", (1.0, 1.75, 0.0), 0),
    "clock": ("wall_clock", (4.0, 2.75, 0.0), 0),
    "calendar": ("calendar", (0.0, 2.2, 3.55), math.pi / 2),
    "plant": ("plant", (5.5, 0, 1.5), 0),
    "floor_lamp": ("floor_lamp", (2.5, 0, 1.55), 0),
    "armchair": ("armchair", (3.5, 0, 4.6), 0.0),
    "cushion": ("floor_cushion", (1.9, 0, 3.9), 0),
    "basket": ("basket", (5.4, 0, 4.7), 0),
    "mini_bookcase": ("mini_bookcase", (5.3, 0, 2.6), 0.0),
    "shell": ("keepsake_shell", (4.4, 1.7, 0.3), 0.2),
    "candle": ("keepsake_candle", (5.0, 1.7, 0.3), 0),
    "flower": ("keepsake_flower_vase", (2.95, 1.03, 0.13), 0.2),
    "cassette": ("keepsake_cassette", (5.6, 0.9, 0.3), 0.2),
    "frame1": ("keepsake_photo_frame", (0.03, 1.9, 1.35), math.pi / 2),
    "frame2": ("keepsake_postcard", (0.03, 1.9, 2.15), math.pi / 2),
    "frame3": ("keepsake_ticket", (0.03, 1.9, 2.95), math.pi / 2),
    "stickers": ("stickers", (1.0, 0.8, 0.84), 0.3),
    "album": ("photo_album_open", (2.9, 0.46, 3.0), 0.1),
    "mailbox": ("mailbox", (0.0, 0, 0.0), 0),
    "ghost": ("pet_ghost", (2.7, 0.0, 3.4), 0.6),
}


def put(key, at=None, yaw=None):
    item, p, y = PLACE[key]
    fn = ITEMS[item][0]
    return placed(fn, at or p, y if yaw is None else yaw)


def furnish_room(villa=False):
    (room_shell)(villa)
    for k in ("desk", "chair", "shelf", "dresser", "table", "pet_bed", "rug", "computer", "keyboard", "diary", "desk_lamp",
              "pen_cup", "mug", "machine", "phone", "records", "lava", "photo_wall", "clock", "calendar", "plant",
              "floor_lamp", "armchair", "cushion", "basket", "mini_bookcase", "shell", "candle", "flower", "cassette",
              "frame1", "frame2", "frame3", "stickers", "ghost"):
        put(k)
    # the rug sits under the coffee table; the table carries the typewriter, camera and album
    put("coffee", at=(2.9, 0, 3.0))
    put("typewriter", at=(2.75, 0.46, 2.95), yaw=0.4)
    put("camera", at=(3.1, 0.46, 3.15), yaw=-0.5)


def hide_front_walls():
    for n in ("wall_front", "wall_right"):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = True
            o.hide_viewport = True


def render_scene(name, glb_dir, scene_dir, night, camera, lamps=(), exterior=False, export_glb_name=None):
    # export the assembled model first (no lights/cameras), then add the lighting and render
    if export_glb_name:
        export_glb(os.path.join(glb_dir, f"{export_glb_name}.glb"))
        tris = triangles()
    else:
        tris = triangles()
    hide_front_walls()  # the camera looks in from the front; the app fades these walls instead
    add_camera(*camera)
    if night:
        set_world((0.06, 0.08, 0.16), 0.5)
        add_sun(0.35, (60, 0, -40), color=(0.6, 0.7, 1.0))
        for at, energy in lamps:
            add_point(energy, at)
    else:
        set_world((0.46, 0.7, 0.95) if exterior else (0.86, 0.8, 0.7), 1.1 if exterior else 1.0)
        if exterior:
            add_sun(3.0, (55, 10, 30), color=(1.0, 0.95, 0.85))
        else:
            add_sun(3.5, (62, 0, 180 - 20), color=(1.0, 0.93, 0.8), angle=2)  # shines in through the back window
            add_area(160, Vector(P(6, 6, 9)), (60, 0, 30), 6)
    setup_render(SCENE_RES, SCENE_SAMPLES)
    bpy.context.scene.cycles.use_denoising = True
    bpy.context.scene.render.filepath = os.path.join(scene_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    return tris


ROOM_CAM = (Vector(P(10.2, 8.0, 10.2)), Vector(P(3, 0.9, 2.9)), 36)
ROOM_LAMPS = [((0.1, 1.15, 0.4), 90), ((2.5, 1.5, 1.55), 150), ((3.5, 0.6, 0.3), 10)]


def build_scene(which, glb_dir, scene_dir):
    clear_scene()
    info = {"name": which}
    if which.startswith("room_"):
        _, house, tod = which.split("_")
        furnish_room(house == "villa")
        info["triangles"] = render_scene(which, glb_dir, scene_dir, tod == "night", ROOM_CAM, ROOM_LAMPS,
                                         export_glb_name=f"room_{house}" if tod == "day" else None)
    elif which.startswith("exterior_"):
        _, house, tod = which.split("_")
        item_exterior(house == "villa")
        cam = (Vector(P(6.5, 3.6, 14)), Vector(P(0, 1.6, -0.4)), 38)
        lamps = [((-1.05, 2.05, 0.5), 300), ((0, 1.4, -0.4), 150)]
        info["triangles"] = render_scene(which, glb_dir, scene_dir, tod == "night", cam, lamps, exterior=True,
                                         export_glb_name=f"exterior_{house}" if tod == "day" else None)
    elif which == "desk_corner":
        room_shell(False)
        for k in ("desk", "chair", "computer", "keyboard", "diary", "desk_lamp", "pen_cup", "mug", "stickers", "plant"):
            put(k)
        placed(item_plant_small, (1.95, 0.775, 0.55))
        placed(item_polaroid_camera, (0.35, 0.8, 0.82), 0.5)
        placed(item_lava_lamp, (1.75, 0.775, 0.25))
        put("photo_wall")
        put("shelf")
        put("shell")
        put("candle")
        cam = (Vector(P(5.2, 2.7, 4.8)), Vector(P(1.1, 1.05, 0.5)), 42)
        info["triangles"] = render_scene(which, glb_dir, scene_dir, False, cam, ())
    info["ok"] = True
    return info


SCENES = [
    "room_cabin_day",
    "room_cabin_night",
    "room_villa_day",
    "exterior_cabin_day",
    "exterior_villa_night",
    "desk_corner",
]


def main(argv):
    glb_dir = os.path.join(OUT, "glb")
    rend_dir = os.path.join(OUT, "renders")
    scene_dir = os.path.join(OUT, "scenes")
    for d in (glb_dir, rend_dir, scene_dir):
        os.makedirs(d, exist_ok=True)
    only_scenes = "--scenes" in argv
    only_cat = None
    if "--only" in argv:
        only_cat = argv[argv.index("--only") + 1]
    names = [a for a in argv if not a.startswith("--") and a != only_cat]
    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        manifest = {m["name"]: m for m in json.load(open(manifest_path))}

    todo = []
    if not only_scenes:
        todo = names or [n for n, (_, c) in ITEMS.items() if not only_cat or c == only_cat]
    for n in todo:
        try:
            info = build_item(n, glb_dir, rend_dir)
            info["ok"] = True
            print(f"OK   {n}: {info['triangles']} tris, {info['glb_bytes'] // 1024} KB" + ("" if info["within_budget"] else "  OVER BUDGET"), flush=True)
            if n == "pet_ghost":
                for pn in pet_pose_renders(glb_dir, rend_dir):
                    print(f"OK   {pn}", flush=True)
        except Exception as e:  # keep going; one failing item must not hide the rest
            info = {"name": n, "ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
            print(f"FAIL {n}: {e}", flush=True)
        manifest[n] = info
        with open(manifest_path, "w") as f:
            json.dump(list(manifest.values()), f, indent=2, ensure_ascii=False)

    if only_scenes or (not names and not only_cat):
        for s in ([n for n in names if n in SCENES] if only_scenes and names else SCENES):
            try:
                info = build_scene(s, glb_dir, scene_dir)
                info["category"] = "scene"
                print(f"OK   scene {s}: {info.get('triangles')} tris", flush=True)
            except Exception as e:
                info = {"name": s, "category": "scene", "ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
                print(f"FAIL scene {s}: {e}", flush=True)
            manifest[s] = info
            with open(manifest_path, "w") as f:
                json.dump(list(manifest.values()), f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    main(args)
