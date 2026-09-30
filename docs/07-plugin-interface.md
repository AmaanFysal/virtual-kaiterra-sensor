# 07 · Care home plug-in interface

**Purpose:** how the virtual sensor will attach to the care home simulation once that repo has a plug-in API.

> Status: design only (ADR-0006, Proposed). **M9 is on hold** until the care home publishes its plug-in API contract (part of its `v1.0-testbed` milestone). M9 will follow that contract, and this draft will be revised to match it (docs/09).

## Division of labour

The care home simulation owns the air model: emissions from people and activities, a mass balance per room, doors and windows. The sensor only measures the true air the host sends. It has no occupancy logic and no room model. The synthetic generator (docs/04) is a standalone test tool and is not part of this path.

## Time

Sim time is integer seconds since Mon 2026-11-02 00:00 (care home `packages/shared-types/src/time.ts`). The sensor works in Unix seconds: `simToUnix(t) = 1793577600 + t` (`packages/core/src/time.ts`). The sim's 5 s tick equals the sensor's sampling interval, and its default start (t = 108000, Tue 2026-11-03 06:00) is on a minute boundary. Tests check both points and a 400-day calendar sweep against a port of the sim's `simDate`.

## Draft interface

```ts
interface SensorPlugin {
  describe(): { model: "SE-200"; params: ParamId[]; sampleIntervalS: 5; reportIntervalS: 60 };
  init(ctx: { simEpochUnix: number; devices: { deviceId: string; locationId: string; config: DeviceConfigInput }[] }): void;
  /** Called every sim tick with the true air in each room that has a sensor. */
  onAir(input: { t: number; samples: { locationId: string; air: TrueAir }[] }): SensorOutput[];
  /** Power, network and maintenance events from the sim (e.g. a carer swaps a module). */
  onDeviceEvent?(input: { t: number; deviceId: string; event: DeviceEvent }): void;
}

interface SensorOutput {
  deviceId: string;
  readings: Reading[]; // delivered this tick; the host may strip the side channel
}
```

Each device is a `createDevice` instance stepped with `simToUnix(t)`. Outputs go back to the sim as inputs with `source: "external"` (care home constitution rule 5). The in-process adapter and a mock host come first; a WebSocket or HTTP transport follows once the sim side exists.
