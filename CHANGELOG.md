# Changelog

## 0.3.0

- **A bare `/review` is now a complete request.** The shipped `instruction` —
  and the `DEFAULT_INSTRUCTION` a row falls back to — grew from three sentences
  into a real brief: the stance (report, never edit a file, never run a command
  that changes the repository), the order to hunt in (correctness, failure
  handling, contracts, security and data, concurrency and state), and the
  evidence bar (verify in the file, the caller and the test; an unverified claim
  is a question, not a finding).
- The prompt no longer assumes there is a diff to read. It establishes what to
  review in three steps: the change set as it stands, with untracked files
  called out because a diff never shows them; the newest commit when the tree is
  clean; the plausibly touched files, named, when the workspace is not a Git
  repository. A review with nothing to review says so in one line instead of
  reviewing unrelated code to have something to report.
- Focus text states its own limit: it narrows what to judge, not what to read,
  and a focus naming something absent is reported rather than obeyed.
- The `conversation: shared` follow-up prompt carries the same clean-tree and
  non-repo fallbacks.

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
