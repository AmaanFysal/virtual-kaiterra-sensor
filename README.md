# Virtual Kaiterra Sensor

A deterministic virtual [Kaiterra Sensedge Mini](https://www.kaiterra.com/technical-specifications-sensedge-mini) air quality monitor. Give it the true air at its location over time; it reports what a real Sensedge Mini would, within the device's published ranges, resolution, accuracy and response, with realistic bias, drift, noise, module aging, dropouts and offline buffering, all seeded.

It runs standalone and is designed to plug into the [care home simulation](https://github.com/AmaanFysal/virtual-care-home).

```sh
pnpm install
pnpm test
pnpm vks scenarios
pnpm vks generate --scenario door-closed-co2-rise --out out/door.csv
pnpm -s vks convert --input out/door.csv --device data/devices/room1.json --format kaiterra-top
```

```ts
import { simulate } from "@vks/core";

const result = simulate(
  { deviceId: "room-1", seed: "room-1" },
  [{ t: 1793685600, air: { pm25: 8, pm10: 12, co2: 650, tvoc: 120, temp: 21.5, rh: 45 } } /* … */],
);
result.readings; // [{ param: "co2", ts, span: 60, value, source?, … }]
```

Status: the sensor model, output formats, synthetic true-air scenarios, CLI and validation reports are built (M0–M7); see the [reports](docs/workstreams/v1-standalone-sensor/reports/README.md). The Kaiterra-compatible server is next. The care home plug-in adapter waits for the care home's plug-in API contract (`docs/workstreams/v1-standalone-sensor/`).

Design docs start at [CLAUDE.md](CLAUDE.md) and [docs/](docs/). Kaiterra's specifications and API are cited in [docs/02](docs/02-sensedge-mini-reference.md).
