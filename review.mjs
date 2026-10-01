/**
 * `dsh-codex-review` — prompt construction and result rendering.
 *
 * Kept free of any DSH import so it is testable in isolation: the plugin's only
 * runtime dependency is the host's own service context.
 *
 * The reviewer is a *fresh* child (the `spawn` backend starts with an empty
 * conversation), so the prompt must stand alone. What it deliberately does not
 * carry is the parent's reasoning: the value of a second model is that it sees
 * the artifact, not the argument that produced it.
 *
 * @module dsh-codex-review/review
 */

/**
 * Build the reviewer's prompt. The child inherits the parent's working
 * directory, so the prompt refers to the repository rather than naming a path.
 *
 * @param config - resolved configuration.
 * @param focus - the raw text typed after `/review` (may be empty).
 * @returns the prompt text.
 */
export function buildPrompt(config, focus) {
  const lines = [];
  lines.push(config.instruction);
  lines.push("");
  lines.push("You are running in the repository that was just changed, with the same tools the");
  lines.push("implementing agent had. Establish the change set first:");
  if (config.statusCommand) lines.push(`  ${config.statusCommand}`);
  if (config.diffCommand) lines.push(`  ${config.diffCommand}`);
  lines.push("Then read the changed files in full before judging them; a diff hides the context");
  lines.push("that decides whether a change is correct.");
  lines.push("");
  if (focus) {
    lines.push("The user asked you to focus on:");
    lines.push(focus);
  } else {
    lines.push("The user asked for a review of the current change set as a whole.");
  }
  lines.push("");
  lines.push("Report in this order, and keep it tight:");
  lines.push("1. Blockers — correctness, data loss, security, broken contracts. Give file:line and a");
  lines.push("   concrete failure scenario, or omit this section entirely.");
  lines.push("2. Real risks — things that will bite later, with the scenario that makes them bite.");
  lines.push("3. Smaller issues — naming, structure, tests, docs.");
  lines.push("4. What you verified, and what you could not verify from here.");
  lines.push("");
  lines.push("Be specific: every claim names a file and a line. Do not restate the diff, do not");
  lines.push("praise, and do not propose a rewrite. If the change is sound, say so in one line.");
  return lines.join("\n");
}

/**
 * Build the prompt for a review that continues an earlier one in the same
 * reviewer session.
 *
 * The child already carries the standing instruction and the earlier report, so
 * this is deliberately shorter than {@link buildPrompt} — and it asks for the one
 * thing a fresh reviewer could never give: what moved since last time.
 *
 * @param config - resolved configuration.
 * @param focus - the raw text typed after `/review` (may be empty).
 * @returns the prompt text.
 */
export function buildFollowupPrompt(config, focus) {
  const lines = [];
  lines.push("Review the current change set again, in the same role as before.");
  lines.push("");
  lines.push("Re-establish the change set first; the working tree has moved since your last review:");
  if (config.statusCommand) lines.push(`  ${config.statusCommand}`);
  if (config.diffCommand) lines.push(`  ${config.diffCommand}`);
  lines.push("Then read the changed files in full before judging them.");
  lines.push("");
  if (focus) {
    lines.push("The user asked you to focus on:");
    lines.push(focus);
  } else {
    lines.push("The user asked for a review of the current change set as a whole.");
  }
  lines.push("");
  lines.push("You reviewed this repository earlier in this session, so the report must say what is");
  lines.push("new: open with what changed since your previous review (fixed, still open, newly");
  lines.push("introduced, no longer reachable), then give any new findings in the usual order.");
  lines.push("Do not repeat a finding that is unchanged except to confirm it is still open, and do");
  lines.push("not re-derive what you already established.");
  return lines.join("\n");
}

/**
 * Join the text blocks of a child result into one string.
 * @param output - the result's content blocks.
 * @returns the concatenated text ("" when there is none).
 */
export function flattenOutput(output) {
  if (!Array.isArray(output)) return "";
  return output
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

/**
 * Render a non-`completed` reviewer run as a command error.
 * @param result - the child result.
 * @param text - any partial text the child produced.
 * @returns the error text.
 */
export function renderFailure(result, text) {
  const reason = result?.stopReason ?? "unknown";
  const detail = typeof result?.diagnostic === "string" && result.diagnostic.length > 0
    ? `: ${result.diagnostic}`
    : "";
  const partial = text.length > 0 ? `\n\nPartial review:\n${text}` : "";
  return `The reviewer stopped with "${reason}"${detail}.${partial}`;
}

/**
 * Cut an over-long review at the cap, saying so rather than silently truncating.
 * @param text - the review text.
 * @param max - the cap in characters.
 * @returns the text to hand back.
 */
export function clampText(text, max) {
  if (typeof text !== "string" || text.length <= max) return text ?? "";
  return `${text.slice(0, max)}\n\n[review truncated at ${max} characters — see the child session for the rest]`;
}

/** A message from an unknown thrown value. */
export function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
