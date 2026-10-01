/**
 * The host half of the settings surface: the row schema the Plugins page renders
 * and the accessor unwrapping that makes a card edit reach the next review.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { CONVERSATIONS, DEFAULTS, resolveConfig } from "../config.mjs";
import { Config, EFFORT_CHOICES, readConfig, readField } from "../src/host/index.js";

test("the row schema exists and materialises the shipped defaults", () => {
  assert.equal(typeof Config, "function");
  const value = readConfig(Config({}));
  assert.equal(value.provider, DEFAULTS.provider);
  assert.equal(value.model, DEFAULTS.model);
  assert.equal(value.conversation, DEFAULTS.conversation);
  assert.equal(value.command, DEFAULTS.command);
  assert.equal(value.maxOutputChars, DEFAULTS.maxOutputChars);
});

test("a schema value resolves into a full configuration", () => {
  const resolved = resolveConfig(readConfig(Config({ model: "gpt-6.1-sol", conversation: "fresh" })));
  assert.equal(resolved.model, "gpt-6.1-sol");
  assert.equal(resolved.conversation, "fresh");
  // A field the card does not draw still comes back with its schema default, so
  // a card edit cannot silently drop the reviewer's instruction.
  assert.equal(resolved.instruction, DEFAULTS.instruction);
  assert.equal(resolved.diffCommand, DEFAULTS.diffCommand);
});

test("the card's empty effort means the route decides", () => {
  assert.equal(resolveConfig(readConfig(Config({ reasoningEffort: "" }))).reasoningEffort, null);
  assert.equal(resolveConfig(readConfig(Config({ reasoningEffort: "high" }))).reasoningEffort, "high");
  assert.equal(EFFORT_CHOICES[0], "");
});

test("the schema refuses a mode outside the union", () => {
  assert.throws(() => Config({ conversation: "sometimes" }));
  assert.deepEqual(CONVERSATIONS, ["shared", "fresh"]);
});

test("readField unwraps an accessor and leaves a plain value alone", () => {
  assert.equal(readField({ get: () => "x" }), "x");
  assert.equal(readField("x"), "x");
  assert.equal(readField(undefined), undefined);
  assert.deepEqual(readConfig({ a: { get: () => 1 }, b: 2 }), { a: 1, b: 2 });
});

test("a card edit that only carries drawn fields stays valid", () => {
  // What the settings service hands back after a card edit: the drawn fields.
  const resolved = resolveConfig({ provider: "openai-codex", model: "gpt-6.1-sol", conversation: "shared", reasoningEffort: "" });
  assert.equal(resolved.reasoningEffort, null);
  assert.equal(resolved.backend, DEFAULTS.backend);
  assert.equal(resolved.maxOutputChars, DEFAULTS.maxOutputChars);
});
