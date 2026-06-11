# pi-mcp-audience

**Filter MCP content based on audience annotations for [Pi coding agent](https://pi.dev).**

MCP resources and content blocks can carry [`annotations`](https://modelcontextprotocol.io/specification/2025-11-25/server/resources#annotations) including an `audience` field indicating who the content is intended for — `"user"`, `"assistant"`, or both. This extension reads those annotations and hides content that is **not** meant for the user (e.g., raw JSON payloads, internal data, structured responses for the LLM only).

## How it works

When an MCP tool returns content, each block may carry annotations:

```json
{
  "type": "text",
  "text": "Here's what I found...",
  "annotations": { "audience": ["user", "assistant"] }
},
{
  "type": "text",
  "text": "{ \"raw\": \"json payload\" }",
  "annotations": { "audience": ["assistant"] }
}
```

- The first block includes `"user"` → displayed normally.
- The second block is **assistant-only** → hidden from the user display, but **still visible to the AI** (the LLM processes it, the user sees a placeholder).

Hidden items are replaced with a compact note:
```
[1 assistant-only content block hidden — visible to AI only]
```

## Installation

### 1. Install pi-mcp-extension (with annotation support)

pi-mcp-audience works with the tools registered by [pi-mcp-extension](https://github.com/irahardianto/pi-mcp-extension). It inspects the `audience` field in annotations on each content block, which requires annotation preservation in `convertMcpContent()`.

**A PR adding annotation preservation upstream is still in progress** — until it merges, use the patched fork which already includes it:

```bash
npm install -g git+https://github.com/cwt/pi-mcp-extension.git
```

> Once the [upstream PR](https://github.com/irahardianto/pi-mcp-extension/pulls) merges, annotation preservation will be built into `pi-mcp-extension` directly and `pi install npm:pi-mcp-extension` is all you need — no fork required.

### 2. Install pi-mcp-audience

```bash
pi install npm:pi-mcp-audience
```

Or for local testing:
```bash
pi -e src/index.ts
```

## Usage

### Toggle visibility
| Method | Action |
|--------|--------|
| `/mcp-audience` | Toggle |
| `/mcp-audience on` | Show all content (including assistant-only) |
| `/mcp-audience off` | Hide assistant-only content (default) |
| `Ctrl+Shift+A` | Keyboard shortcut |

### Diagnostics
| Command | Description |
|---------|-------------|
| `/mcp-audience debug` | Show annotation stats for last N tool calls |
| `/mcp-audience status` | Current state summary |

### Footer status
```
3 item(s) hidden by audience filter
```

## Compatibility

### pi-mcp-extension
The primary target. Requires annotation preservation in `convertMcpContent()` — see installation step 1 above.

### Any tool
Works with any tool returning `annotations.audience` — not just MCP tools. Harmless if no annotations are present (no-op).

## Architecture

Two-phase approach:

| Phase | Event | What happens | User sees | AI sees |
|-------|-------|-------------|-----------|---------|
| 1. Filter | `tool_result` | Replace assistant-only items with placeholders. Stash originals in `details.__mcpAudienceOriginals` | Placeholder | Placeholder (temporarily) |
| 2. Restore | `context` | Before each LLM call, restore originals from details into the context copy (deep copy, safe to modify) | Unaffected | **Full original data** |

The `context` event fires before every LLM call with a **deep copy** of messages. We restore the original content blocks there, so the AI always sees the complete data. The session's stored messages retain the filtered version for display.

## Project Structure

```
pi-mcp-audience/
├── src/
│   ├── index.ts              # Extension entry point (default export)
│   ├── audience-filter.ts    # Core filtering logic
│   └── types.ts              # Shared type definitions
├── tests/
│   └── audience-filter.test.ts  # 12 tests
├── package.json
├── tsconfig.json
├── .gitignore
├── .npmignore
├── LICENSE
└── README.md
```

## Technical Details

- **Hook**: `tool_result` (filter display) + `context` (restore for AI)
- **Content inspection**: Checks `item.annotations.audience` and `item.resource.annotations.audience`
- **Persistence**: Filtered indices + originals stored in `details.__mcpAudienceOriginals`
- **Toggle state**: In-memory (per session), affects future tool results
- **No peer dependency**: pi-mcp-audience does not import pi-mcp-extension. It hooks Pi's event system generically. If no annotations are present, it's a no-op.

## Development

```bash
# Typecheck
npm run typecheck

# Run tests
npm test

# Test with pi
pi -e src/index.ts
```

## License

MIT
