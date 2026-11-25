# Blender models

`build_props.py` models everything with Blender's Python API (no GUI, no hand sculpting), exports glTF and renders
a Cycles preview of each model. `make_sheets.py` turns the renders into contact sheets and `assets/review/README.md`.

## Run

```bash
python -m venv .blender-venv && .blender-venv/bin/pip install bpy pillow
REVIEW_OUT=assets/review .blender-venv/bin/python assets/blender/build_props.py            # all (about 5 minutes on 8 cores)
REVIEW_OUT=assets/review .blender-venv/bin/python assets/blender/build_props.py desk plant # some models
REVIEW_OUT=assets/review .blender-venv/bin/python assets/blender/build_props.py --only furniture
REVIEW_OUT=assets/review .blender-venv/bin/python assets/blender/build_props.py --scenes   # assembled room and exterior
.blender-venv/bin/python assets/blender/make_sheets.py
node scripts/assets/glb-sizes.mjs                                                          # size before/after quantization
```

`bpy` needs a few system libraries (`libSM`, `libGL`...). On a normal Linux desktop they exist. In a stripped container
you may have to provide them (the build here used a stub `libGL.so.1`, which is fine for headless rendering).
Blender itself (`blender --background --python assets/blender/build_props.py -- desk`) works too.

## Conventions

See the top of `build_props.py` and `assets/review/README.md`: metres, Y up, origin at the bottom centre, `hs_*` anchors,
`screen` and `emissive_*` materials, four separate wall nodes, a `door_pivot` for the door.
