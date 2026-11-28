# V7 精致度：做了什么、差距在哪、下一步

对照参考（Emona 暖光房间 / THERE IS A PLACE 的 HUD / 雪夜降临历 / 粒子圣诞）。
结论先说：让人读出"土、生硬、玩具感"的不是面数，而是**每个面只有一种颜色**和**房间太干净**。

## 已落地（按轮次）

| 轮 | 改动 | 落点 |
| --- | --- | --- |
| 1 | 灯光重写：主光/半球/环境/轮廓、PCFSoft 阴影、灯罩 halo、150 粒加法尘埃、暖纸背景 | `view.ts` `applyLight()` |
| 2 | 降饱和色板、壁纸、纸片手册（`.hb`）、胶囊 dock、时间胶囊跟 `privateHome.period` | `style.css` `Settings.tsx` |
| 3 | 礼物仪式（封蜡信封→星空→12 格降临历→落款信→放进屋里）、`#gift` 深链 | `GiftRitual.tsx` |
| 4 | 后处理管线：EffectComposer + 4xMSAA + UnrealBloom + 自写 GradePass（暖阴影/冷高光、暗角、颗粒、lift）、运行时昼夜渐变背景 | `pipeline.ts`（新增） |
| 4 | Blender 全量重建：按尺寸自动倒角（带增长预算）、书本二段式书脊、书架内部提亮、落地软阴影贴片 | `assets/blender/build_props.py`、`kit.ts` |
| 4 | 相机呼吸、宠物缩到 0.62、曝光提亮 | `view.ts`、`pet.ts` |
| 5 | 贴图管线：壁纸改"石膏底 + 极淡印花"（世界坐标 + 法线选轴的三平面投影）、地板 1024 + 板缝倒角 + roughnessMap、家具三平面织纹/木纹、天花板同底 | `materials.ts`、`kit.ts` |

体积：模型 1.4M → 2.23M（倒角 + 书脊细节）。贴图为运行时 canvas 生成，不进包。

## 与参考作品的真实差距（按影响排序）

1. **材质信息量**——已部分解决。墙面/地板/软装有了织纹与木纹；剩下的空白面是窗帘、窗框、灯具五金、电脑外壳。
2. **场景密度**——未解决。参考房间里有纸团、水杯、掉落的书、拖鞋、窗台石子；我们的房间像刚布置完。这是"有人住过"的证据，成本低、收益最高。注意：只能在示范家园 / 旅程卡预设里加，用户自己的空房间不该塞默认杂物。
3. **声音**——完全缺失。环境底噪 + 4 个交互音（点灯/翻书/开门/送礼）+ UI 轻响，WebAudio 合成，零资产体积。
4. **动作曲线**——宠物有次级动作，家具全是静止。开抽屉、灯罩晃动、书页翻动这类"一次性小动画"能把生硬感砍掉一半。
5. **构图**——仍是自由旋转全景。参考作品是固定机位 + 轻微视差。已加呼吸，未加机位预设。

## 下一步（按投入产出排序）

1. 杂物组（10 件）：散落书、翻开的笔记本、纸团、马克杯、耳机、拖鞋、半根蜡烛、窗台石子，只进示范家园。
2. 声音层：WebAudio 合成，先做点灯与翻书两个音，验证"听觉颗粒"对精致感的增益。
3. 家具次级动作：抽屉、灯罩、书页。
4. 机位预设：窗边低机位 / 书架轴线 / 俯瞰书桌，松手后缓慢回到最近预设。

## 已知未解决

- 远端 `v7/refined-home` 仍未推送（GitHub 网络不通，`git push` 两次卡死）。
- `npm run build` 全量四步尚未在本轮跑通（仅 `tsc --noEmit`）。
- Kiroween 评委偏好调研（任务 #3）仍是 pending：只拿到 devpost 的 Potential Value / Implementation / Quality and Design 片段。

## Round 8 — secondary motion (the "hand-feel" pass)

The gap with the reference footage is not texture resolution any more; it is that **nothing in the
reference stands perfectly still after being touched**. Three things were added, cheapest first:

1. **Lamp settle.** Switching the bulb kicks its stand (`lampKick = 1`, decay `e^-5.5t`, ±0.03 rad at
   24 rad/s) and it damps back to rest. Amplitude is deliberately at the edge of perception — you
   should feel the room answer, not see a wobbling prop.
2. **Grade breathing** (already in GradePass) and **camera idle drift** (already in view) are what
   make a still frame read as filmed rather than rendered. Verified by screen recording, not by
   screenshots: `shots/40-room-motion.webm`, 16.8 s, 1280x720.
3. **Sound answers every verb.** See round 7 — door / paper / stamp / lamp / chime / ambient bed.

Still missing for a true "game" hand-feel, in priority order:
- drawer pull with eased overshoot (needs a rigged drawer node; GLB has it as one mesh today)
- diary page settle (30 deg residual swing on open)
- three cinematic camera presets (wide / desk / window) instead of free drag only

## Round 9 — the flatness was a lens problem, then a material problem

Two changes here, and the first is the one that mattered most.

**Framing.** The camera was a 32 degree lens at 12 m: parallel edges, no vanishing point. That is a
dollhouse render, and no amount of texture fixes it. The references are shot around 45 degrees from
slightly above eye level, so the room gets a foreground, a back wall and a floor that recedes. Now
44 degrees, radius ~7.2, and the top of the frame sits above the wall line, so the backdrop needed to
stop being bright: a dark warm top reads as shadow over the ceiling and closes the composition.

**Surfaces.** Everything was procedurally painted on canvas — which is why every wall was uniform
sandpaper and every cabinet was one flat tint. Now real CC0 PBR from Poly Haven, inlined as 512/1024
webp data URIs so an exported site keeps them: `brown_planks_04` (floor, 1k, normal + roughness
tiled 3x), `white_stucco_02` (walls, normal at 0.17 so relief reads without going concrete),
`oak_veneer_01` (wood, desaturated because the raw map is yellow-green under the warm key),
`rough_linen` (fabric). Triplanar UVs are unchanged; normal and roughness maps now share the same
`tuv`, which is what previously made them sample a nonexistent uv set.

**Three bugs this exposed, all now fixed:**
- `wool_boucle` is a *tartan*, not a boucle. It stamped a tablecloth on the sofa. Replaced with linen.
- The fabric roughness map is dark, which turned the cloth into a mirror under the floor lamp. Cloth
  is uniformly matte; a constant beats the map.
- Decor items bypass `kitFurniture`, so they never ran the surface pass: the sofa was still a flat
  white blob while the sofa's own material claimed a texture. `decorDetail()` now covers them.
- And the real cause of the "white sofa": a point light parented to the camera at 13 cd. Zoom in and
  the light sits 1 m from the object and clips it. It is a lift, not a key — 0.75 cd now.

Still open: plank seams read slightly too dark at 1:1; wall blotches repeat visibly on very wide walls;
pale decor still edges toward clipping in direct lamp light.

## Round 10 — weight, air and one palette

The "still stiff" feeling was three separate things wearing one coat.

**Nothing touched the floor.** The shadow map is one 2048 tile across eighteen metres, so the two
centimetres under a cabinet are far below its resolution; furniture therefore read as stickers. Every
piece now gets a soft radial darkening plane fitted to its footprint (`addContactShadows`), skipping
rugs and anything standing on a desk. This is one draw call per piece against one shared texture, and
it is the cheapest weight in the whole render.

**The walls were concrete.** A 1k plaster photo at three-metre repeat is honest at 20 cm and noisy at
two metres. `softenTex()` redraws it through a canvas with blur + contrast trim, normal down to 0.055.
On top of that the wall shader now carries a baked falloff — darker at the floor line, at the ceiling
line and into every corner, all derived from world position. Flat walls are what make a box read as a
box, and no light rig fixes that.

**Six colours were arguing.** A teal desk chair, a mauve armchair, a plum rug and a seven-hue shelf in
one shot. `calmPalette` now pulls every saturated surface toward amber, drops saturation by half and
leaves value structure alone; book spines and printed matter are explicitly exempt, because that is
the one place in a room where colour is allowed to speak.

Also in: window muntins and a 13% glass veil (a window with no joinery is a poster), hemisphere and
ambient lifted (0.24/0.07 → 0.62/0.16) so the right wall stopped reading as a night scene, and the
camera dropped to 1.19 polar so the rug and the floor carry more of the frame.

Open, in priority order: real global illumination (bounce light off the floor is still faked), the
shelf's cream band on every spine forms a visible staircase at close range, plank seams go too dark at
1:1, and there is still no animated ambient motion inside the room itself.

## Round 11 — the frame finally has occlusion, and the room breathes

**SSAO is back in the chain, and it works.** GTAO rendered black here; plain `SSAOPass` does not.
Short radius (3 px, 0.22 m max distance) because this is a room, not an outdoor scene. This is what
finally put a seam where the wall meets the floor, darkened the shelf cavity, and stopped the desk
from looking pasted onto the wall. Exposure went up 1.52 → 1.62 to pay for it.

**The shelf was a picket fence.** Every book carried a cream band of nearly full spine width at
nearly the same height, so thirty spines lined up into one white staircase. In Blender the band is now
0.5–0.7 of the spine width, 4.5–6% tall, at 34–90% of the spine height, in muted `#cdbb9c`. Rebuilt
`bookshelf` only, re-exported and re-packed.

**Air.** The drapes have a vertex-shader breathe: two sines, squared by distance from the rail, 1.6 cm
into the room and 0.7 cm sideways, driven by a shared `uWind` clock (`ctx.winds`). With the existing
camera drift that is the first time anything in the room moves without the user touching it.

Still open: two coincident wall quads at 4.32 m and 4.48 m (the shell's inner and outer faces) split
the plaster into a faint pale rectangle on the left wall. Unifying the material made it worse — the
overlapping quads then banded — so the real fix is to delete the outer face from the shell model or
give it a different name and material, which is a one-line change in `build_props.py`.

## Round 12 — the window finally has air behind it

The flat painted sky was the last thing that made the room feel like a set rather than a place. The
window texture is now a real layered landscape: four ridgelines drawn offscreen, each blurred by its
own distance, a horizon haze band between every pair, a blurred cloud shelf, a radial sun glow that
bleeds past the frame, moon halo at night, and the distant town reduced to points of light. Bloom,
vignette and 2400 specks of grain sit on top, so the pane reads as distance instead of a poster.

Also in this round:
- the gallery board above the desk no longer casts a shadow (that soft rectangle of light it left on
  the plaster is gone) and its white is pulled down 14%.
- everything else about the pale patch on the wall is documented in the open list below, with the three
  failed fixes, so nobody repeats them.

Open after round 12:
- the gallery backing board still shows as a pale rectangle when the desk lamp rakes across it. Three
  fixes were tried and reverted: unifying the wall material (vertical banding), hiding meshes with no
  map (killed the plaster texture everywhere), hiding the wall's `_2` face or the board object itself
  (both took the prints with them — the prints share geometry groups and material instances with the
  board). Fixing it properly means splitting the gallery in Blender into `board` + `print_*` with
  separate material slots.
- floor plank seams still read 1:1 dark; wall blotchiness repeats across the wide face; no real GI.

## Round 13 — the pale rectangle was the AO pass, not geometry

Reading the boards in Blender settled it: `photo_wall` is a string, two nails, six polaroids and six
clips. There is no backing board in the export at all (the flat panel in the preview render is a
temp `ground-board` that gets deleted before writing the GLB). The rectangles on the plaster were
never an object: they are SSAO's depth prepass baking hard-edged patches into the occlusion around
every bright light — one box behind the desk lamp, one behind the candle, one behind the monitor.

Evidence, in order: raycasts across the band all returned `wall_back_1` at 4.3m; the same band
survived a pure-white untextured wall, survived anisotropy 4 → 8, survived normalScale 0, survived
far-plane 80 → 12; it disappeared the moment the SSAO pass was removed, and in a wall-only frame the
patches lined up exactly with the three light sources.

So SSAO is gone for good; `docs` no longer lists it as a win. Contact decals + the baked wall
falloff in `kit.ts` carry the grounding instead, and the plaster is finally clean.

Floor seams in the same round: the 2px contact band under each board and the butt joint were at
texel width once tiled three times over 6m, so they read as drawn black lines. They are now
gradients, 26% instead of 34%, and the whole floor texture gets one blurred composite pass
(`canvasTex(..., soften = 0.34)`) so the grain merges into itself instead of sitting on top.
