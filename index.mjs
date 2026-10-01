/**
 * `dsh-codex-review` — host half.
 *
 * Registers one slash command (`/review` by default) that deterministically
 * starts a reviewer subagent pinned to a configured provider and model, waits
 * for it, and hands its report back to the session.
 *
 * Why a command rather than advice: DSH's router-style plugins inject a
 * recommendation that the main agent may ignore, and the model that wrote the
 * code is the worst judge of it. `/review` is the opposite — a human asks, the
 * service is called directly, and the child cannot be the same model by
 * accident. The pinned route is what makes it work on a ChatGPT subscription
 * (`openai-codex`) instead of whatever the session happens to run on.
 *
 * The plugin owns no LLM client and no credentials: it uses the host's
 * `subagents` service, so the child is a normal DSH agent with the normal
 * tools, permissions, and sandbox derived from the parent. Whatever
 * authenticates the pinned route — an OAuth grant, a key, a CLI login — stays
 * that route's business.
 *
 * @module dsh-codex-review
 */

import { PLUGIN_NAME, resolveConfig } from "./config.mjs";
import { buildPrompt, clampText, flattenOutput, messageOf, renderFailure } from "./review.mjs";

export const name = PLUGIN_NAME;

/**
 * The services this plugin needs. The command registry must exist before the
 * row applies; the subagent service is required to run a review at all.
 */
export const inject = ["commands", "subagents"];

/**
 * Register the `/review` command for every composed human-command adapter.
 * @param ctx - host context carrying `commands`, `subagents`, and `logger`.
 * @param input - the row's `config`.
 */
export function apply(ctx, input = {}) {
  const config = resolveConfig(input);
  const logger = ctx.logger ?? console;
  ctx.commands.register({
    name: config.command,
    description: config.description,
    input: { hint: config.inputHint },
    handler: (invocation) => runReview(ctx, config, invocation, logger),
  });
  logger.info?.(
    `${PLUGIN_NAME}: /${config.command} reviews with ${config.provider}/${config.model}`
    + ` via the "${config.backend}" subagent backend`,
  );
}

/**
 * Run one review: start the pinned child, await it, render its report.
 *
 * The child is always disposed, including on the failure paths — it owns a
 * session and a slot in the continuable pool, and leaking one per `/review`
 * would be a slow leak the user never sees.
 *
 * @param ctx - host context.
 * @param config - resolved configuration.
 * @param invocation - the command invocation (`agent`, `rawInput`, `signal`).
 * @param logger - the host logger.
 * @returns a `CommandResult`.
 */
export async function runReview(ctx, config, invocation, logger = console) {
  const focus = typeof invocation.rawInput === "string" ? invocation.rawInput.trim() : "";
  const request = {
    label: focus.length > 0 ? `${config.command}: ${focus}`.slice(0, 120) : config.command,
    prompt: [{ type: "text", text: buildPrompt(config, focus) }],
    parent: invocation.agent,
    signal: invocation.signal,
    agentOptions: {
      provider: config.provider,
      model: config.model,
      ...(config.reasoningEffort === null ? {} : { reasoningEffort: config.reasoningEffort }),
    },
    ...(config.childMaxDepth === null ? {} : { maxDepth: config.childMaxDepth }),
    ...(config.persona === null ? {} : { persona: config.persona }),
  };

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
