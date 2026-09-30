// The Kaiterra-compatible HTTP server (docs/06). A thin node:http wrapper around the core's pure
// router `kaiterraApi`: same paths under /v1, same `?key=` auth, same JSON, so software written
// for api.kaiterra.com works by changing only the base URL. Devices are replayed lazily up to the
// clock's "now" on each request, so readings appear only once delivered, with the device's
// module health and handshake as of that moment.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { kaiterraApi, normaliseUdid, type ApiContext, type ApiDevice, type ReplayDevice } from "@vks/core";
import type { SimClock } from "./clock.js";

export interface ServerOptions {
  devices: readonly ReplayDevice[];
  clock: SimClock;
  /** Accepted `key` values; when absent any non-empty key is accepted. */
  apiKeys?: readonly string[];
  /** Base URL for `_links.next`; default `http://<Host header>/v1`. */
  baseUrl?: string;
  /** Adds permissive CORS headers so browser dashboards can call the server. */
  cors?: boolean;
  /** Largest request body accepted, bytes (default 1 MiB). */
  maxBodyBytes?: number;
}

class HttpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Reads to the end even when too large, so the client gets a 413 rather than a reset.
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () => (size > limit ? reject(new HttpError(413, `Request body over ${limit} bytes`)) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

/** The API view of the devices at `asOf`, after replaying them that far. */
export function apiContext(opts: ServerOptions, asOf: number, baseUrl: string): ApiContext {
  const devices: ApiDevice[] = opts.devices.map((d) => {
    d.advanceTo(asOf);
    return { config: d.config, readings: d.readings(), status: d.status() };
  });
  return { devices, asOf, baseUrl, ...(opts.apiKeys === undefined ? {} : { apiKeys: opts.apiKeys }) };
}

export function createKaiterraServer(opts: ServerOptions): Server {
  const limit = opts.maxBodyBytes ?? 1024 * 1024;
  const ids = new Set<string>();
  for (const d of opts.devices) {
    const id = normaliseUdid(d.config.deviceId);
    if (ids.has(id)) throw new Error(`Two devices share the id ${d.config.deviceId}`);
    ids.add(id);
  }

  const send = (res: ServerResponse, code: number, body: unknown, asOf?: number) => {
    const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
    if (asOf !== undefined) headers["X-Vks-As-Of"] = new Date(asOf * 1000).toISOString().replace(".000Z", "Z");
    if (opts.cors) {
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Access-Control-Allow-Headers"] = "Content-Type";
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    }
    res.writeHead(code, headers);
    res.end(code === 204 ? undefined : JSON.stringify(body));
  };

  return createServer((req, res) => {
    const handle = async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      if (method === "OPTIONS" && opts.cors) return send(res, 204, null);
      if (url.pathname === "/" || url.pathname === "/v1" || url.pathname === "/v1/") {
        // Not part of the Kaiterra API: a small index so people can find the devices.
        const asOf = opts.clock.now();
        return send(
          res,
          200,
          {
            service: "Virtual Kaiterra Sensedge Mini: Kaiterra API v1 compatible",
            api: "/v1",
            as_of: new Date(asOf * 1000).toISOString().replace(".000Z", "Z"),
            clock: opts.clock.describe(),
            devices: opts.devices.map((d) => ({ id: d.config.deviceId, name: d.config.name, model: "SE-200", variant: d.config.variant })),
          },
          asOf,
        );
      }
      if (!url.pathname.startsWith("/v1/")) return send(res, 404, { message: "Not found" });
      if (method !== "GET" && method !== "POST") return send(res, 405, { message: `Method ${method} not allowed` });

      let body: unknown;
      if (method === "POST") {
        const text = await readBody(req, limit);
        try {
          body = text === "" ? undefined : JSON.parse(text);
        } catch {
          return send(res, 400, { message: "Request body is not valid JSON" });
        }
      }
      const asOf = opts.clock.now();
      const baseUrl = opts.baseUrl ?? `http://${req.headers.host ?? "localhost"}/v1`;
      const result = kaiterraApi(apiContext(opts, asOf, baseUrl), { method, path: `${url.pathname.slice(3)}${url.search}`, body });
      return send(res, result.code, result.body, asOf);
    };
    handle().catch((err: unknown) => {
      if (err instanceof HttpError) send(res, err.code, { message: err.message });
      else send(res, 500, { message: "Internal error" });
    });
  });
}
