import type { z } from 'zod';

/**
 * Type machinery for the typed realtime client, ported from the removed
 * Upstash realtime package (#802) so the `useRealtime` call sites keep their
 * exact event-name + payload inference against `realtimeSchema`.
 *
 * `realtimeSchema` is a nested record whose leaves are Zod schemas. An "event
 * path" is the dotted join of the keys down to a leaf (e.g.
 * `generation.phase:start`), and its payload is the leaf's `z.infer`.
 */

export type ConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'connecting';

/** All dotted event paths reachable in schema `T`. Depth-guarded to avoid TS recursion blowups. */
export type EventPaths<
  T,
  Prefix extends string = '',
  Depth extends readonly number[] = [],
> = Depth['length'] extends 10
  ? never
  : {
      [K in keyof T & string]: T[K] extends z.ZodType
        ? `${Prefix}${K}`
        : T[K] extends Record<string, unknown>
          ? EventPaths<T[K], `${Prefix}${K}.`, [...Depth, 0]>
          : `${Prefix}${K}`;
    }[keyof T & string];

/** The Zod leaf schema at event path `K` within schema `T` (or `never`). */
export type EventData<
  T,
  K extends string,
  Depth extends readonly number[] = [],
> = Depth['length'] extends 10
  ? never
  : K extends `${infer A}.${infer Rest}`
    ? A extends keyof T
      ? T[A] extends z.ZodType
        ? never
        : EventData<T[A], Rest, [...Depth, 0]>
      : never
    : K extends keyof T
      ? T[K] extends z.ZodType
        ? T[K]
        : never
      : never;

/** Discriminated union of `{ event, channel, data }` for the selected event paths. */
export type EventPayloadUnion<T, E extends string> = E extends string
  ? {
      event: E;
      channel: string;
      data: EventData<T, E> extends z.ZodType
        ? z.infer<EventData<T, E>>
        : never;
    }
  : never;

/** A user (non-system) event as it arrives over the wire. */
export type RealtimeUserEvent = {
  id: string;
  event: string;
  channel: string;
  data: unknown;
};
