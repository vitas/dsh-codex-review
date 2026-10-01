/**
 * `dsh-codex-review` — configuration resolution.
 *
 * The single configuration source is the plugin row's `config` (the bundle
 * patch ships defaults; the user's profile patch addresses the same row by id).
 * There is no settings-card schema: like the deeper policy in
 * `dsh-jev-subagent-dispatch`, everything here lives in the patch file, which
 * is where a reviewer's routing and prompt belong.
 *
 * The two fields that matter are `provider` and `model`: they are the LLM route
 * the child is pinned to (through `agentOptions`), and they are deliberately
 * NOT the session's own route — the whole point of `/review` is that the
 * reviewer is a different model from the one that wrote the code.
 *
 * @module dsh-codex-review/config
 */

export const PLUGIN_NAME = "codex-review";

/** The reviewer's standing instruction. Overridable per profile row. */
export const DEFAULT_INSTRUCTION = [
  "You are a delegated code reviewer. You did not write this code and you must not change it.",
  "Establish what changed, then read the changed files in full — not only the diff hunks.",
  "Judge the change against what it claims to do, not against what you would have written.",
].join(" ");

export const DEFAULTS = {
  /** Subagent backend name registered with `ctx.subagents` (spawn|fork|codex|…). */
  backend: "spawn",
  /** LLM route the child is pinned to. `openai-codex` is the subscription route. */
  provider: "openai-codex",
  /** Model id on that route. */
  model: "gpt-5.6-sol",
  /** Reasoning effort for the child, or null to let the route decide. */
  reasoningEffort: null,
  /**
   * Depth cap handed to the child (0 = the reviewer may not delegate further),
   * or null to send no `maxDepth` at all — backends that do not advertise the
   * `depthLimit` capability reject the request outright, so null is the safe
   * default for third-party backends.
   */
  childMaxDepth: null,
  /** Optional per-child persona text (requires the backend's `persona` capability). */
  persona: null,
  command: "review",
  description: "Review the current change set with the pinned reviewer model",
  inputHint: "[focus — files, area, or the question you want answered]",
  instruction: DEFAULT_INSTRUCTION,
  /** Commands the reviewer is told to run first. Set either to null to omit. */
  diffCommand: "git --no-pager diff HEAD",
  statusCommand: "git --no-pager status --short",
  /** Hard cap on the review text handed back to the session. */
  maxOutputChars: 40000,
};

/** Deep-merge plain objects; arrays and scalars replace. */
export function mergeDefaults(defaults, input) {
  if (input === undefined || input === null) return structuredClone(defaults);
  if (typeof defaults !== "object" || defaults === null || Array.isArray(defaults)
    || typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const out = { ...defaults };
  for (const [key, value] of Object.entries(input)) {
    out[key] = key in defaults ? mergeDefaults(defaults[key], value) : value;
  }
  return out;
}

const COMMAND_PATTERN = /^[a-z][a-z0-9-]*$/;
const EFFORTS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function requiredString(config, field, where) {
  const value = config[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${where}: ${field} must be a non-empty string`);
  }
  return value;
}

/**
 * Validate a resolved configuration. Throws on the first structural problem: a
 * misconfigured reviewer must fail when the row loads, not when someone types
 * `/review` and waits a minute for nothing.
 *
 * @param config - merged configuration.
 * @returns the same object, validated.
 */
export function validate(config) {
  const where = `${PLUGIN_NAME} config`;
  requiredString(config, "backend", where);
  requiredString(config, "provider", where);
  requiredString(config, "model", where);
  requiredString(config, "instruction", where);
  if (typeof config.command !== "string" || !COMMAND_PATTERN.test(config.command)) {
    throw new Error(`${where}: command must match ${COMMAND_PATTERN} (it becomes a /slash-command)`);
  }
  if (typeof config.description !== "string" || config.description.length === 0) {
    throw new Error(`${where}: description must be a non-empty string`);
  }
  if (config.reasoningEffort !== null && !EFFORTS.has(config.reasoningEffort)) {
    throw new Error(`${where}: reasoningEffort must be null or one of ${[...EFFORTS].join(", ")}`);
  }
  if (config.childMaxDepth !== null && (!Number.isInteger(config.childMaxDepth) || config.childMaxDepth < 0)) {
    throw new Error(`${where}: childMaxDepth must be null or an integer >= 0`);
  }
  for (const field of ["diffCommand", "statusCommand"]) {
    const value = config[field];
    if (value !== null && (typeof value !== "string" || value.trim().length === 0)) {
      throw new Error(`${where}: ${field} must be null or a non-empty string`);
    }
  }
  if (!Number.isFinite(config.maxOutputChars) || config.maxOutputChars < 500) {
    throw new Error(`${where}: maxOutputChars must be a number >= 500`);
  }
  if (config.persona !== null && typeof config.persona !== "string") {
    throw new Error(`${where}: persona must be null or a string`);
  }
  return config;
}

/**
 * Merge the row config over the defaults and validate.
 * @param input - the cordis row config (may be undefined).
 * @returns validated, fully-populated configuration.
 */
export function resolveConfig(input = {}) {
  return validate(mergeDefaults(DEFAULTS, input ?? {}));
}
