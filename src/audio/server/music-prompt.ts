/**
 * Ensure tags include "instrumental" to prevent ACE-Step from generating vocals.
 */
export function reinforceInstrumentalTags(tags: string): string {
  if (tags.includes('instrumental')) return tags;
  return `${tags}, instrumental, no vocals`;
}
