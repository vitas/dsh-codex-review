# Changelog

## 0.2.0

- **Settings card** on the Plugins page: route, reviewer model, memory mode,
  reasoning effort, and command name, written into the same row the patch writes.
  The model list is the running composition's own catalog, so models a route
  plugin registered at boot show up without this plugin knowing about them.
- **`conversation: shared` (new default): one reviewer session per chat.** The
  first `/review` opens a continuable child; later ones find it through the
  durable child catalog and hand it the next revision with `sendMessage`, so the
  reviewer remembers what it already flagged. The report arrives in the
  conversation and the command result is a receipt. `conversation: fresh` keeps
  the previous behaviour: a one-shot child awaited and rendered as the result.
- Follow-up prompts ask for the delta — fixed, still open, newly introduced.
- Adds `src/host/index.js` (volatile row schema + accessor unwrapping), the
  browser half (`src/client/`, `lib/client.js`, `scripts/build-client.mjs`,
  `tsconfig.json`), and a `build` script. Only `@deepseek-ai/schemastery` is a
  peer; there are still no runtime dependencies.

## 0.1.0

- `/review` command: starts a subagent pinned to a configured `provider`/`model`
  through `agentOptions`, awaits it, and returns its report as the command
  result.
- Configurable backend, effort, depth cap, persona, prompt commands, and output
  cap; validation fails at row load rather than at command time.
- The child is always disposed, including on start failure, non-`completed`
  stop reasons, and result rejection.
- No runtime dependencies; tests run on `node:test`.
