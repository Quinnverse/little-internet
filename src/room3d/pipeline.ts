import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'

/** The difference between "a lit 3D scene" and "a photograph of a room" is almost entirely after the
 *  render: light bleeds off the lamps, corners hold a little darkness, and the grade pulls the whole
 *  frame toward one colour temperature. This is that last 20%. */
const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.30 },
    uGrain: { value: 0.012 },
    uWarm: { value: 0.38 },
    uContrast: { value: 1.10 },
    uLift: { value: 0.008 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uVignette, uGrain, uWarm, uContrast, uLift;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      // Shadows go warm and slightly milky, highlights go cool. One temperature per frame is what
      // makes a render feel lit rather than coloured.
      c = mix(c, c * vec3(1.055, 0.995, 0.915), (1.0 - smoothstep(0.0, 0.55, lum)) * uWarm);
      c = mix(c, c * vec3(0.965, 0.995, 1.055), smoothstep(0.55, 1.0, lum) * uWarm);
      c = (c - 0.5) * uContrast + 0.5 + uLift;
      float v = 1.0 - dot(vUv - 0.5, vUv - 0.5) * uVignette * 2.4;
      c *= clamp(v, 0.0, 1.0);
      float g = hash(vUv * uRes + uTime * 7.0);
      c += (g - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
}

export type Pipeline = {
  render: () => void
  setFocus: (d: number) => void
  setSize: (w: number, h: number, dpr: number) => void
  dispose: () => void
  setBackground: (night: boolean) => void
}

/** A painted backdrop instead of a live sky: it is cheaper, it never shows a seam where the cutaway
 *  ceiling ends, and it keeps the frame inside one colour story. */
function backdrop(night: boolean): THREE.CanvasTexture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, s)
  if (night) {
    grad.addColorStop(0, '#0a0a14')
    grad.addColorStop(0.55, '#12121f')
    grad.addColorStop(1, '#1b1720')
  } else {
    // The interior framing is taller than the walls, so the top of the frame is backdrop. A bright
    // top made that band read as blown-out sky above a room; a dark warm top reads as shadow over
    // the ceiling and closes the composition the way the reference footage does.
    grad.addColorStop(0, '#3a2f24')
    grad.addColorStop(0.42, '#7d6a52')
    grad.addColorStop(1, '#efe2c9')
  }
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  if (night) {
    for (let i = 0; i < 210; i++) {
      const a = 0.25 + Math.random() * 0.75
      const r = Math.random() * 1.5 + 0.3
      g.beginPath()
      g.arc(Math.random() * s, Math.random() * s * 0.8, r, 0, 6.2832)
      g.fillStyle = `rgba(255,244,214,${a})`
      g.fill()
    }
  } else {
    // A little paper grain so the empty bands behind the room are not flat vector colour.
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = `rgba(120,95,60,${Math.random() * 0.05})`
      g.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, opts: { w: number; h: number; dpr: number; lowPower?: boolean }): Pipeline {
  const w = Math.max(1, opts.w)
  const h = Math.max(1, opts.h)
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    samples: opts.lowPower ? 0 : 4,
  })
  const composer = new EffectComposer(renderer, rt)
  composer.setPixelRatio(renderer.getPixelRatio())

  // GTAOPass renders black in this scene (the pass writes straight into its own beauty target and the
  // blended result comes out empty), so the grounded look is built from soft shadow decals instead.
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // Depth of field, very shallow: the reference rooms are shot on a long lens and the far wall falls
  // off just enough to keep the furniture reading as an object in a space rather than a diagram.
  const bokeh = opts.lowPower ? null : new BokehPass(scene, camera, { focus: 13, aperture: 0.00028, maxblur: 0.006 })
  if (bokeh) composer.addPass(bokeh)

  // Light has to be allowed to exceed white before it bleeds, or every lamp turns into a white blob.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), opts.lowPower ? 0.18 : 0.26, 0.55, 1.16)
  composer.addPass(bloom)

  const output = new OutputPass()
  composer.addPass(output)

  const grade = new ShaderPass(Grade)
  grade.uniforms.uRes.value.set(w, h)
  composer.addPass(grade)

  const tex: { day?: THREE.CanvasTexture; night?: THREE.CanvasTexture } = {}
  const bgDay = () => (tex.day ??= backdrop(false))
  const bgNight = () => (tex.night ??= backdrop(true))
  scene.background = bgDay()
  scene.backgroundIntensity = 0.92

  let t0 = performance.now()
  return {
    render() {
      grade.uniforms.uTime.value = (performance.now() - t0) / 1000
      composer.render()
    },
    setFocus(d) {
      if (bokeh) (bokeh.uniforms as Record<string, { value: number }>).focus!.value = d
    },
    setSize(nw, nh, dpr) {
      composer.setPixelRatio(dpr)
      composer.setSize(nw, nh)
      renderPass.setSize(nw * dpr, nh * dpr)
      grade.uniforms.uRes.value.set(nw * dpr, nh * dpr)
      bloom.setSize(nw * dpr, nh * dpr)
      bokeh?.setSize(nw * dpr, nh * dpr)
    },
    setBackground(night) {
      scene.background = night ? bgNight() : bgDay()
    },
    dispose() {
      composer.passes.forEach((p) => p.dispose?.())
      rt.dispose()
      tex.day?.dispose()
      tex.night?.dispose()
    },
  }
}
