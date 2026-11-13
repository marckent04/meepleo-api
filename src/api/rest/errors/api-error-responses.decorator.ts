import { applyDecorators } from '@nestjs/common'
import { ApiResponse } from '@nestjs/swagger'
import { ErrorResponseDto } from './error-response.dto'

const DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid request (VALIDATION_FAILED, BAD_REQUEST)',
  401: 'Authentication required',
  403: 'Action not allowed',
  404: 'Resource not found',
  409: 'Conflict with an existing resource',
  413: 'Payload too large (PAYLOAD_TOO_LARGE)',
  422: 'Business rule violated',
  429: 'Too many requests',
  500: 'Internal error',
}

/** Documents in Swagger the possible error responses of a route. */
export const ApiErrorResponses = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  )
