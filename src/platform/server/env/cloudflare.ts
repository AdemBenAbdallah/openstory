import { createServerOnlyFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

export const getEnv = createServerOnlyFn(() => {
  return env;
});
