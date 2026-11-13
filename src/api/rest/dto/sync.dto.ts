import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { SYNC_PULL_MAX_LIMIT, SYNC_PUSH_MAX_ITEMS } from '@/domain/sync'
import type {
  CatalogEntry,
  Group,
  Play,
  Player,
  SyncItemResult,
  SyncPullResult,
  SyncPushResult,
} from '@/shared/types'
import { PLAYER_SHAPES } from '@/shared/types'
import { GroupFields, GroupResponseDto, GroupResponseSchema } from './group.dto'
import {
  PlayUpsertBodySchema,
  ScoringTemplateResponseDto,
  ScoringTemplateSchema,
} from './play.dto'
import {
  PlayerResponseDto,
  PlayerResponseSchema,
  PlayerStyleFields,
} from './player.dto'
import {
  DateTimeSchema,
  SyncResponseFields,
  toSyncResponse,
} from './sync-fields.dto'

// ---------------------------------------------------------------------------
// sync/push: request
//
// Items are the entities themselves, flat, with their sync fields. A
// `deletedAt` marks a deletion, in which case the other fields are ignored.
// ---------------------------------------------------------------------------

const ItemIdSchema = z.uuid().describe('Entity identifier (UUID v7)')

const SyncItemFields = {
  id: ItemIdSchema,
  createdAt: DateTimeSchema.describe('Creation date set by the client'),
  updatedAt: DateTimeSchema.describe(
    'Last modification date set by the client; the most recent wins',
  ),
}

const TombstoneSchema = z.object({
  ...SyncItemFields,
  deletedAt: DateTimeSchema.describe('Deletion date: the item is a deletion'),
})

const PlayerItemSchema = z.union([
  TombstoneSchema,
  z.object({
    ...SyncItemFields,
    ...PlayerStyleFields,
    deletedAt: DateTimeSchema.optional(),
  }),
])

const GroupItemSchema = z.union([
  TombstoneSchema,
  z.object({
    ...SyncItemFields,
    ...GroupFields,
    deletedAt: DateTimeSchema.optional(),
  }),
])

const PlayItemSchema = z.union([
  TombstoneSchema,
  PlayUpsertBodySchema.extend({
    ...SyncItemFields,
    deletedAt: DateTimeSchema.optional(),
  }),
])

const GameListItemSchema = z.object({
  id: z.uuid().describe('Game identifier'),
  createdAt: SyncItemFields.createdAt,
  updatedAt: SyncItemFields.updatedAt,
  deletedAt: DateTimeSchema.optional().describe(
    'Deletion date: the game is removed from the list',
  ),
})

function uniqueIds<T extends z.ZodType<{ id: string }>>(item: T) {
  return z
    .array(item)
    .refine(
      (items) => new Set(items.map(({ id }) => id)).size === items.length,
      {
        message: 'Only one entry per id and per batch',
      },
    )
    .optional()
}

export const PushSyncBodySchema = z
  .object({
    players: uniqueIds(PlayerItemSchema).describe('Players'),
    groups: uniqueIds(GroupItemSchema).describe('Groups'),
    plays: uniqueIds(PlayItemSchema).describe(
      'Plays: the body of `PUT /v1/plays/{id}` plus the sync fields',
    ),
    catalog: uniqueIds(GameListItemSchema).describe('Library (`id` = game id)'),
    wishlist: uniqueIds(GameListItemSchema).describe(
      'Wishlist (`id` = game id)',
    ),
    favorites: uniqueIds(GameListItemSchema).describe(
      'Favorites (`id` = game id)',
    ),
  })
  .strict()
  .describe(
    `Changes made offline, one array per entity type, at most ${SYNC_PUSH_MAX_ITEMS} items in total (413 PAYLOAD_TOO_LARGE beyond). Processed in the order players, groups, plays, catalog, wishlist, favorites.`,
  )

export class PushSyncBodyDto extends createZodDto(PushSyncBodySchema) {}

// ---------------------------------------------------------------------------
// Flat entities, shared by push results and pull changes
// ---------------------------------------------------------------------------

const PlaySyncEntitySchema = z.object({
  id: z.uuid().describe('Play identifier'),
  gameId: z.uuid().describe('Game played'),
  status: PlayUpsertBodySchema.shape.status,
  playedAt: z.iso.datetime().describe('Date of the play (ISO 8601, UTC)'),
  startedAt: z.iso.datetime().nullable().describe('Start of the timer'),
  endedAt: z.iso.datetime().nullable().describe('End of the timer'),
  durationSeconds: z.number().int().nullable().describe('Duration'),
  firstPlayerId: z.uuid().nullable().describe('Player drawn to start'),
  note: z.string().nullable().describe('Free note'),
  players: z
    .array(
      z.object({
        playerId: z.uuid().nullable().describe('Player of the user'),
        name: z.string().describe('Name snapshot'),
        color: z.string().nullable().describe('Color snapshot (#RRGGBB)'),
        shape: z.enum(PLAYER_SHAPES).nullable().describe('Shape snapshot'),
        side: z.number().int().describe('Column of the score sheet'),
        isCurrentUser: z.boolean().describe('The player is the user'),
      }),
    )
    .describe('Players, in display order'),
  scoring: ScoringTemplateSchema.describe('Score sheet template used'),
  scores: PlayUpsertBodySchema.shape.scores,
  winnerSides: z.array(z.number().int()).describe('Winning sides'),
  ...SyncResponseFields,
})

const GameListSyncEntitySchema = z.object({
  id: z.uuid().describe('Game identifier'),
  ...SyncResponseFields,
})

function toPlaySyncEntity(play: Play): z.infer<typeof PlaySyncEntitySchema> {
  return {
    id: play.id,
    gameId: play.game.id,
    status: play.status,
    playedAt: play.playedAt.toISOString(),
    startedAt: play.startedAt?.toISOString() ?? null,
    endedAt: play.endedAt?.toISOString() ?? null,
    durationSeconds: play.durationSeconds,
    firstPlayerId: play.firstPlayerId,
    note: play.note,
    players: play.players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      color: player.color,
      shape: player.shape,
      side: player.side,
      isCurrentUser: player.userId !== null,
    })),
    scoring: ScoringTemplateResponseDto.fromDomain(play.scoring),
    scores: play.scores.map((score) => ({ ...score })),
    winnerSides: [
      ...new Set(
        play.players.filter(({ isWinner }) => isWinner).map(({ side }) => side),
      ),
    ],
    ...toSyncResponse(play),
  }
}

function toGameListSyncEntity(
  entry: CatalogEntry,
): z.infer<typeof GameListSyncEntitySchema> {
  return {
    id: entry.id,
    ...toSyncResponse({ ...entry, createdAt: entry.addedAt }),
  }
}

// ---------------------------------------------------------------------------
// sync/push: response
// ---------------------------------------------------------------------------

function resultSchema<T extends z.ZodType>(entity: T) {
  return z.union([
    z.object({
      id: z.uuid().describe('Identifier of the item sent'),
      status: z
        .enum(['ok', 'conflict'])
        .describe(
          '`ok`: applied or already applied; `conflict`: the server version is more recent, adopt `entity`',
        ),
      entity: entity
        .nullable()
        .describe('Server state of the item (null when it has none)'),
    }),
    z.object({
      id: z.uuid().describe('Identifier of the item sent'),
      status: z.literal('rejected'),
      code: z
        .string()
        .describe(
          'Error code (e.g. INVALID_PLAY_PLAYERS, GAME_NOT_FOUND, DEPENDENCY_FAILED): final, do not replay',
        ),
      message: z.string().describe('Technical message, not for display'),
    }),
  ])
}

export const PushSyncResponseSchema = z.object({
  results: z
    .object({
      players: z.array(resultSchema(PlayerResponseSchema)),
      groups: z.array(resultSchema(GroupResponseSchema)),
      plays: z.array(resultSchema(PlaySyncEntitySchema)),
      catalog: z.array(resultSchema(GameListSyncEntitySchema)),
      wishlist: z.array(resultSchema(GameListSyncEntitySchema)),
      favorites: z.array(resultSchema(GameListSyncEntitySchema)),
    })
    .describe('One result per item sent, grouped by entity type'),
  cursor: z
    .string()
    .describe(
      'Opaque cursor: highest revision assigned by this batch. Keep using the cursor of `sync/pull` to read other changes',
    ),
})

function mapResults<T, U>(
  results: SyncItemResult<T>[],
  toEntity: (entity: T) => U,
) {
  return results.map((result) =>
    result.status === 'rejected'
      ? result
      : {
          id: result.id,
          status: result.status,
          entity: result.entity === null ? null : toEntity(result.entity),
        },
  )
}

export class PushSyncResponseDto extends createZodDto(PushSyncResponseSchema, {
  codec: true,
}) {
  static fromDomain({ results, cursor }: SyncPushResult): PushSyncResponseDto {
    return {
      results: {
        players: mapResults(results.players, (p: Player) =>
          PlayerResponseDto.fromDomain(p),
        ),
        groups: mapResults(results.groups, (g: Group) =>
          GroupResponseDto.fromDomain(g),
        ),
        plays: mapResults(results.plays, toPlaySyncEntity),
        catalog: mapResults(results.catalog, toGameListSyncEntity),
        wishlist: mapResults(results.wishlist, toGameListSyncEntity),
        favorites: mapResults(results.favorites, toGameListSyncEntity),
      },
      cursor,
    }
  }
}

// ---------------------------------------------------------------------------
// sync/pull
// ---------------------------------------------------------------------------

export class PullSyncQueryDto extends createZodDto(
  z.object({
    cursor: z
      .string()
      .optional()
      .describe('Opaque cursor of the previous call; absent: the whole state'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SYNC_PULL_MAX_LIMIT)
      .optional()
      .describe(
        `Maximum number of entities (default 100, max ${SYNC_PULL_MAX_LIMIT})`,
      ),
  }),
) {}

export const PullSyncResponseSchema = z.object({
  changes: z
    .object({
      players: z.array(PlayerResponseSchema),
      groups: z.array(GroupResponseSchema),
      plays: z.array(PlaySyncEntitySchema),
      catalog: z.array(GameListSyncEntitySchema),
      wishlist: z.array(GameListSyncEntitySchema),
      favorites: z.array(GameListSyncEntitySchema),
    })
    .describe(
      'Entities of the user changed since the cursor, tombstones included',
    ),
  cursor: z.string().describe('Opaque, monotone cursor for the next call'),
  hasMore: z.boolean().describe('More changes are available: pull again'),
})

export class PullSyncResponseDto extends createZodDto(PullSyncResponseSchema, {
  codec: true,
}) {
  static fromDomain({
    changes,
    cursor,
    hasMore,
  }: SyncPullResult): PullSyncResponseDto {
    return {
      changes: {
        players: changes.players.map((p) => PlayerResponseDto.fromDomain(p)),
        groups: changes.groups.map((g) => GroupResponseDto.fromDomain(g)),
        plays: changes.plays.map(toPlaySyncEntity),
        catalog: changes.catalog.map(toGameListSyncEntity),
        wishlist: changes.wishlist.map(toGameListSyncEntity),
        favorites: changes.favorites.map(toGameListSyncEntity),
      },
      cursor,
      hasMore,
    }
  }
}

export type PushSyncBody = z.infer<typeof PushSyncBodySchema>
