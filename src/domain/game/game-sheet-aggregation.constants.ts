/**
 * Beyond this, a RUNNING run is considered abandoned (instance stopped
 * during the aggregation) and a new aggregation can start. A
 * generation takes about a minute.
 */
export const AGGREGATION_STALE_AFTER_MS = 10 * 60_000

/** Recommended delay for the client between two polls of a sheet in progress. */
export const AGGREGATION_POLL_INTERVAL_SECONDS = 5
