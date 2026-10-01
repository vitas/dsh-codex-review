/**
 * The reviewer's configuration card for the Plugins page.
 *
 * Every field the card draws is also a field of the row schema
 * (`src/host/index.js`), so the generic form the page renders from that schema
 * still has a free-text input for it: the selects below are a convenience, not
 * a closed set. That matters for `model` in particular — which models a
 * subscription account may actually call is the account's business, not
 * something this plugin can enumerate, so a model outside the list is always
 * still reachable.
 *
 * Writes go through the scope (`set`/`unset`), which the host projects into the
 * row config; a rejected value is dropped by the host and the previous good
 * configuration stays in force, so the card never has to roll anything back.
 *
 * @module dsh-codex-review/src/client/SettingsCard
 */
import * as React from 'react'
import { CONVERSATIONS, DEFAULTS, EFFORTS } from '../../config.mjs'

/** The fields this card draws. `""` for effort means "let the route decide". */
type CardValue = {
  provider?: string
  model?: string
  conversation?: string
  reasoningEffort?: string
  command?: string
}

/** The slice of the settings scope this card uses (framework-shaped, not imported). */
export type SettingsScope = {
  getSnapshot?: () => { status?: string; value?: unknown; user?: unknown; writable?: boolean }
  subscribe?: (listener: () => void) => unknown
  set: (field: string, value: unknown) => Promise<unknown>
  unset: (field: string) => Promise<unknown>
}

/** One provider/model pair, as the Subagent allowlist namespace reports them. */
type AllowModel = { provider?: string; model?: string }

/** One route group in the running composition's model catalog. */
type ModelGroup = { id?: string; name?: string; models?: Array<{ id?: string; name?: string }> }

/**
 * Models to offer for a route when nothing else can be enumerated.
 *
 * `openai-codex` is the subscription route, and these are the ids the account
 * plugin registers (its own list, not a catalog this plugin can read). They are
 * suggestions: the picker always keeps the configured value, and the generic
 * form accepts anything.
 */
const CODEX_MODELS = [
  'gpt-6.1-sol',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-6-astra',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex-spark',
]

/** Route names offered for `provider` (free text always wins over this list). */
const ROUTE_SUGGESTIONS = ['openai-codex', 'openrouter', 'deepseek']

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }
const hintStyle: React.CSSProperties = { margin: '4px 0 0', fontSize: 11, opacity: 0.65, lineHeight: 1.45 }
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border, #0003)',
  background: 'var(--dsw-alias-bg, transparent)',
  color: 'inherit',
  fontFamily: 'inherit',
}
const resetStyle: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 10,
  fontWeight: 400,
  border: 'none',
  background: 'none',
  color: 'var(--dsw-alias-text-accent, #69f)',
  cursor: 'pointer',
  padding: 0,
}

/** Unwrap a scope snapshot into `{value, user, status, writable}`. */
function useScopeSnapshot(scope: SettingsScope | undefined) {
  const read = React.useCallback(() => {
    try {
      return scope?.getSnapshot?.() ?? { status: 'unavailable' as const }
    } catch {
      return { status: 'unavailable' as const }
    }
  }, [scope])
  const [snap, setSnap] = React.useState(read)
  React.useEffect(() => {
    setSnap(read())
    if (typeof scope?.subscribe !== 'function') return undefined
    try {
      const unsubscribe = scope.subscribe(() => setSnap(read()))
      return () => {
        void unsubscribe
      }
    } catch {
      return undefined
    }
  }, [scope, read])
  return snap
}

/** The provider/model pairs the Subagent allowlist serves, if that plugin is composed. */
function allowlistModels(snapshot: { value?: unknown }): AllowModel[] {
  const entries = (snapshot.value as { allowedModels?: AllowModel[] } | undefined)?.allowedModels
  return Array.isArray(entries) ? entries.filter((entry) => entry?.provider && entry?.model) : []
}

/** A labelled row with an optional "this comes from the patch" reset chip. */
function Row(props: {
  id: string
  label: string
  hint?: string
  overridden?: boolean
  disabled?: boolean
  onReset?: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
        {props.overridden && (
          <span style={{ ...labelStyle, display: 'inline', marginLeft: 8, fontSize: 10, fontWeight: 400, opacity: 0.8 }}>
            set in the patch
            <button type="button" style={resetStyle} onClick={props.onReset} disabled={props.disabled}>
              reset
            </button>
          </span>
        )}
      </label>
      {props.children}
      {props.hint && <p style={hintStyle}>{props.hint}</p>}
    </div>
  )
}

/**
 * Model picker: a select of everything we can enumerate, plus "other…", which
 * swaps in a text input. The configured value is always an option, so opening
 * the card never silently reselects a model.
 */
function ModelPicker(props: {
  id: string
  value: string
  options: string[]
  disabled?: boolean
  onChange: (next: string) => void
}) {
  const options = props.options.includes(props.value) || props.value === ''
    ? props.options
    : [props.value, ...props.options]
  const [custom, setCustom] = React.useState(false)
  const showText = custom || (props.value !== '' && !props.options.includes(props.value))
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {showText ? (
        <>
          <input
            id={props.id}
            style={inputStyle}
            value={props.value}
            disabled={props.disabled}
            spellCheck={false}
            onChange={(event) => props.onChange(event.target.value.trim())}
          />
          <button type="button" style={{ ...resetStyle, marginLeft: 0 }} onClick={() => setCustom(false)} disabled={props.disabled}>
            list
          </button>
        </>
      ) : (
        <select
          id={props.id}
          style={inputStyle}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => {
            if (event.target.value === '') setCustom(true)
            else props.onChange(event.target.value)
          }}
        >
          {options.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
          <option value="">other…</option>
        </select>
      )}
    </div>
  )
}

/**
 * The card itself.
 *
 * @param props.scope - this plugin's settings scope (the row config).
 * @param props.allowlist - the Subagent allowlist scope, used only to widen the
 *   model suggestions; absent when that plugin is not composed.
 * @param props.catalog - the running composition's model catalog (route groups
 *   with their models, including whatever a route plugin registered at boot).
 * @param props.heading - whether to draw the card's own title. The Plugins page
 *   draws the row's title around the form, so it passes `false`.
 */
export function ReviewSettingsCard(props: {
  scope: SettingsScope
  allowlist?: SettingsScope
  catalog?: () => Promise<unknown>
  heading?: boolean
}) {
  const snap = useScopeSnapshot(props.scope)
  const allowSnap = useScopeSnapshot(props.allowlist)
  const [groups, setGroups] = React.useState<ModelGroup[]>([])
  const [pending, setPending] = React.useState(0)
  const value = (snap.value ?? {}) as CardValue
  const status = snap.status ?? 'loading'
  const disabled = status !== 'ready' || snap.writable === false
  const showHeading = props.heading !== false

  // The catalog answers once per mount: it describes the composition, not the
  // row, so nothing here can change it. Deliberately empty deps — the fetcher is
  // a fresh closure on every render, and re-running would loop through setState.
  React.useEffect(() => {
    let live = true
    Promise.resolve()
      .then(() => props.catalog?.())
      .then((catalog) => {
        if (!live || catalog === undefined || catalog === null) return
        const listed = (catalog as { groups?: ModelGroup[] }).groups
        if (Array.isArray(listed) && listed.length > 0) setGroups(listed)
      })
      .catch(() => {
        // A catalog that cannot be read is not an error: the static suggestions
        // and the free-text field still describe a usable configuration.
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = React.useCallback((field: string, next: unknown) => {
    setPending((n) => n + 1)
    void props.scope.set(field, next).catch(() => {}).finally(() => setPending((n) => n - 1))
  }, [props.scope])
  const reset = React.useCallback((field: string) => {
    setPending((n) => n + 1)
    void props.scope.unset(field).catch(() => {}).finally(() => setPending((n) => n - 1))
  }, [props.scope])

  // A field shows its reset chip when the patch (the base layer) sets it.
  const overridden = (field: string) => (snap.user as Record<string, unknown> | undefined)?.[field] !== undefined

  const provider = value.provider ?? DEFAULTS.provider
  const model = value.model ?? DEFAULTS.model
  const conversation = value.conversation ?? DEFAULTS.conversation
  const effort = value.reasoningEffort ?? ''

  const modelOptions = React.useMemo(() => {
    // Live catalog first: it is the only source that knows which models this
    // composition actually serves, including the ones a route plugin registered
    // at boot (a subscription route, for instance).
    const fromCatalog = groups
      .filter((group) => group.id === provider)
      .flatMap((group) => (group.models ?? []).map((entry) => entry.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    const fromAllowlist = allowlistModels(allowSnap as { value?: unknown })
      .filter((entry) => entry.provider === provider)
      .map((entry) => entry.model as string)
    const base = provider === 'openai-codex' ? CODEX_MODELS : []
    return [...new Set([...fromCatalog, ...fromAllowlist, ...base])]
  }, [groups, allowSnap, provider])

  if (status === 'loading') return showHeading ? <p style={hintStyle}>Loading the reviewer settings…</p> : null
  if (status === 'unavailable') {
    return <p style={hintStyle}>This deployment does not serve the reviewer settings section.</p>
  }

  return (
    <div style={{ fontSize: 12, opacity: pending > 0 ? 0.7 : 1 }}>
      {showHeading && (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Codex review</h3>
          <p style={{ ...hintStyle, marginBottom: 12 }}>
            `/review` delegates to a child on the route below, so the reviewer is a different model
            from the one that wrote the code.
          </p>
        </>
      )}

      <Row
        id="codex-review-provider"
        label="Route"
        hint="LLM provider the reviewer child is pinned to. The subscription route is openai-codex (installed by dsh-codex-auth from your Codex CLI login)."
        overridden={overridden('provider')}
        disabled={disabled}
        onReset={() => reset('provider')}
      >
        <input
          id="codex-review-provider"
          style={inputStyle}
          list="codex-review-provider-list"
          value={provider}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => commit('provider', event.target.value.trim())}
        />
        <datalist id="codex-review-provider-list">
          {ROUTE_SUGGESTIONS.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </Row>

      <Row
        id="codex-review-model"
        label="Reviewer model"
        hint="Any model id the route accepts. The list is the running composition's catalog for this route, plus the account's Codex ids; “other…” takes a typed id."
        overridden={overridden('model')}
        disabled={disabled}
        onReset={() => reset('model')}
      >
        <ModelPicker
          id="codex-review-model"
          value={model}
          options={modelOptions}
          disabled={disabled}
          onChange={(next) => commit('model', next)}
        />
      </Row>

      <Row
        id="codex-review-conversation"
        label="Reviewer memory"
        hint="Shared keeps one reviewer session per chat, so later reviews remember what was already flagged. Fresh starts a new reviewer each time."
        overridden={overridden('conversation')}
        disabled={disabled}
        onReset={() => reset('conversation')}
      >
        <select
          id="codex-review-conversation"
          style={inputStyle}
          value={conversation}
          disabled={disabled}
          onChange={(event) => commit('conversation', event.target.value)}
        >
          {CONVERSATIONS.map((id) => (
            <option key={id} value={id}>
              {id === 'shared' ? 'shared — one reviewer session, remembers past reviews' : 'fresh — a new reviewer per review'}
            </option>
          ))}
        </select>
      </Row>

      <Row
        id="codex-review-effort"
        label="Reasoning effort"
        hint="How hard the reviewer is asked to think. “route default” sends no effort at all."
        overridden={overridden('reasoningEffort')}
        disabled={disabled}
        onReset={() => reset('reasoningEffort')}
      >
        <select
          id="codex-review-effort"
          style={inputStyle}
          value={effort}
          disabled={disabled}
          onChange={(event) => commit('reasoningEffort', event.target.value)}
        >
          <option value="">route default</option>
          {EFFORTS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </Row>

      <Row
        id="codex-review-command"
        label="Command name"
        hint="The slash command this row registers, without the slash."
        overridden={overridden('command')}
        disabled={disabled}
        onReset={() => reset('command')}
      >
        <input
          id="codex-review-command"
          style={inputStyle}
          value={value.command ?? DEFAULTS.command}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
            if (next.length > 0) commit('command', next)
          }}
        />
      </Row>
    </div>
  )
}
