/**
 * Smart Retry Server Function — thin RPC shell; the orchestration lives in
 * `@/sequences/server/smart-retry` so nothing heavy survives the client
 * transform of this file (#1257).
 */

import { executeSmartRetry } from '@/sequences/server/smart-retry';
import { ulidSchema } from '@/lib/schemas/id.schemas';
import { createServerFn } from '@tanstack/react-start';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { sequenceAccessMiddleware } from '@/functions/middleware';

export const smartRetryFn = createServerFn({ method: 'POST' })
  .middleware([sequenceAccessMiddleware])
  .validator(zodValidator(z.object({ sequenceId: ulidSchema })))
  .handler(({ context }) => executeSmartRetry(context));
