import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULTS, resolveConfig } from "../config.mjs";
import { apply, runReview } from "../index.mjs";
import { buildPrompt, clampText, flattenOutput, renderFailure } from "../review.mjs";

/** A context that records what the plugin registered and how it spawned. */
function fakeContext({ start } = {}) {
  const registered = [];
  const calls = [];
  const warnings = [];
  const infos = [];
  return {
    registered,
    calls,
    warnings,
    infos,
    logger: {
      info: (line) => infos.push(line),
      warn: (line) => warnings.push(line),
    },
    commands: { register: (definition) => registered.push(definition) },
    subagents: {
      start: async (backend, request) => {
        calls.push({ backend, request });
        if (start) return start(backend, request);
        return {
          id: "child-1",
          localAgent: undefined,
          result: Promise.resolve({
            output: [{ type: "text", text: "Looks fine to me." }],
            stopReason: "completed",
          }),
          dispose: async () => { calls.push({ disposed: true }); },
        };
      },
    },
  };
}

function invocation(rawInput = "", overrides = {}) {
  return {
    commandId: "cmd-1",
    agent: { marker: "parent-agent" },
    rawInput,
    attachments: [],
    signal: new AbortController().signal,
    ...overrides,
  };
}

/**
 * The one-shot path is opt-in: `shared` is the shipped default, so a test that
 * wants the awaited child has to say so.
 */
function fresh(overrides = {}) {
  return resolveConfig({ conversation: "fresh", ...overrides });
}

test("registers one command with the configured name and hint", () => {
  const ctx = fakeContext();
  apply(ctx, { command: "critique", description: "critique it", inputHint: "[x]" });
  assert.equal(ctx.registered.length, 1);
  assert.equal(ctx.registered[0].name, "critique");
  assert.equal(ctx.registered[0].description, "critique it");
  assert.deepEqual(ctx.registered[0].input, { hint: "[x]" });
  assert.equal(typeof ctx.registered[0].handler, "function");
  assert.match(ctx.infos.join("\n"), /openai-codex\/gpt-5\.6-sol/);
});

test("spawns the pinned route on the configured backend", async () => {
  const ctx = fakeContext();
  const result = await runReview(ctx, fresh(), invocation("src/auth"));
  assert.equal(result.kind, "success");
  assert.equal(result.text, "Looks fine to me.");
  const [call] = ctx.calls;
  assert.equal(call.backend, "spawn");
  assert.deepEqual(call.request.agentOptions, { provider: "openai-codex", model: "gpt-5.6-sol" });
  assert.equal(call.request.parent.marker, "parent-agent");
  assert.equal(call.request.prompt[0].type, "text");
  assert.match(call.request.prompt[0].text, /src\/auth/);
  assert.equal(ctx.calls.some((entry) => entry.disposed === true), true);
});

test("a configured effort is passed through, null is not", async () => {
  const withEffort = fakeContext();
  await runReview(withEffort, fresh({ reasoningEffort: "high" }), invocation());
  assert.equal(withEffort.calls[0].request.agentOptions.reasoningEffort, "high");

  const withoutEffort = fakeContext();
  await runReview(withoutEffort, fresh(), invocation());
  assert.equal("reasoningEffort" in withoutEffort.calls[0].request.agentOptions, false);
});

test("maxDepth and persona are only sent when configured", async () => {
  const bare = fakeContext();
  await runReview(bare, fresh(), invocation());
  assert.equal("maxDepth" in bare.calls[0].request, false);
  assert.equal("persona" in bare.calls[0].request, false);

  const full = fakeContext();
  await runReview(full, fresh({ childMaxDepth: 0, persona: "You are terse." }), invocation());
  assert.equal(full.calls[0].request.maxDepth, 0);
  assert.equal(full.calls[0].request.persona, "You are terse.");
});

test("a start failure is reported, not thrown", async () => {
  const ctx = fakeContext({ start: async () => { throw new Error("provider not registered"); } });
  const result = await runReview(ctx, fresh(), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /could not start/i);
  assert.match(result.text, /provider not registered/);
});

test("a non-completed child becomes an error carrying partial text", async () => {
  const ctx = fakeContext({
    start: async () => ({
      id: "child-2",
      result: Promise.resolve({
        output: [{ type: "text", text: "half a review" }],
        stopReason: "max-tokens",
        diagnostic: "output limit reached",
      }),
      dispose: async () => {},
    }),
  });
  const result = await runReview(ctx, fresh(), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /max-tokens/);
  assert.match(result.text, /half a review/);
});

test("an empty review is an error rather than a silent success", async () => {
  const ctx = fakeContext({
    start: async () => ({
      id: "child-3",
      result: Promise.resolve({ output: [], stopReason: "completed" }),
      dispose: async () => {},
    }),
  });
  const result = await runReview(ctx, fresh(), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /no text/i);
});

test("the child is disposed even when the result rejects", async () => {
  let disposed = false;
  const ctx = fakeContext({
    start: async () => ({
      id: "child-4",
      result: Promise.reject(new Error("child crashed")),
      dispose: async () => { disposed = true; },
    }),
  });
  const result = await runReview(ctx, fresh(), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /child crashed/);
  assert.equal(disposed, true);
});

test("prompt carries the reviewer framing, the commands, and the focus", () => {
  const prompt = buildPrompt(resolveConfig({}), "src/host/index.js");
  assert.match(prompt, /delegated code reviewer/);
  assert.match(prompt, /git --no-pager status --short/);
  assert.match(prompt, /git --no-pager diff HEAD/);
  assert.match(prompt, /src\/host\/index\.js/);
  assert.match(prompt, /file:line/);

  const bare = buildPrompt(resolveConfig({}), "");
  assert.match(bare, /as a whole/);
});

test("output flattening keeps only text blocks", () => {
  assert.equal(flattenOutput([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }]), "a\n\nb");
  assert.equal(flattenOutput(undefined), "");
});

test("clamping says it clamped, and short text is untouched", () => {
  assert.equal(clampText("short", 500), "short");
  const long = clampText("x".repeat(900), 500);
  assert.match(long, /truncated at 500/);
});

test("renderFailure names the reason and any diagnostic", () => {
  assert.match(renderFailure({ stopReason: "error", diagnostic: "boom" }, ""), /"error": boom/);
  assert.match(renderFailure(undefined, ""), /unknown/);
});

test("configuration validation rejects nonsense at load time", () => {
  assert.throws(() => resolveConfig({ provider: "" }), /provider must be a non-empty string/);
  assert.throws(() => resolveConfig({ command: "Review" }), /command must match/);
  assert.throws(() => resolveConfig({ reasoningEffort: "ludicrous" }), /reasoningEffort must be null/);
  assert.throws(() => resolveConfig({ childMaxDepth: -1 }), /childMaxDepth must be null/);
  assert.throws(() => resolveConfig({ maxOutputChars: 10 }), /maxOutputChars must be a number >= 500/);
  assert.equal(resolveConfig({}).model, DEFAULTS.model);
  assert.equal(resolveConfig({ model: "gpt-6-sol" }).model, "gpt-6-sol");
});
