/**
 * Scoped Library Sub-module
 * Team-scoped library resource aggregation (styles, vfx, audio).
 */

import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import { audio, styles, vfx } from '@/platform/server/db/schema';
import type { Audio, Style, Vfx } from '@/platform/server/db/schema';

export function createLibraryMethods(db: Database, teamId: string) {
  return {
    getAll: async (): Promise<{
      styles: Style[];
      vfx: Vfx[];
      audio: Audio[];
    }> => {
      const [stylesList, vfxList, audioList] = await Promise.all([
        db
          .select()
          .from(styles)
          .where(eq(styles.teamId, teamId))
          .orderBy(
            asc(styles.sortOrder),
            desc(styles.usageCount),
            asc(styles.createdAt)
          ),
        db
          .select()
          .from(vfx)
          .where(eq(vfx.teamId, teamId))
          .orderBy(desc(vfx.createdAt)),
        db
          .select()
          .from(audio)
          .where(eq(audio.teamId, teamId))
          .orderBy(desc(audio.createdAt)),
      ]);

      return { styles: stylesList, vfx: vfxList, audio: audioList };
    },
  };
}
