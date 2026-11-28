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
