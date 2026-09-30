# ADR 0006: The care home simulation owns the air; the plug-in only measures it

- **Status:** Proposed (until the sim's plug-in API exists)
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/04-true-air-and-generator.md, docs/07-plugin-interface.md

## Context

The care home simulation has rooms with volumes and logs every occupancy change, but it has no air model yet. Its v1 constitution bans sensors and air quality; its planned extension point is adapters that subscribe to events and publish inputs with `source: "external"`. The owner decided in that repo that the sim will own the air model (emissions from people and activities, a mass balance per room, doors and windows).

## Decision

We will build the plug-in as a pure measuring device: the host sends true air per location every tick, and the plug-in returns readings. It contains no occupancy logic and no room model. The synthetic generator in this repo (`@vks/true-air-gen`, M5) is a standalone test tool only and is never used on the plug-in path.

The draft interface (`describe`, `init`, `onAir`, `onDeviceEvent`) is in docs/07. It stays Proposed until the sim side exists.

## Consequences

- One air model, in the sim, so sensor readings and any other air consumer (infection's airborne route) agree.
- The sensor can be tested standalone with generated or recorded air, and in the sim without change.
- The generator can stay simple; it only needs plausible curves.

## Alternatives considered

- The sensor repo computes room air from occupancy events: duplicates the sim's future model and risks two disagreeing air models.
- Both, swappable: more code for a path the owner has ruled out.
