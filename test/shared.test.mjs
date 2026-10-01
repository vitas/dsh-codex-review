/**
 * The shared-reviewer path: one continuable child per session, found again
 * through the durable child catalog and handed every later review.
 *
 * These tests pin the contract the host actually offers (verified against
 * dsh-subagent 0.2.0-rc.2): `startContinuable` takes `label` and `signal` beside
 * `request`, the catalog row's field is `id` with a `mode` of `continuable`, and
 * `sendMessage` returns only an inbox message id — never the review.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { resolveConfig } from "../config.mjs";
import { REVIEW_LABEL, apply, isResetRequest, runReview } from "../index.mjs";
import { buildFollowupPrompt, buildPrompt } from "../review.mjs";

const PARENT = { session: { id: "parent-1" }, marker: "parent" };

/** A context shaped like the host's: catalog listing, delivery, and continuation. */
function sharedContext({ children = [], onList, onSend, onStart, onInterrupt } = {}) {
  const calls = { listed: [], sent: [], started: [], interrupted: [], warnings: [], infos: [] };
  const ctx = {
    logger: {
      info: (line) => calls.infos.push(String(line)),
      warn: (line) => calls.warnings.push(String(line)),
    },
    commands: { register: () => {} },
    subagents: {
      listChildren: async (parentId, signal) => {
        calls.listed.push({ parentId, signal });
        if (onList) return onList(parentId, signal);
        return children;
      },
      sendMessage: async (sender, targetId, content, options) => {
        calls.sent.push({ sender, targetId, content, options });
        if (onSend) return onSend(sender, targetId, content, options);
        return "inbox-1";
      },
      startContinuable: async (spec) => {
        calls.started.push(spec);
        if (onStart) return onStart(spec);
        return { childId: "child-9", messageId: "inbox-9" };
      },
      start: async () => {
        throw new Error("the one-shot backend must not be reached in shared mode");
      },
      interrupt: async (targetId, authority) => {
        calls.interrupted.push({ targetId, authority });
        if (onInterrupt) return onInterrupt(targetId, authority);
        return undefined;
      },
    },
  };
  return { ctx, calls };
}

function invocation(rawInput = "") {
  return {
    commandId: "cmd",
    agent: PARENT,
    rawInput,
    attachments: [],
    signal: new AbortController().signal,
  };
}

test("shared: opens one continuable child and returns a receipt, not the review", async () => {
  const { ctx, calls } = sharedContext();
  const result = await runReview(ctx, resolveConfig({}), invocation("src/auth"));
  assert.equal(result.kind, "success");
  assert.match(result.text, /child-9/);
  assert.match(result.text, /openai-codex\/gpt-5\.6-sol/);

  const [spec] = calls.started;
  assert.equal(spec.provider, "spawn");
  assert.equal(spec.label, REVIEW_LABEL);
  // The continuation spec carries these beside `request`, not inside it.
  assert.equal("label" in spec.request, false);
  assert.equal("signal" in spec.request, false);
  assert.deepEqual(spec.request.agentOptions, { provider: "openai-codex", model: "gpt-5.6-sol" });
  assert.equal(spec.request.parent, PARENT);
  assert.ok(spec.signal, "the caller's cancellation is passed beside the request, not inside it");
  assert.equal(calls.sent.length, 0);
});

test("shared: a later call continues the resident reviewer instead of opening a second one", async () => {
  const { ctx, calls } = sharedContext({
    children: [{ id: "child-9", mode: "continuable", label: REVIEW_LABEL, createdAt: 1 }],
  });
  const result = await runReview(ctx, resolveConfig({}), invocation("the new commit"));
  assert.equal(result.kind, "success");
  assert.match(result.text, /child-9/);
  assert.equal(calls.started.length, 0);

  const [sent] = calls.sent;
  assert.equal(sent.sender, PARENT);
  assert.equal(sent.targetId, "child-9");
  assert.match(sent.content[0].text, /since your previous review/);
  assert.match(sent.content[0].text, /the new commit/);
  assert.equal(calls.listed[0].parentId, "parent-1");
});

test("shared: a one-shot child wearing the same label is not continued", async () => {
  const { ctx, calls } = sharedContext({
    children: [{ id: "old", mode: "one-shot", label: REVIEW_LABEL }],
  });
  await runReview(ctx, resolveConfig({}), invocation());
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.started.length, 1);
});

test("shared: the newest continuable reviewer wins when several exist", async () => {
  const { ctx, calls } = sharedContext({
    children: [
      { id: "first", mode: "continuable", label: REVIEW_LABEL, createdAt: 1 },
      { id: "second", mode: "continuable", label: REVIEW_LABEL, createdAt: 2 },
    ],
  });
  await runReview(ctx, resolveConfig({}), invocation());
  assert.equal(calls.sent[0].targetId, "second");
});

test("shared: an unreadable catalog falls back to opening a reviewer", async () => {
  const { ctx, calls } = sharedContext({
    onList: () => {
      throw new Error("sessionQuery unavailable");
    },
  });
  const result = await runReview(ctx, resolveConfig({}), invocation(), ctx.logger);
  assert.equal(result.kind, "success");
  assert.equal(calls.started.length, 1);
  assert.match(calls.warnings.join("\n"), /could not read the reviewer catalog/);
});

test("shared: a lost reviewer session is reported, not swallowed", async () => {
  const { ctx } = sharedContext({
    children: [{ id: "child-9", mode: "continuable", label: REVIEW_LABEL }],
    onSend: () => {
      throw new Error("NOT_RESUMABLE");
    },
  });
  const result = await runReview(ctx, resolveConfig({}), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /child-9/);
  assert.match(result.text, /NOT_RESUMABLE/);
});

test("shared: a failed start is reported, not thrown", async () => {
  const { ctx } = sharedContext({
    onStart: () => {
      throw new Error("ACTIVATION_LIMIT_REACHED");
    },
  });
  const result = await runReview(ctx, resolveConfig({}), invocation());
  assert.equal(result.kind, "error");
  assert.match(result.text, /could not start/);
  assert.match(result.text, /ACTIVATION_LIMIT_REACHED/);
});

test("fresh: the other mode still runs and awaits a one-shot child", async () => {
  const { ctx, calls } = sharedContext();
  ctx.subagents.start = async (backend, request) => {
    calls.started.push({ backend, request });
    return {
      id: "c",
      result: Promise.resolve({ output: [{ type: "text", text: "ok" }], stopReason: "completed" }),
      dispose: async () => {},
    };
  };
  const result = await runReview(ctx, resolveConfig({ conversation: "fresh" }), invocation());
  assert.equal(result.text, "ok");
  assert.equal(calls.listed.length, 0);
});

test("the follow-up prompt is shorter than the first one and asks what moved", () => {
  const follow = buildFollowupPrompt(resolveConfig({}), "src/auth");
  assert.match(follow, /same role as before/);
  assert.match(follow, /since your previous review/);
  assert.match(follow, /git --no-pager diff HEAD/);
  assert.match(follow, /src\/auth/);
  assert.ok(follow.length < buildPrompt(resolveConfig({}), "src/auth").length);
});

test("apply re-resolves the live config on every invocation", async () => {
  // A volatile row hands each field over as an accessor; a settings edit moves
  // what that accessor returns, and the next review must see the new model.
  let model = "gpt-6-sol";
  const input = {
    provider: { get: () => "openai-codex" },
    model: { get: () => model },
    conversation: { get: () => "fresh" },
  };
  const registered = [];
  const requests = [];
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    commands: { register: (definition) => registered.push(definition) },
    subagents: {
      start: async (backend, request) => {
        requests.push(request);
        return {
          id: "c",
          result: Promise.resolve({ output: [{ type: "text", text: "ok" }], stopReason: "completed" }),
          dispose: async () => {},
        };
      },
    },
  };
  apply(ctx, input);
  await registered[0].handler(invocation());
  model = "gpt-5.6-sol";
  await registered[0].handler(invocation());
  assert.equal(requests[0].agentOptions.model, "gpt-6-sol");
  assert.equal(requests[1].agentOptions.model, "gpt-5.6-sol");
});

/** A parent session no other test shares, so reset state cannot leak between them. */
function otherParent(sessionId) {
  return { session: { id: sessionId }, marker: sessionId };
}

function invocationFor(agent, rawInput = "") {
  return { commandId: "cmd", agent, rawInput, attachments: [], signal: new AbortController().signal };
}

test("reset: only the whole input is a reset, not a focus that begins with the word", () => {
  assert.equal(isResetRequest("reset"), true);
  assert.equal(isResetRequest("  RESET "), true);
  assert.equal(isResetRequest("reset the cache"), false);
  assert.equal(isResetRequest(""), false);
});

test("reset: retires the resident reviewer, and the next review opens a fresh one", async () => {
  const parent = otherParent("parent-reset-a");
  const { ctx, calls } = sharedContext({
    children: [{ id: "old-child", mode: "continuable", label: REVIEW_LABEL, createdAt: 1 }],
  });

  const reset = await runReview(ctx, resolveConfig({}), invocationFor(parent, "reset"));
  assert.equal(reset.kind, "success");
  assert.match(reset.text, /old-child/);
  assert.match(reset.text, /retired/);
  assert.deepEqual(calls.interrupted.map((row) => row.targetId), ["old-child"]);
  assert.equal(calls.interrupted[0].authority, parent, "the interruption is authorised by the parent");

  // The catalog still lists the retired child — nothing deletes it — but the
  // next review must open a new reviewer instead of writing to it.
  await runReview(ctx, resolveConfig({}), invocationFor(parent, ""));
  assert.equal(calls.sent.length, 0, "the retired reviewer is never written to again");
  assert.equal(calls.started.length, 1, "a fresh reviewer is opened instead");
});

test("reset: with no resident reviewer it says so instead of opening one", async () => {
  const { ctx, calls } = sharedContext();
  const result = await runReview(ctx, resolveConfig({}), invocationFor(otherParent("parent-reset-b"), "reset"));
  assert.equal(result.kind, "success");
  assert.match(result.text, /no memory to clear/i);
  assert.equal(calls.started.length, 0);
  assert.equal(calls.interrupted.length, 0);
});

test("reset: a focus that merely starts with the word still reviews", async () => {
  const parent = otherParent("parent-reset-c");
  const { ctx, calls } = sharedContext();
  const result = await runReview(ctx, resolveConfig({}), invocationFor(parent, "reset the cache invalidation"));
  assert.equal(result.kind, "success");
  assert.equal(calls.interrupted.length, 0);
  assert.equal(calls.started.length, 1);
  assert.match(calls.started[0].request.prompt[0].text, /reset the cache invalidation/);
});

test("reset: a row with no shared reviewer has nothing to forget", async () => {
  const { ctx, calls } = sharedContext();
  const result = await runReview(
    ctx,
    resolveConfig({ conversation: "fresh" }),
    invocationFor(otherParent("parent-reset-d"), "reset"),
  );
  assert.match(result.text, /Nothing to reset/);
  assert.equal(calls.listed.length, 0, "no catalog read is needed when no memory exists");
});

test("reset: a reviewer that cannot be interrupted is still retired", async () => {
  const parent = otherParent("parent-reset-e");
  const { ctx, calls } = sharedContext({
    children: [{ id: "stuck", mode: "continuable", label: REVIEW_LABEL, createdAt: 1 }],
    onInterrupt: () => {
      throw new Error("NOT_RUNNING");
    },
  });
  const result = await runReview(ctx, resolveConfig({}), invocationFor(parent, "reset"), ctx.logger);
  assert.equal(result.kind, "success");
  assert.match(result.text, /retired/);
  assert.doesNotMatch(result.text, /and stopped/, "the receipt does not claim a stop that failed");
  assert.match(calls.warnings.join("\n"), /could not interrupt reviewer stuck/);

  await runReview(ctx, resolveConfig({}), invocationFor(parent, ""));
  assert.equal(calls.started.length, 1, "the written-off child is not continued");
});
