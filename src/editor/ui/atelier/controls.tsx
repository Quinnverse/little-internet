import type { ComponentChildren } from 'preact'

/** Small form controls shared by the Atelier panels. All are plain buttons/inputs (keyboard and touch friendly). */

export function Seg<T extends string | number>(props: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset class="field at-seg">
      <legend class="field-label">{props.label}</legend>
      <div class="seg" role="group" aria-label={props.label}>
        {props.options.map(([v, label]) => (
          <button type="button" key={String(v)} class={props.value === v ? 'on' : ''} aria-pressed={props.value === v} onClick={() => props.onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function ColorPick(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label class="color-pick">
      <input type="color" value={props.value} onInput={(e) => props.onChange(e.currentTarget.value.toLowerCase())} />
      <span>{props.label}</span>
      <code>{props.value}</code>
    </label>
  )
}

/** A colour that may be unset (falls back to the style). */
export function OptionalColor(props: { label: string; customLabel: string; value: string | undefined; fallback: string; onChange: (v: string | null) => void }) {
  const on = props.value !== undefined
  return (
    <div class="opt-color">
      <label class="switch-row">
        <input type="checkbox" checked={on} onChange={(e) => props.onChange(e.currentTarget.checked ? props.fallback : null)} />
        <span>{props.label}: {props.customLabel}</span>
      </label>
      {on && <ColorPick label={props.label} value={props.value!} onChange={props.onChange} />}
    </div>
  )
}

export function Range(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label class="field at-range">
      <span class="field-label">
        {props.label} <span class="muted">{props.value}{props.unit ?? ''}</span>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value} onInput={(e) => props.onChange(Number(e.currentTarget.value))} />
    </label>
  )
}

export function Section(props: { title: string; children: ComponentChildren }) {
  return (
    <section class="at-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  )
}

export function Select<T extends string>(props: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value as T)}>
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}
