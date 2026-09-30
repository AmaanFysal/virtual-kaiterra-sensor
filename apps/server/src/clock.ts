// The server's notion of "now" in simulation time (docs/06). The core never reads a clock; the
// server asks one of these for each request. Wall time is allowed here (apps/), and injectable
// for tests.

export interface SimClock {
  /** Current simulation time, Unix seconds (whole). */
  now(): number;
  describe(): string;
}

/** Always the same instant, e.g. the end of the recorded data. */
export function fixedClock(t: number): SimClock {
  return { now: () => t, describe: () => `fixed at ${new Date(t * 1000).toISOString()}` };
}

export interface ReplayClockOptions {
  /** Simulation time when the server starts. */
  start: number;
  /** Simulation time the clock stops at (the end of the data). */
  end: number;
  /** Simulated seconds per wall-clock second. */
  speed: number;
  /** Wall clock in milliseconds; injectable for tests. */
  wallNow?: () => number;
}

/** Runs from `start` at `speed`× real time and holds at `end`. */
export function replayClock(opts: ReplayClockOptions): SimClock {
  if (!(opts.speed > 0)) throw new Error("replay speed must be > 0");
  const wall = opts.wallNow ?? Date.now;
  const wall0 = wall();
  return {
    now: () => Math.min(opts.end, Math.floor(opts.start + ((wall() - wall0) / 1000) * opts.speed)),
    describe: () => `replay from ${new Date(opts.start * 1000).toISOString()} at ${opts.speed}× (holds at ${new Date(opts.end * 1000).toISOString()})`,
  };
}
