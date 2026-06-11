/**
 * pi-mcp-audience — Shared type definitions.
 *
 * MCP annotations as defined in the spec:
 * https://modelcontextprotocol.io/specification/2025-11-25/server/resources#annotations
 */

/** Audience roles in MCP annotations. */
export type AudienceRole = "user" | "assistant";

/** Annotations as defined in the MCP spec (subset). */
export interface McpAnnotations {
  audience?: AudienceRole[];
  priority?: number;
  lastModified?: string;
}

/** A content block that may carry annotations. */
export interface AnnotatedContent {
  type: string;
  text?: string;
  mimeType?: string;
  annotations?: McpAnnotations;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: McpAnnotations;
  };
}

/** Record of a single hidden content item. */
export interface HiddenItem {
  original: AnnotatedContent;
  index: number;
}

/** Debug log entry for diagnostics. */
export interface DebugEntry {
  toolCallId: string;
  toolName: string;
  totalItems: number;
  itemsWithAnnotations: number;
  itemsFiltered: number;
  audiences: Array<{ index: number; audience: AudienceRole[] }>;
}
