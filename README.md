# dsh-codex-review

A deterministic `/review` command for DeepSeek Harness: it sends the current
change set to a reviewer subagent pinned to a route you name — by default the
subscription-backed `openai-codex` route.

By default the reviewer is one continuing session per chat: the first `/review`
opens it, every later one hands it the next revision, and the report comes back
as a message in the conversation. Set `conversation: fresh` for a one-shot child
whose report is returned as the command's own result instead.

## Why this exists

Two things are wrong with asking the current agent to review its own work. It
wrote the code, so it is judging its own reasoning; and in a harness that routes
per turn, "review this" may well land on a different model than you expect,
chosen by a router rather than by you.

DSH already has the pieces: a slash command can call the subagent service
directly, and a start request can pin the child's route through `agentOptions`.
So `/review` is one command that does exactly that, with no LLM client, no
credentials of its own, and no dependency on which model the session is running.

Because the route is pinned, this is also the way to review with a ChatGPT
subscription instead of per-token API billing: point `provider` at
`openai-codex` and the child's calls go through that route's own authentication.

## Type `/review`, nothing else

The command needs no argument. The reviewer arrives with a standing brief — the
stance (report, never edit a file), a search order (correctness, failure
handling, contracts, security, concurrency and state), and an evidence bar (a
claim you could not verify is a question, not a finding) — and the prompt tells
it how to find something to judge: the change set as it stands, untracked files
included; the newest commit when the tree is clean; and, when the workspace is not
a Git repository at all, the repositories inside it that report changes — a
session workspace is often a directory of checkouts, and reading all of them is
not a review.

Anything you type after the command narrows **what to judge**; it never replaces
the brief, and it never narrows what the reviewer reads.

```
/review                                    the change set as a whole
/review focus on the cache invalidation    the same review, aimed
```

The brief is the row's `instruction`, so a profile can replace it wholesale —
the field next to the ones the settings card writes.

## Install

```bash
# from the checkout
dsh plugin --profile web add /Users/vitas/git/dsh-codex-review
# or as a dependency
dsh plugin --profile web add link:~/git/dsh-codex-review
```

The package is a bundle: installing it mounts the `codex-review` row and the
`/review` command. A restart is not needed for the row itself, but the command
appears only once the profile has recomposed.

## The route it needs

`/review` does not authenticate anything. It needs a route named by `provider`
to exist and to work. For the subscription path that is the `openai-codex`
provider — either the one pi-ai ships (OAuth sign-in with your ChatGPT
Plus/Pro account) or the one a plugin registers from your Codex CLI login:

- `dsh-codex-auth` — registers `openai-codex` from `~/.codex/auth.json`, so the
  CLI login you already have is the credential; no second sign-in.
- `dsh-subagent-codex` — a different shape: a subagent **backend** named
  `codex` that runs `codex exec` out of process. Use it by setting
  `backend: codex` and a route the CLI itself resolves.

If a call fails, the failure is the provider's own message, returned in the
command result — a declared route with no credentials, or an unknown model id.

## Configuration

Two writers touch this row. In the Web UI, open **Plugins → dsh-codex-review**:
the card picks the route and the reviewer model (its list is the running
composition's own model catalog, so subscription models a route plugin
registered appear there too), the memory mode, the reasoning effort, and the
command name. The same fields belong in your profile's `cordis.patch.yml` (see
[`cordis.patch.yml`](cordis.patch.yml) for the shipped defaults and the commented
rationale):

| field | default | meaning |
| --- | --- | --- |
| `backend` | `spawn` | subagent backend: `spawn` (fresh in-process child), `fork` (inherits this conversation), or a plugin-provided one such as `codex` |
| `provider` | `openai-codex` | LLM route the reviewer is pinned to |
| `model` | `gpt-5.6-sol` | model id on that route |
| `conversation` | `shared` | `shared` keeps one reviewer session per chat that remembers earlier reviews; `fresh` starts a one-shot reviewer per call |
| `reasoningEffort` | `null` | one of `off`…`max`, or `null` to let the route decide |
| `childMaxDepth` | `null` | `0` forbids the reviewer from delegating further; `null` sends nothing (safe for backends without the `depthLimit` capability) |
| `persona` | `null` | per-child persona text, if the backend supports it |
| `command` | `review` | the slash command name |
| `instruction`, `diffCommand`, `statusCommand` | see patch | what the reviewer is told and what it runs first |
| `maxOutputChars` | `40000` | cap on the review text handed back |

**A patch's `config` replaces the row's config wholesale — it is not deep
merged.** When you override one field, restate the ones you want to keep.

## What it deliberately does not do

- **No automatic review.** It runs when a human types the command. Automatic
  per-turn or per-tool-call review is a different feature with a different cost
  profile (one model call per turn, or per tool call).
- **No fixing.** The reviewer reads and reports; the main agent implements.
- **No credentials and no runtime dependencies.** Anything that authenticates
  stays the route's business.
- **No parent conversation inherited** with the default `spawn` backend: the
  reviewer sees the repository and its own earlier reviews, not the argument that
  produced the change. That is the point; use `backend: fork` when you want the
  opposite.

## Reviewer memory, and why the report is a message

`conversation: shared` is built on DSH's own *continuable* children, not on a
store of this plugin's: the first `/review` calls
`subagents.startContinuable`, and every later one finds that child again through
the durable child catalog (`subagents.listChildren`) and hands it the prompt with
`sendMessage`. Three consequences worth knowing:

- The command's own result is a **receipt**, not the review. The child answers
  into the conversation — which is what makes the review visible to the main
  agent. `conversation: fresh` is the mode that awaits the child and returns the
  report as the command result.
- The memory survives a host restart: a child that has gone idle is cold-resumed
  from its own durable session by the delivery itself, so the reviewer still
  knows what it flagged last time.
- `/review` continues the newest `reviewer`-labelled continuable child of the
  session, and there is no reset yet. To start over, run one review with
  `conversation: fresh`, or open a new chat.

Each later prompt is shorter and asks for the delta: what was fixed, what is
still open, what is new.

## Verification

```bash
npm run build   # esbuild → lib/client.js, the browser card; ship it, the host never builds it
npm run check   # syntax of every module + tsc --noEmit
npm test        # node:test, no test dependencies
```

Then, against a real profile:

```bash
dsh --profile web --dump-config | grep -A3 codex-review   # the row composed
```

and type `/review` in a session. The honest test of the route is the first real
call: it either returns a review or returns the provider's error.

## License

MIT — see [LICENSE](LICENSE).
