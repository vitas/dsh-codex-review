# Changelog

## 0.1.0

- `/review` command: starts a subagent pinned to a configured `provider`/`model`
  through `agentOptions`, awaits it, and returns its report as the command
  result.
- Configurable backend, effort, depth cap, persona, prompt commands, and output
  cap; validation fails at row load rather than at command time.
- The child is always disposed, including on start failure, non-`completed`
  stop reasons, and result rejection.
- No runtime dependencies; tests run on `node:test`.
