/**
 * `dsh-codex-review` — host half.
 *
 * Registers one slash command (`/review` by default) that deterministically
 * sends the current change set to a reviewer subagent pinned to a configured
 * provider and model, and hands the review back to the session.
 *
 * Why a command rather than advice: DSH's router-style plugins inject a
 * recommendation that the main agent may ignore, and the model that wrote the
 * code is the worst judge of it. `/review` is the opposite — a human asks, the
 * service is called directly, and the child cannot be the same model by
 * accident. The pinned route is what makes it work on a ChatGPT subscription
 * (`openai-codex`) instead of whatever the session happens to run on.
 *
 * Two reviewer lifetimes, chosen by `conversation`:
 *
 * - `shared` (default) — one *continuable* child per parent session, found again
 *   through the durable child catalog and handed every later review. The child's
 *   turn answers into this session as a message, so the review lands in the
 *   conversation instead of in a command result that no model ever sees, and the
 *   reviewer remembers the revisions it already reviewed. `sendMessage` on an
 *   absent child cold-resumes it from persistence, so the memory survives a host
 *   restart.
 * - `fresh` — a one-shot child per call, awaited and rendered as the command's
 *   own result: no memory, no residue.
 *
 * The plugin owns no LLM client and no credentials: it uses the host's
 * `subagents` service, so the child is a normal DSH agent with the normal tools,
 * permissions, and sandbox derived from the parent. Whatever authenticates the
 * pinned route — an OAuth grant, a key, a CLI login — stays that route's
 * business.
 *
 * @module dsh-codex-review
 */

import {
  PLUGIN_NAME,
  ROW_CONFIG_KEY,
  SETTINGS_NAMESPACE,
  resolveConfig,
} from "./config.mjs";
import { Config, installSettings, readConfig } from "./src/host/index.js";
import {
  buildFollowupPrompt,
  buildPrompt,
  clampText,
  flattenOutput,
  messageOf,
  renderFailure,
} from "./review.mjs";

export const name = PLUGIN_NAME;

/**
 * The services this plugin needs. The command registry must exist before the row
 * applies; the subagent service is required to run a review at all.
 */
export const inject = ["commands", "subagents"];

/**
 * The row schema. The loader reads `Config` from the plugin's host entry —
 * exporting it is what gives the row a settings section the Plugins page can
 * render, and what makes an edit reach the next review without a restart.
 */
export { Config, ROW_CONFIG_KEY, SETTINGS_NAMESPACE };

/**
 * Register the configured command for every composed human-command adapter.
 *
 * The configuration is re-resolved on every invocation rather than captured
 * once: with a volatile schema each field is a live accessor, so a settings edit
 * is picked up by the next `/review` instead of the next host restart.
 *
 * @param ctx - host context carrying `commands`, `subagents`, and `logger`.
 * @param input - the row's raw `config`.
 */
export function apply(ctx, input = {}) {
  const base = input ?? {};
  const logger = ctx.logger ?? console;
  /** The current live row input: the raw patch config, or the section's own object. */
  let live = base;
  const currentConfig = () => resolveConfig(readConfig(live));

  // 0.1.5 registers the settings section imperatively and hands back the fully
  // resolved configuration on every edit; 0.1.7 has no such seam because the row
  // Config above is already the section.
  installSettings(ctx, {
    baseInput: base,
    resolveConfig,
    logger,
    setSource: (source) => {
      live = source();
    },
  });

  const initial = currentConfig();
  ctx.commands.register({
    name: initial.command,
    description: initial.description,
    input: { hint: initial.inputHint },
    handler: (invocation) => runReview(ctx, currentConfig(), invocation, logger),
  });
  logger.info?.(
    `${PLUGIN_NAME}: /${initial.command} reviews with ${initial.provider}/${initial.model}`
    + ` via the "${initial.backend}" subagent backend (${initial.conversation} reviewer session)`,
  );
}

/** The label every reviewer child of this command carries in the child catalog. */
export const REVIEW_LABEL = "reviewer";

/**
 * Find this session's resident reviewer child, if it has one.
 *
 * The child catalog is durable and needs no Agent resume to read, so this works
 * after a host restart — which is exactly when the reviewer's memory has to be
 * found again rather than recreated.
 *
 * @param ctx - host context.
 * @param invocation - the command invocation.
 * @param logger - the host logger.
 * @returns the catalog row, or undefined.
 */
async function findReviewerChild(ctx, invocation, logger) {
  const parentId = invocation?.agent?.session?.id;
  if (typeof parentId !== "string" || typeof ctx.subagents?.listChildren !== "function") return undefined;
  try {
    const listed = await ctx.subagents.listChildren(parentId, invocation.signal);
    const rows = Array.isArray(listed) ? listed : [];
    // Only continuable rows: a one-shot child from `conversation: fresh` may wear
    // the same label, and it has no inbox to continue.
    const mine = rows.filter((row) => row && row.mode === "continuable" && row.label === REVIEW_LABEL);
    return mine.length > 0 ? mine[mine.length - 1] : undefined;
  } catch (error) {
    // A catalog that cannot be read is not a reason to refuse the review; the
    // worst case is that a second reviewer session is created.
    logger?.warn?.(`${PLUGIN_NAME}: could not read the reviewer catalog: ${messageOf(error)}`);
    return undefined;
  }
}

/** The durable child id inside one catalog row (the field name is the catalog's). */
function childIdOf(row) {
  return row?.childId ?? row?.id ?? row?.sessionId;
}

/**
 * Run one review: route it to the shared reviewer session, or to a fresh child.
 *
 * @param ctx - host context.
 * @param config - resolved configuration.
 * @param invocation - the command invocation (`agent`, `rawInput`, `signal`).
 * @param logger - the host logger.
 * @returns a `CommandResult`.
 */
export async function runReview(ctx, config, invocation, logger = console) {
  const focus = typeof invocation.rawInput === "string" ? invocation.rawInput.trim() : "";
  // `startContinuable` takes `label`/`signal` at the top level and omits them
  // from `request`, while `start(name, request)` takes both inside it — hence two
  // shapes rather than one.
  const base = {
    prompt: [{ type: "text", text: buildPrompt(config, focus) }],
    parent: invocation.agent,
    agentOptions: {
      provider: config.provider,
      model: config.model,
      ...(config.reasoningEffort === null ? {} : { reasoningEffort: config.reasoningEffort }),
    },
    ...(config.childMaxDepth === null ? {} : { maxDepth: config.childMaxDepth }),
    ...(config.persona === null ? {} : { persona: config.persona }),
  };
  if (config.conversation === "shared") return runShared(ctx, config, invocation, base, focus, logger);
  return runOneShot(
    ctx,
    config,
    invocation,
    { ...base, label: REVIEW_LABEL, signal: invocation.signal },
    logger,
  );
}

/**
 * Continue (or open) this session's reviewer conversation.
 *
 * The child answers into the session, so the command's own result is a receipt:
 * saying "the review is running" is honest, whereas waiting for the child's
 * message here and printing it would put the review in a command result the
 * model never sees.
 *
 * @param ctx - host context.
 * @param config - resolved configuration.
 * @param invocation - the command invocation.
 * @param request - the `SubagentStartRequest` for a NEW reviewer.
 * @param focus - the raw focus text.
 * @param logger - the host logger.
 * @returns a `CommandResult` receipt.
 */
async function runShared(ctx, config, invocation, request, focus, logger) {
  const route = `${config.provider}/${config.model}`;
  const existing = await findReviewerChild(ctx, invocation, logger);
  const childId = childIdOf(existing);

  if (typeof childId === "string") {
    try {
      // A resident child takes the message at its next step boundary; an idle one
      // starts a turn; one that is gone after a restart is resumed from its own
      // durable session — which is why this is the whole of the memory.
      await ctx.subagents.sendMessage(
        invocation.agent,
        childId,
        [{ type: "text", text: buildFollowupPrompt(config, focus) }],
        { signal: invocation.signal },
      );
      logger.info?.(`${PLUGIN_NAME}: review sent to the existing reviewer session ${childId}`);
      return {
        kind: "success",
        text: `Sent to the reviewer session for this chat (${childId}, ${route}).`
          + " It answers in this conversation and remembers the earlier reviews.",
      };
    } catch (error) {
      logger.warn?.(`${PLUGIN_NAME}: could not continue reviewer ${childId}: ${messageOf(error)}`);
      return {
        kind: "error",
        text: `The reviewer session ${childId} could not be continued on ${route}: ${messageOf(error)}`,
      };
    }
  }

  try {
    const started = await ctx.subagents.startContinuable({
      provider: config.backend,
      label: REVIEW_LABEL,
      request,
      signal: invocation.signal,
    });
    const startedId = typeof started === "string" ? started : childIdOf(started);
    logger.info?.(`${PLUGIN_NAME}: opened reviewer session ${String(startedId)} on ${route}`);
    return {
      kind: "success",
      text: `Reviewer session opened for this chat (${String(startedId)}, ${route}).`
        + " It answers in this conversation; every later /review continues the same reviewer.",
    };
  } catch (error) {
    logger.warn?.(`${PLUGIN_NAME}: could not open the reviewer session: ${messageOf(error)}`);
    return {
      kind: "error",
      text: `The reviewer could not start on ${route} via the "${config.backend}" backend: ${messageOf(error)}`,
    };
  }
}

/**
 * Run a fresh, one-shot reviewer and render its report as the command's result.
 *
 * The child is always disposed, including on the failure paths — it owns a
 * session and a slot in the pool, and leaking one per `/review` would be a slow
 * leak the user never sees.
 *
 * @param ctx - host context.
 * @param config - resolved configuration.
 * @param invocation - the command invocation.
 * @param request - the `SubagentStartRequest`.
 * @param logger - the host logger.
 * @returns a `CommandResult`.
 */
async function runOneShot(ctx, config, invocation, request, logger) {
  let run;
  try {
    run = await ctx.subagents.start(config.backend, request);
  } catch (error) {
    logger.warn?.(`${PLUGIN_NAME}: could not start the reviewer: ${messageOf(error)}`);
    return {
      kind: "error",
      text: `Review could not start on ${config.provider}/${config.model}`
        + ` via the "${config.backend}" backend: ${messageOf(error)}`,
    };
  }

  try {
    const result = await run.result;
    const text = clampText(flattenOutput(result?.output), config.maxOutputChars);
    if (result?.stopReason !== "completed") {
      logger.warn?.(`${PLUGIN_NAME}: reviewer stopped with ${String(result?.stopReason)}`);
      return { kind: "error", text: renderFailure(result, text) };
    }
    if (text.length === 0) return { kind: "error", text: "The reviewer returned no text." };
    return { kind: "success", text };
  } catch (error) {
    return { kind: "error", text: `Review failed: ${messageOf(error)}` };
  } finally {
    try {
      await run.dispose();
    } catch (error) {
      logger.warn?.(`${PLUGIN_NAME}: disposing the reviewer failed: ${messageOf(error)}`);
    }
  }
}
