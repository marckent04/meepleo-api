/** Result of an API health check. */
export class HealthStatus {
  constructor(
    readonly databaseLatencyMs: number,
    readonly checkedAt: Date,
  ) {}
}
