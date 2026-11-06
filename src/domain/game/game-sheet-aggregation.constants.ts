/**
 * Au-delà, un run RUNNING est considéré comme abandonné (instance arrêtée
 * pendant l'agrégation) et une nouvelle agrégation peut démarrer. Une
 * génération dure environ une minute.
 */
export const AGGREGATION_STALE_AFTER_MS = 10 * 60_000

/**
 * Après un échec, les demandes renvoient cet échec pendant ce délai au lieu
 * de relancer l'IA : borne le coût quand le client interroge en boucle.
 */
export const AGGREGATION_FAILURE_COOLDOWN_MS = 5 * 60_000

/** Délai conseillé au client entre deux interrogations d'une fiche en cours. */
export const AGGREGATION_POLL_INTERVAL_SECONDS = 5
