# ADR 0007: BACnet as an object view now, a BACnet/IP server later

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Amaan Fysal (project owner)
- **Affected docs:** docs/02-sensedge-mini-reference.md, docs/05-output-formats.md

## Context

The Sensedge Mini is a BACnet/IP Smart Sensor (B-SS) with analog inputs AI 1–10 as listed in its PICS (S4). A real BACnet/IP server (Who-Is/I-Am, ReadProperty, ReadPropertyMultiple, COV on UDP 47808) is sizeable network code and needs a BACnet library.

## Decision

We will build the PICS object list and property values (Present_Value, Units, Reliability, COV_Increment, Description) as a pure data view in M4. A real BACnet/IP UDP server is the stretch milestone M10.

## Consequences

- Building-management consumers can be tested against the object values now, without a network stack.
- The view drives the server later, so values cannot diverge.

## Alternatives considered

- A full BACnet/IP server in v1: more work before the core formats exist.
- No BACnet at all: loses a documented integration of the real device.
