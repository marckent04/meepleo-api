/** Jeu du catalogue (données utiles à l'identification). */
export class Game {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly year: number | null,
    readonly publisher: string | null,
    readonly edition: string | null,
    readonly bggId: number | null,
  ) {}
}
