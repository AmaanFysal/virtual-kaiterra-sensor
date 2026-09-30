# Virtual Kaiterra Sensor

A deterministic virtual [Kaiterra Sensedge Mini](https://www.kaiterra.com/technical-specifications-sensedge-mini) air quality monitor. Give it the true air at its location over time; it reports what a real Sensedge Mini would, within the device's published ranges, resolution, accuracy and response, with realistic bias, drift, noise, module aging, dropouts and offline buffering, all seeded.

It runs standalone and is designed to plug into the [care home simulation](https://github.com/AmaanFysal/virtual-care-home).

```sh
pnpm install
pnpm test
pnpm vks help
```

```ts
import { simulate } from "@vks/core";

const result = simulate(
  { deviceId: "room-1", seed: "room-1" },
  [{ t: 1793685600, air: { pm25: 8, pm10: 12, co2: 650, tvoc: 120, temp: 21.5, rh: 45 } } /* … */],
);
result.readings; // [{ param: "co2", ts, span: 60, value, source?, … }]
```

Status: core model with device lifecycle and availability (M0–M3a). See `docs/workstreams/v1-standalone-sensor/` for what comes next.

Design docs start at [CLAUDE.md](CLAUDE.md) and [docs/](docs/). Kaiterra's specifications and API are cited in [docs/02](docs/02-sensedge-mini-reference.md).
