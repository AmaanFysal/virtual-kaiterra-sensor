"""Reads the virtual server with the unmodified kaiterra-async-client (the library Home
Assistant's Kaiterra integration uses), changing only its base URL. Manual check (docs/06).

    python3 -m venv .venv && .venv/bin/pip install kaiterra-async-client
    pnpm -s vks serve --scenario hand-gel-tvoc-spikes --key demo &
    .venv/bin/python tools/kaiterra-client-check/check.py <device-id> [base-url] [key]
"""

import asyncio
import sys

import aiohttp
from kaiterra_async_client import AQIStandard, KaiterraAPIClient, Units


async def main(device_id: str, base_url: str, key: str) -> None:
    async with aiohttp.ClientSession() as session:
        client = KaiterraAPIClient(
            session,
            base_url=base_url,
            api_key=key,
            aqi_standard=AQIStandard.from_str("us"),
            preferred_units=[Units.DegreesCelsius],
        )
        readings = await client.get_latest_sensor_readings([f"/devices/{device_id}/top"])
        if not readings[0]:
            sys.exit("no readings")
        for name, r in sorted(readings[0].items()):
            point = r["points"][0]
            print(f"{name:8} {point['value']:>8} {r['units'].value:6} {r.get('source') or '':6} {point['ts'].isoformat()}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    asyncio.run(main(args[0], args[1] if len(args) > 1 else "http://127.0.0.1:8788", args[2] if len(args) > 2 else "demo"))
