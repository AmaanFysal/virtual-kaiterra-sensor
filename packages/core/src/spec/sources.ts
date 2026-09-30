// Citations for every published number in the spec table (docs/02 lists them with notes).

export interface Citation {
  id: string;
  title: string;
  url: string;
  retrieved: string;
}

export const CITATIONS = {
  S1: {
    id: "S1",
    title: "Sensedge Mini (SE-200 & SE-200P) Technical Specifications (web page)",
    url: "https://www.kaiterra.com/technical-specifications-sensedge-mini",
    retrieved: "2026-09-30",
  },
  S2: {
    id: "S2",
    title: "Sensedge Mini Technical Specifications (2024) spec sheet PDF",
    url: "https://www.kaiterra.com/hubfs/Marketing%20Collateral/Technical%20Specifications/Sensedge%20Mini%20Technical%20Specifications%20(2024).pdf",
    retrieved: "2026-09-30",
  },
  S3: {
    id: "S3",
    title: "Kaiterra API documentation, version 2025-02-26",
    url: "https://dev.kaiterra.com",
    retrieved: "2026-09-30",
  },
  S4: {
    id: "S4",
    title: "Kaiterra Sensedge Mini BACnet PICS, February 2024 (firmware 2.4.5)",
    url: "https://www.kaiterra.com/hubfs/CS%20Documentation/Kaiterra%20Sensedge%20Mini%20BACnet%20Protocol%20Implementation%20Conformance%20Statement%20-%20February%202024.pdf",
    retrieved: "2026-09-30",
  },
  S5: {
    id: "S5",
    title: "Kaiterra support: Secondary MQTT Format Guide for Enterprise Devices",
    url: "https://support.kaiterra.com/secondary-mqtt-format",
    retrieved: "2026-09-30",
  },
  S6: {
    id: "S6",
    title: "Kaiterra support: When to replace your sensor modules (Sensedge Mini)",
    url: "https://support.kaiterra.com/when-to-replace-your-sensor-modules-sensedge-mini",
    retrieved: "2026-09-30",
  },
  S7: {
    id: "S7",
    title: "KM-200 reseller listings (testmeter.sg, aetmos.com.au) as quoted by search results; pages not reachable to verify",
    url: "https://testmeter.sg/products/kaiterra-sensedge-mini-silver-sensor-module-2/",
    retrieved: "2026-09-30",
  },
} as const satisfies Record<string, Citation>;

export type CitationId = keyof typeof CITATIONS;
