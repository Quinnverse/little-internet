import { useState } from 'preact/hooks'
import { GHOST_COLORS, SITE_SLUG_PATTERN, THEMES, type Project, type Result, type Theme } from '../../core/schema.ts'
import { THEME_VARS } from '../../core/themes.ts'
import { createProject } from '../commands.ts'
import { randomId, suggestSiteSlug } from '../ids.ts'
import { Field, GhostIcon } from './common.tsx'
import { describeProject, pickProjectFile } from './files.ts'

const THEME_LABEL: Record<Theme, string> = { paper: 'Paper', midnight: 'Midnight', meadow: 'Meadow' }

export function Setup(props: { onDone: (p: Project) => Result<Project> }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [theme, setTheme] = useState<Theme>('midnight')
  const [ghostName, setGhostName] = useState('Boo')
  const [ghostColor, setGhostColor] = useState<(typeof GHOST_COLORS)[number]>('white')
  const [error, setError] = useState<string | null>(null)

  const effectiveSlug = slugTouched ? slug : suggestSiteSlug(name)
  const slugOk = SITE_SLUG_PATTERN.test(effectiveSlug)

  const create = () => {
    const title = name.trim() || 'My little home'
    if (!slugOk) return setError('The address may only use a–z, 0–9 and dashes.')
    const r = props.onDone(
      createProject(
        { title, slug: effectiveSlug, theme, ghostName: ghostName.trim() || 'Boo', ghostColor },
        [randomId(), randomId(), randomId()],
      ),
    )
    if (!r.ok) setError(r.reason)
  }

  const load = async (kind: 'site' | 'backup') => {
    const r = await pickProjectFile(kind)
    if (!r) return
    if (!r.ok) return setError(r.reason)
    if (confirm(`Open ${describeProject(r.value)}?`)) props.onDone(r.value)
  }

  return (
    <main class="setup">
      <div class="setup-hero">
        <GhostIcon color={ghostColor} size={72} />
        <h1>A quiet corner of the internet, just for you.</h1>
        <p class="muted">No account. Everything stays on this phone until you choose to open the door.</p>
      </div>

      <Field label="What is your home called?">
        <input value={name} maxLength={80} placeholder="Moon’s corner" onInput={(e) => setName(e.currentTarget.value)} />
      </Field>

      <Field label="Address" hint={`Your site will live at …/@${effectiveSlug || '…'}`}>
        <input
          value={effectiveSlug}
          maxLength={32}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          aria-invalid={!slugOk}
          onInput={(e) => {
            setSlugTouched(true)
            setSlug(e.currentTarget.value.toLowerCase())
          }}
        />
      </Field>

      <fieldset class="field">
        <legend class="field-label">Style</legend>
        <div class="choice-row">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t}
              class={`theme-chip ${theme === t ? 'selected' : ''}`}
              style={{ background: THEME_VARS[t].bg, color: THEME_VARS[t].fg, borderColor: THEME_VARS[t].accent }}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Your ghost’s name">
        <input value={ghostName} maxLength={24} onInput={(e) => setGhostName(e.currentTarget.value)} />
      </Field>

      <fieldset class="field">
        <legend class="field-label">Ghost colour</legend>
        <div class="choice-row">
          {GHOST_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              class={`ghost-chip ${ghostColor === c ? 'selected' : ''}`}
              aria-label={c}
              aria-pressed={ghostColor === c}
              onClick={() => setGhostColor(c)}
            >
              <GhostIcon color={c} size={36} />
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p class="error" role="alert">{error}</p>}

      <button type="button" class="btn btn-primary btn-block" onClick={create}>
        Move in
      </button>

      <div class="setup-alt">
        <p class="muted">Already have a home?</p>
        <div class="choice-row">
          <button type="button" class="btn" onClick={() => load('backup')}>Restore private backup</button>
          <button type="button" class="btn" onClick={() => load('site')}>Import website ZIP</button>
        </div>
      </div>
    </main>
  )
}
