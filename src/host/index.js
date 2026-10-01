/**
 * Host half of the settings surface: the row schema, and the two seam-shaped
 * helpers the rest of the plugin uses to read configuration.
 *
 * DSH 0.1.7 dropped `ctx.settings.installSection` and made a plugin's settings
 * section the Config of its own Loader row: the loader validates the row's
 * configuration against `Config` below and the settings service projects it into
 * a form the Plugins page renders — including a free-text field per schema
 * field, which is what keeps an unusual model id reachable even if the card's
 * select does not list it. Without a schema a row has no section and every user
 * override is rejected, so the plugin would silently keep the patch's values.
 *
 * 0.1.5 has no such convention, so `installSettings` still registers the same
 * fields imperatively and both versions stay configured.
 *
 * A card edit REPLACES the row config the patch inserted — the two layers do not
 * merge — so every field the patch may carry is declared here with the same
 * default `config.mjs` ships. Otherwise editing one field in the card would
 * reset the others to whatever the schema happens to say.
 *
 * @module dsh-codex-review/src/host
 */
import {
  CONVERSATIONS,
  DEFAULTS,
  EFFORTS,
  PACKAGE_NAME,
  PLUGIN_NAME,
  ROW_CONFIG_KEY,
  SETTINGS_NAMESPACE,
} from "../../config.mjs";

export { PACKAGE_NAME, PLUGIN_NAME, ROW_CONFIG_KEY, SETTINGS_NAMESPACE };

/** A fresh copy of the shipped defaults, so no two schema builds share mutable state. */
function shipped() {
  return structuredClone(DEFAULTS);
}

/**
 * Build the row schema, optionally marking every field volatile.
 *
 * `volatile` is what makes a settings edit reach the *next* `/review` without a
 * host restart: the loader then hands each field over as a live accessor, which
 * is why `readField`/`readConfig` exist below. The plain schema is the one the
 * imperative 0.1.5 seam takes (accessors would break it).
 *
 * @param z - the schemastery module.
 * @param volatile - mark every field `.volatile()`.
 * @returns the object schema.
 */
function makeSchema(z, volatile) {
  const mark = (schema) => (volatile && typeof schema.volatile === "function" ? schema.volatile() : schema);
  const d = shipped();
  return z.object({
    // --- card surface ----------------------------------------------------
    /** The LLM route the reviewer child is pinned to. */
    provider: mark(z.string().default(d.provider)),
    /** Model id on that route. */
    model: mark(z.string().default(d.model)),
    /** Whether the session keeps one reviewer child (memory) or starts a new one. */
    conversation: mark(z.union(CONVERSATIONS.map((id) => z.const(id))).default(d.conversation)),
    /** `""` means "let the route decide"; see `resolveConfig`. */
    reasoningEffort: mark(z.string().default("")),
    /** The slash-command name this row registers. */
    command: mark(z.string().default(d.command)),
    // --- patch surface, carried through a card edit -----------------------
    backend: mark(z.string().default(d.backend)),
    description: mark(z.string().default(d.description)),
    instruction: mark(z.string().default(d.instruction)),
    diffCommand: mark(z.any().default(d.diffCommand)),
    statusCommand: mark(z.any().default(d.statusCommand)),
    /**
     * `null` — the shape `resolveConfig` accepts for "send no maxDepth at all" —
     * cannot be a schema default (a union default does not materialise), and a
     * numeric default would be a lie for backends without the depthLimit
     * capability. It stays patch-only; the card does not draw it.
     */
    childMaxDepth: mark(z.any()),
    /** Same reasoning as `childMaxDepth`: patch-only, backend-dependent. */
    persona: mark(z.any()),
    maxOutputChars: mark(z.number().step(1).min(500).default(d.maxOutputChars)),
  });
}

/**
 * The two schemas, built once. Absent when schemastery does not resolve — a bare
 * checkout without the peer still composes, with the patch file as the only
 * configuration source and no settings form.
 *
 * @returns `{ settings, config }`: the plain schema the imperative 0.1.5 path
 *   registers, and the volatile one the loader exposes as this row's `Config`.
 */
async function buildSchemas() {
  try {
    const { default: z } = await import("@deepseek-ai/schemastery");
    return { settings: makeSchema(z, false), config: makeSchema(z, true) };
  } catch {
    return { settings: undefined, config: undefined };
  }
}

const SCHEMAS = await buildSchemas();

/** The volatile schema the loader exposes as this row's Config. */
export const Config = SCHEMAS.config;

/** The reasoning efforts the card offers, plus "route default". */
export const EFFORT_CHOICES = ["", ...EFFORTS];

/**
 * Read one resolved config field.
 *
 * DSH 0.1.7 hands a volatile field over as a live accessor rather than a value.
 * Reading that accessor as a scalar yields the accessor object itself, which
 * then looks like an absent field, so every option silently falls back to the
 * schema defaults and the user's own configuration never reaches the reviewer.
 * 0.1.5 hands over plain values, so this is a no-op there. Reading through the
 * accessor on every call is also what makes a settings edit reach the next
 * `/review` without a restart.
 *
 * @param value - one field of the loader-resolved config.
 * @returns the current value behind it.
 */
export function readField(value) {
  return value !== null && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
}

/** Project a whole resolved config through {@link readField}. */
export function readConfig(config) {
  if (config === null || typeof config !== "object") return {};
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, readField(value)]));
}

/**
 * Register the settings section on 0.1.5, where the seam still exists.
 *
 * DSH 0.1.7 replaced this seam: a plugin's settings section is now its own
 * Loader row's Config, which the loader already applied before `apply` ran, so
 * the missing method is the signal to stop rather than to register twice.
 *
 * @param ctx - host cordis context (the plugin context `apply` received).
 * @param options - `{ baseInput, resolveConfig, logger, setSource }`. `baseInput`
 *   is the RAW row input the framework starts the section from (so a section
 *   edit arrives merged over the base layer, keeping patch-only fields intact);
 *   `setSource` receives a function returning the fully resolved configuration
 *   the command should read next.
 * @returns a detach function, or null when the seam is unavailable.
 */
export function installSettings(ctx, options = {}) {
  if (typeof ctx?.inject !== "function") return null;
  const { baseInput, resolveConfig, logger, setSource } = options;
  let detach = null;
  try {
    ctx.inject(["settings"], (settingsCtx) => {
      if (typeof settingsCtx?.settings?.installSection !== "function") return;
      if (SCHEMAS.settings === undefined) return;
      const base = { ...(baseInput ?? {}) };
      settingsCtx.settings.installSection(ctx, PLUGIN_NAME, SCHEMAS.settings, base, {
        setSource: (source) => {
          let section;
          try {
            section = typeof source === "function" ? source() : source;
          } catch {
            return;
          }
          try {
            // Section over RAW BASE, never over resolved defaults: the section
            // carries only card fields, so merging it over the resolved config
            // would reset patch-only fields to their boot values.
            const next = resolveConfig({ ...base, ...readConfig(section) });
            setSource?.(() => next);
            logger?.info?.(`${PLUGIN_NAME}: settings updated from UI (${next.provider}/${next.model}, ${next.conversation})`);
          } catch (error) {
            // A rejected value keeps the previous good configuration.
            logger?.warn?.(`${PLUGIN_NAME}: UI config rejected, keeping previous: ${String(error?.message ?? error)}`);
          }
        },
        onChange: () => {},
      });
      detach = () => {};
    });
  } catch {
    return null;
  }
  return detach;
}
