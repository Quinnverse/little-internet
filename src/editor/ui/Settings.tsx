import { useState } from 'preact/hooks'
import { GHOST_COLORS, SITE_SLUG_PATTERN, THEMES } from '../../core/schema.ts'
import { THEME_VARS } from '../../core/themes.ts'
import { compose, updateGhost, updateSite } from '../commands.ts'
import { Field, GhostIcon, run, type Ctx } from './common.tsx'

export function Settings(props: { ctx: Ctx }) {
  const { ctx } = props
  const { site, ghost } = ctx.project
  const [title, setTitle] = useState(site.title)
  const [tagline, setTagline] = useState(site.tagline)
  const [slug, setSlug] = useState(site.slug)
  const [ghostName, setGhostName] = useState(ghost.name)

  const saveText = () => {
    if (!SITE_SLUG_PATTERN.test(slug)) return ctx.toast('The address may only use a–z, 0–9 and dashes.', 'error')
    run(
      ctx,
      compose(updateSite({ title: title.trim() || site.title, tagline: tagline.trim(), slug }), updateGhost({ name: ghostName.trim() || ghost.name })),
      'Saved.',
    )
  }

  return (
    <section class="screen">
      <div class="screen-head">
        <h1>Settings</h1>
      </div>
      <div class="card">
        <Field label="Home name">
          <input value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Tagline">
          <input value={tagline} maxLength={200} placeholder="A few words under the name" onInput={(e) => setTagline(e.currentTarget.value)} />
        </Field>
        <Field label="Address" hint="Changing it changes where your published site lives.">
          <input value={slug} maxLength={32} autocapitalize="off" spellcheck={false} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} />
        </Field>
        <Field label="Ghost’s name">
          <input value={ghostName} maxLength={24} onInput={(e) => setGhostName(e.currentTarget.value)} />
        </Field>
        <button type="button" class="btn btn-primary" onClick={saveText}>Save</button>
      </div>

      <h2>Style</h2>
      <div class="choice-row">
        {THEMES.map((t) => (
          <button
            type="button"
            key={t}
            class={`theme-chip ${site.theme === t ? 'selected' : ''}`}
            style={{ background: THEME_VARS[t].bg, color: THEME_VARS[t].fg, borderColor: THEME_VARS[t].accent }}
            aria-pressed={site.theme === t}
            onClick={() => run(ctx, updateSite({ theme: t }))}
          >
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <h2>Ghost</h2>
      <div class="choice-row">
        {GHOST_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            class={`ghost-chip ${ghost.color === c ? 'selected' : ''}`}
            aria-label={c}
            aria-pressed={ghost.color === c}
            onClick={() => run(ctx, updateGhost({ color: c }))}
          >
            <GhostIcon color={c} size={36} />
          </button>
        ))}
      </div>
      <label class="switch-row">
        <input type="checkbox" checked={ghost.enabled} onChange={(e) => run(ctx, updateGhost({ enabled: e.currentTarget.checked }))} />
        <span>Ghost welcomes visitors</span>
      </label>
    </section>
  )
}
