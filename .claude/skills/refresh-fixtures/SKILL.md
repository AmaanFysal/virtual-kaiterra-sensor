---
name: refresh-fixtures
description: Replace provisional Kaiterra API fixtures with live responses from the public test device. Manual only.
disable-model-invocation: true
---

# Refresh fixtures

1. Confirm with the user that `KAITERRA_API_KEY` is in `.env`. Never print, echo or log its value; never read `.env` into the conversation.
2. Run `pnpm vks fixtures:fetch`. It writes `test/fixtures/kaiterra-api/live/*.json` with `provenance: "live"` sidecars and the key redacted.
3. Run `git diff --stat` and `git grep -n "key=" test/fixtures` (only `key=REDACTED` may appear).
4. Compare the live files with the provisional ones: parameter names (`tvoc` vs `rtvoc`, ADR-0004), units strings, `source` values, decimals, extra fields. Record every difference in docs/02 and docs/09, and update formatters and tests.
5. Run the `pre-pr` skill.
