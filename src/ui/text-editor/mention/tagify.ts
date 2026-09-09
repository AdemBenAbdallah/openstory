/**
 * Convert plain text with bare canonical tags into markdown with inline
 * mention spans, so Tiptap's Mention extension `parseHTML` rule picks them up
 * on `setContent`. Matching is delegated to `splitMentions` (shared with the
 * read-only `HighlightedPrompt`), so the editor and eval views pill identically.
 *
 * Each match is wrapped as a mention node whose `data-id` is the canonical
 * `tag` — saving the prompt soft-migrates legacy aliases to the new form.
 *
 * Used at editor mount + on every external value sync.
 */

import type { MentionItem } from '@/shots/ui/prompt-mention/mention-items';
import { splitMentions } from './mention-match';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type TagifyResult = {
  /** Markdown-with-inline-HTML, safe to hand to `editor.commands.setContent`. */
  content: string;
  /** Whether any tags were wrapped. */
  matched: boolean;
};

export function tagifyMarkdown(
  text: string,
  items: MentionItem[]
): TagifyResult {
  let content = '';
  let matched = false;
  for (const seg of splitMentions(text, items)) {
    if (seg.type === 'text') {
      content += seg.value;
      continue;
    }
    matched = true;
    content +=
      `<span data-type="mention"` +
      ` data-id="${escapeHtml(seg.item.tag)}"` +
      ` data-section="${escapeHtml(seg.item.section)}"` +
      ` data-label="${escapeHtml(seg.item.label)}">` +
      `${escapeHtml(seg.display)}</span>`;
  }
  return { content, matched };
}
