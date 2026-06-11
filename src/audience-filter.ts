/**
 * pi-mcp-audience — Core filtering logic.
 *
 * Pure functions that inspect MCP content items for audience annotations
 * and determine which items should be hidden from the user.
 */

import type { AnnotatedContent, AudienceRole, DebugEntry, HiddenItem } from "./types.js";

// ─── Audience helpers ─────────────────────────────────────────────────────────

/**
 * Extract audience annotations from a content item.
 * Checks both block-level annotations and resource-level annotations.
 */
export function getAudience(item: AnnotatedContent): AudienceRole[] | undefined {
  if (item.annotations?.audience) {
    return item.annotations.audience;
  }
  if (item.resource?.annotations?.audience) {
    return item.resource.annotations.audience;
  }
  return undefined;
}

/**
 * Is this content item intended for the user?
 * - No annotation → assume public (return true)
 * - "user" in audience → return true
 * - Otherwise → return false (assistant-only)
 */
export function isForUser(item: AnnotatedContent): boolean {
  const audience = getAudience(item);
  if (!audience) return true;
  return audience.includes("user");
}

// ─── Placeholder generation ───────────────────────────────────────────────────

/** Build a short placeholder text explaining why content was hidden. */
export function buildPlaceholder(item: AnnotatedContent): string {
  const audience = getAudience(item);
  const audienceStr = audience ? `assistant-only: ${audience.join(", ")}` : "hidden";
  const prefix = item.type === "resource" && item.resource?.uri
    ? `[Resource: ${item.resource.uri}] `
    : "";
  return `${prefix}[${audienceStr}]`;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export interface FilterResult {
  /** Modified content array with hidden items replaced by placeholders. */
  content: AnnotatedContent[];
  /** Items that were filtered out. */
  filtered: HiddenItem[];
  /** Debug info for this call. */
  debug: DebugEntry;
}

/**
 * Filter content items based on audience annotations.
 *
 * @param items - The original content items from the tool result.
 * @param showAll - If true, pass everything through (no filtering).
 * @returns The filter result with modified content and debug info.
 */
export function filterContent(
  items: AnnotatedContent[],
  showAll: boolean,
): FilterResult {
  const filtered: HiddenItem[] = [];
  let annotatedCount = 0;

  // First pass: identify which items have annotations and which should be filtered
  for (let i = 0; i < items.length; i++) {
    const audience = getAudience(items[i]!);
    if (audience) annotatedCount++;

    if (!isForUser(items[i]!)) {
      filtered.push({ original: items[i]!, index: i });
    }
  }

  // Second pass: build output content (only when showAll is false)
  const content = showAll
    ? items // Pass through by reference — no filtering
    : items.map((item, index) => {
        if (isForUser(item)) return item; // Pass through
        // Replace with compact placeholder
        return {
          type: "text" as const,
          text: buildPlaceholder(item),
        };
      });

  return {
    content,
    filtered,
    debug: {
      toolCallId: "", // filled in by caller
      toolName: "",   // filled in by caller
      totalItems: items.length,
      itemsWithAnnotations: annotatedCount,
      itemsFiltered: filtered.length,
      audiences: filtered.map((f) => ({
        index: f.index,
        audience: getAudience(f.original) ?? [],
      })),
    },
  };
}
