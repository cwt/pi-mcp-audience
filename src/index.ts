/**
 * pi-mcp-audience — MCP audience annotation filter for Pi coding agent.
 *
 * Intercepts tool results and checks content items for MCP resource annotations
 * (https://modelcontextprotocol.io/specification/2025-11-25/server/resources#annotations).
 *
 * Architecture (two-phase):
 *   1. tool_result: Filter assistant-only content from the stored message
 *      (user display sees filtered version). Originals stashed in details.
 *   2. context:     Before each LLM call, restore originals from details
 *      into the context copy, so the AI always sees the full data.
 *
 * Commands:
 *   - /mcp-audience [on|off]     — Toggle visibility
 *   - /mcp-audience debug        — Show annotation stats
 *   - /mcp-audience status       — Current state summary
 *   - Ctrl+Shift+A               — Keyboard shortcut for toggle
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AnnotatedContent, HiddenItem } from "./types.js";
import { filterContent, getAudience } from "./audience-filter.js";

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── State ────────────────────────────────────────────────────────────────
  let showAll = false;
  const hiddenByCall = new Map<string, { filtered: HiddenItem[] }>();
  const debugLog: ReturnType<typeof filterContent>["debug"][] = [];
  const MAX_DEBUG = 20;

  // ── Shared helpers ───────────────────────────────────────────────────────
  function totalHidden(): number {
    return Array.from(hiddenByCall.values()).reduce(
      (sum, rec) => sum + rec.filtered.length,
      0,
    );
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (showAll) {
      ctx.ui.setStatus("mcp-audience", undefined);
    } else {
      const n = totalHidden();
      ctx.ui.setStatus(
        "mcp-audience",
        n > 0
          ? `${n} item(s) hidden by audience filter`
          : "audience filter active",
      );
    }
  }

  function notifyToggle(ctx: ExtensionContext): void {
    ctx.ui.notify(
      showAll
        ? "Showing ALL MCP content, including assistant-only annotations"
        : "Hiding MCP content not intended for users (audience filter ON)",
      "info",
    );
  }

  // ── Notify on load ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("mcp-audience", "audience filter active");

    const allTools = pi.getAllTools();
    const mcpTools = allTools.filter((t) => t.name.startsWith("mcp_"));
    if (mcpTools.length > 0) {
      ctx.ui.notify(
        "pi-mcp-audience: Detected MCP tools. " +
        "Run '/mcp-audience debug' after a tool call to check annotations.",
        "info",
      );
    }
  });

  // ── Toggle command ───────────────────────────────────────────────────────
  pi.registerCommand("mcp-audience", {
    description:
      "Control MCP audience annotation filtering. " +
      "Usage: /mcp-audience [on|off|debug|status] (no arg toggles)",
    handler: async (args, ctx) => {
      const cmd = args.trim().toLowerCase();

      if (cmd === "debug") {
        if (debugLog.length === 0) {
          ctx.ui.notify("No tool calls inspected yet.", "info");
          return;
        }
        const lines = debugLog.map((d, i) => {
          const pct = d.totalItems > 0
            ? ` (${Math.round((d.itemsWithAnnotations / d.totalItems) * 100)}% annotated)`
            : "";
          return `${i + 1}. ${d.toolName}: ${d.totalItems} items, ${d.itemsWithAnnotations} with annotations${pct}, ${d.itemsFiltered} filtered`;
        });
        ctx.ui.notify(
          `MCP Audience Debug (last ${debugLog.length} calls):\n${lines.join("\n")}`,
          "info",
        );
        return;
      }

      if (cmd === "status") {
        ctx.ui.notify(
          `pi-mcp-audience: ${showAll ? "SHOW ALL" : "filtering"} | ` +
          `${totalHidden()} items hidden across ${hiddenByCall.size} tool calls`,
          "info",
        );
        return;
      }

      if (cmd === "on") showAll = true;
      else if (cmd === "off") showAll = false;
      else showAll = !showAll;
      updateStatus(ctx);
      notifyToggle(ctx);
    },
  });

  // ── Keyboard shortcut ────────────────────────────────────────────────────
  pi.registerShortcut("ctrl+shift+a", {
    description: "Toggle MCP audience-filtered content visibility",
    handler: async (ctx) => {
      showAll = !showAll;
      updateStatus(ctx);
      notifyToggle(ctx);
    },
  });

  // ── Phase 1: Filter tool results for display ────────────────────────────
  // Returns filtered content (placeholders for assistant-only items) PLUS
  // originals stashed in details.__mcpAudienceOriginals for AI restoration.
  pi.on("tool_result", async (event, ctx) => {
    const items = event.content as AnnotatedContent[];
    if (!Array.isArray(items) || items.length === 0) return;

    // Run filter to determine what to hide
    const { content: filteredContent, filtered, debug } = filterContent(items, showAll);

    // Fill in and store debug metadata
    debug.toolCallId = event.toolCallId;
    debug.toolName = event.toolName;
    debugLog.unshift(debug);
    if (debugLog.length > MAX_DEBUG) debugLog.length = MAX_DEBUG;

    // Collect originals for AI restoration
    const originals: Array<{ index: number; content: AnnotatedContent }> = [];

    for (const f of filtered) {
      const item = items[f.index];
      if (item) originals.push({ index: f.index, content: item });
    }

    if (filtered.length > 0) {
      hiddenByCall.set(event.toolCallId, { filtered });
      updateStatus(ctx);

      ctx.ui.notify(
        `pi-mcp-audience: ${filtered.length} item(s) hidden from display ` +
        `(audience: ${filtered.map((f) => getAudience(f.original)?.join(", ")).join("; ")})`,
        "info",
      );
    }

    // Return filtered content for display, originals stashed for AI restoration
    const result: Record<string, unknown> = {
      content: filteredContent,
      details: {
        ...(event.details ?? {}),
        ...(originals.length > 0
          ? { __mcpAudienceOriginals: originals }
          : {}),
        __mcpAudienceDebug: debug,  // Make debug available to context handler
      },
    };
    return result;
  });

  // ── Phase 2: Restore originals in AI context before each LLM call ──────
  // The context event provides a deep copy of messages → safe to modify.
  pi.on("context", async (event, ctx) => {
    let modified = false;
    const messages = event.messages.map((msg: any) => {
      if (msg.role !== "toolResult") return msg;
      const details = msg.details;
      if (!details?.__mcpAudienceOriginals) return msg;

      const originals: Array<{ index: number; content: AnnotatedContent }> =
        details.__mcpAudienceOriginals;
      if (!Array.isArray(originals) || originals.length === 0) return msg;

      // Restore original content blocks that were filtered
      const restored = [...msg.content];
      for (const orig of originals) {
        if (orig.index >= 0 && orig.index < restored.length) {
          restored[orig.index] = orig.content;
        }
      }

      modified = true;
      return {
        ...msg,
        content: restored,
        // Remove the originals from the context copy to keep it clean
        details: { ...details, __mcpAudienceOriginals: undefined },
      };
    });

    if (modified) {
      return { messages };
    }
  });

  // ── Cleanup on session end ───────────────────────────────────────────────
  pi.on("session_shutdown", async () => {
    hiddenByCall.clear();
    debugLog.length = 0;
  });
}
