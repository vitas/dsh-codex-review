# dsh-codex-review

A deterministic `/review` command for DeepSeek Harness: it starts a reviewer
subagent pinned to a route you name — by default the subscription-backed
`openai-codex` route — waits for it, and hands the report back to the session.

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

Every field lives in the row's `config`, so it belongs in your profile's
`cordis.patch.yml` (see [`cordis.patch.yml`](cordis.patch.yml) for the shipped
defaults and the commented rationale):

| field | default | meaning |
| --- | --- | --- |
| `backend` | `spawn` | subagent backend: `spawn` (fresh in-process child), `fork` (inherits this conversation), or a plugin-provided one such as `codex` |
| `provider` | `openai-codex` | LLM route the reviewer is pinned to |
| `model` | `gpt-5.6-sol` | model id on that route |
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
- **No credentials, no client UI, no runtime dependencies.** Anything that
  authenticates stays the route's business.
- **No conversation inherited** with the default `spawn` backend: the reviewer
  sees the repository, not the argument that produced it. That is the point;
  use `backend: fork` when you want the opposite.

## Verification

```bash
npm run check   # syntax of every module
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
