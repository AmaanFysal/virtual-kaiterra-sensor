---
name: new-output-format
description: Use when adding or changing an output format (Kaiterra API JSON, Secondary MQTT, BACnet object view, CSV export) or the Kaiterra-compatible server's responses.
---

# New or changed output format

1. Read docs/02 (what the real device does) and docs/05 (formats). Find the closest evidence: a live fixture beats a docs example beats integration code beats an assumption. Note which one you used.
2. Write the formatter as a pure function of readings and `device.status()` in `packages/core`. Never emit the side channel (`reference`, `truth`, `envelope`, `flags`, `deliveredAt`).
3. Respect delivery: at query time T, only readings with `deliveredAt <= T` exist.
4. Add a contract test comparing the output's shape (keys, types, units strings, timestamp format, ordering) with the fixture in `test/fixtures/kaiterra-api/`.
5. If you had to guess, add the guess to docs/09 with what would resolve it.
6. Run the `pre-pr` skill.
