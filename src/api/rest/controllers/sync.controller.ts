import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ZodResponse } from 'nestjs-zod'
import {
  type PlayPushItem,
  PullSyncQuery,
  PushSyncCommand,
} from '@/domain/sync'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import type { GameListWrite, PlayerWrite } from '@/shared/types'
import { CurrentUserId, Language } from '../../common/decorators'
import {
  PullSyncQueryDto,
  PullSyncResponseDto,
  PushSyncBodyDto,
  PushSyncResponseDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

const SYNC_THROTTLE = { default: { ttl: 60_000, limit: 30 } }

/** Placeholders of a tombstone: its other fields are ignored by the server. */
const DELETED_NAME = '(deleted)'

type PushBody = PushSyncBodyDto
type PlayItem = NonNullable<PushBody['plays']>[number]

function toGameListWrites(items: PushBody['catalog']): GameListWrite[] {
  return (items ?? []).map((item) => ({
    gameId: item.id,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
  }))
}

function toPlayItem(item: PlayItem): PlayPushItem {
  const deletedAt = item.deletedAt ? new Date(item.deletedAt) : null
  const base = {
    id: item.id,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt,
  }
  if (deletedAt !== null || !('gameId' in item)) {
    return {
      ...base,
      deletedAt: deletedAt ?? new Date(item.updatedAt),
      content: null,
    }
  }
  return {
    ...base,
    content: {
      gameId: item.gameId,
      status: item.status,
      playedAt: new Date(item.playedAt),
      startedAt: item.startedAt ? new Date(item.startedAt) : null,
      endedAt: item.endedAt ? new Date(item.endedAt) : null,
      durationSeconds: item.durationSeconds ?? null,
      firstPlayerId: item.firstPlayerId ?? null,
      note: item.note || null,
      players: item.players,
      scoring: item.scoring,
      scores: item.scores,
      winnerSides: item.winnerSides ?? null,
    },
  }
}

@ApiTags('sync')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Content language (${SUPPORTED_LOCALES.join(', ')}). Missing: 400 LANGUAGE_REQUIRED; no supported language: 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Post('push')
  @HttpCode(200)
  @Throttle(SYNC_THROTTLE)
  @ApiOperation({
    summary: 'Send the changes made offline',
    description:
      'One array per entity type; each item is the entity itself (flat) with `id`, `createdAt`, `updatedAt` and optionally `deletedAt` (deletion). The server arbitrates each item by last write wins on `updatedAt`: absent → created; newer → applied; equal → already applied (idempotent replay, `ok`); older → `conflict` with the server state. A rejected item (`rejected` + `code`) is final and does not stop the others; items depending on a rejected player get `DEPENDENCY_FAILED`. A `updatedAt` too far in the future is brought back to the reception time. Send the final state, one entry per id.',
  })
  @ZodResponse({ status: 200, type: PushSyncResponseDto })
  @ApiErrorResponses(400, 401, 413, 429, 500)
  async push(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Body() body: PushSyncBodyDto,
  ): Promise<PushSyncResponseDto> {
    const players: PlayerWrite[] = (body.players ?? []).map((item) => {
      const deleted = Boolean(item.deletedAt) || !('name' in item)
      return {
        id: item.id,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
        name: 'name' in item ? item.name : DELETED_NAME,
        color: 'color' in item ? item.color : '#000000',
        shape: 'shape' in item ? item.shape : 'circle',
        handle: ('handle' in item && item.handle) || null,
        isCurrentUser:
          !deleted && 'isCurrentUser' in item && item.isCurrentUser === true,
      }
    })
    const result = await this.commandBus.execute(
      new PushSyncCommand({
        userId,
        language,
        players,
        groups: (body.groups ?? []).map((item) => ({
          id: item.id,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
          deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          name: 'name' in item ? item.name : DELETED_NAME,
          memberIds: 'memberIds' in item ? item.memberIds : [],
        })),
        plays: (body.plays ?? []).map(toPlayItem),
        catalog: toGameListWrites(body.catalog),
        wishlist: toGameListWrites(body.wishlist),
        favorites: toGameListWrites(body.favorites),
      }),
    )
    return PushSyncResponseDto.fromDomain(result)
  }

  @Get('pull')
  @Throttle(SYNC_THROTTLE)
  @ApiOperation({
    summary: 'Get what changed since the last synchronization',
    description:
      'Entities of the current user changed since the opaque `cursor` (tombstones included), oldest change first, flat like in `push` plus `revision`. Without cursor: the whole state (restore after a reinstall). Call again while `hasMore` is true, then keep the returned `cursor`.',
  })
  @ZodResponse({ status: 200, type: PullSyncResponseDto })
  @ApiErrorResponses(400, 401, 429, 500)
  async pull(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Query() query: PullSyncQueryDto,
  ): Promise<PullSyncResponseDto> {
    const result = await this.queryBus.execute(
      new PullSyncQuery({
        userId,
        language,
        cursor: query.cursor,
        limit: query.limit,
      }),
    )
    return PullSyncResponseDto.fromDomain(result)
  }
}
