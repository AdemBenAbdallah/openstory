/**
 * Pairing scan (#1180).
 *
 * A `requireCredits` site that neither calls a compliance gate nor eventually
 * `triggerWorkflow` can bill a restricted account. `triggerWorkflow` itself
 * must still run the gate — that is the backstop every other path relies on.
 */

import { globSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const GATE =
  /requireGenerationAllowed|requireUploadAttestation|assertCanGenerate/;
const TRIGGER = /triggerWorkflow/;
const CREDITS_CALL = /(?:requireCredits|reserveRunCredits)\s*\(/;

describe('generation-gate wiring', () => {
  test('triggerWorkflow runs the generation gate', () => {
    const source = readFileSync(
      'src/platform/server/workflow/client.ts',
      'utf8'
    );
    expect(source).toMatch(/assertCanGenerate/);
    expect(source).toMatch(/assertCanWrite/);
  });

  test('request-path API middleware applies enforcement', () => {
    const source = readFileSync('src/platform/middleware.fn.ts', 'utf8');
    const start = source.indexOf('export const authWithTeamRequestMiddleware');
    const end = source.indexOf('export const authMiddleware');
    const block = source.slice(start, end);
    expect(block).toMatch(/loadComplianceState/);
    expect(block).toMatch(/canAccess/);
    expect(block).toMatch(/canWrite/);
  });

  test('every request-path requireCredits call has a gate or triggerWorkflow', () => {
    // Request-path only: mid-run `requireCredits` inside a workflow is a
    // spawn-time billing guard, and the parent already passed the trigger gate.
    const missing: string[] = [];
    for (const file of globSync('src/**/*.fn.ts')) {
      const source = readFileSync(file, 'utf8');
      if (!CREDITS_CALL.test(source)) continue;
      if (GATE.test(source) || TRIGGER.test(source)) continue;
      missing.push(file);
    }
    expect(missing).toEqual([]);
  });
});
