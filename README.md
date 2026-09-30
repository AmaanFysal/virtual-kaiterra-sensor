# Virtual Kaiterra Sensor

A deterministic virtual [Kaiterra Sensedge Mini](https://www.kaiterra.com/technical-specifications-sensedge-mini) air quality monitor. Give it the true air at its location over time; it reports what a real Sensedge Mini would, within the device's published ranges, resolution, accuracy and response, with realistic bias, drift, noise, module aging, dropouts and offline buffering, all seeded.

It runs standalone and is designed to plug into the [care home simulation](https://github.com/AmaanFysal/virtual-care-home).

```sh
pnpm install
pnpm test
pnpm vks help
```

Status: Kaiterra reference, spec table and provisional fixtures (M0–M1). See `docs/workstreams/v1-standalone-sensor/` for what comes next.

Design docs start at [CLAUDE.md](CLAUDE.md) and [docs/](docs/). Kaiterra's specifications and API are cited in [docs/02](docs/02-sensedge-mini-reference.md).
