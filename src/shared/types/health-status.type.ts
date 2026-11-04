/** Résultat d'un contrôle de santé de l'API. */
export class HealthStatus {
  constructor(
    readonly databaseLatencyMs: number,
    readonly checkedAt: Date,
  ) {}
}
