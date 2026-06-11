/**
 * Tests for src/audience-filter.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAudience, isForUser, buildPlaceholder, filterContent } from "../src/audience-filter.js";
import type { AudienceRole } from "../src/types.js";

describe("getAudience", () => {
  it("returns undefined for item without annotations", () => {
    assert.equal(getAudience({ type: "text", text: "hello" }), undefined);
  });

  it("returns audience from block-level annotations", () => {
    const item = { type: "text", text: "hello", annotations: { audience: ["user", "assistant"] as unknown as AudienceRole[] } };
    assert.deepEqual(getAudience(item), ["user", "assistant"]);
  });

  it("returns audience from resource-level annotations", () => {
    const item = { type: "resource", resource: { uri: "test://foo", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } } };
    assert.deepEqual(getAudience(item), ["assistant"]);
  });

  it("prefers block-level over resource-level annotations", () => {
    const item = {
      type: "text",
      text: "hello",
      annotations: { audience: ["user"] as unknown as AudienceRole[] },
      resource: { uri: "test://foo", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } },
    };
    assert.deepEqual(getAudience(item), ["user"]);
  });
});

describe("isForUser", () => {
  it("returns true when no audience annotation", () => {
    assert.equal(isForUser({ type: "text", text: "hello" }), true);
  });

  it("returns true when audience includes user", () => {
    assert.equal(isForUser({ type: "text", text: "hello", annotations: { audience: ["user"] as unknown as AudienceRole[] } }), true);
    assert.equal(isForUser({ type: "text", text: "hello", annotations: { audience: ["user", "assistant"] as unknown as AudienceRole[] } }), true);
  });

  it("returns false when audience is assistant-only", () => {
    assert.equal(isForUser({ type: "text", text: "hello", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } }), false);
  });
});

describe("buildPlaceholder", () => {
  it("shows audience in placeholder text", () => {
    const item = { type: "text", text: "secret", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } };
    assert.equal(buildPlaceholder(item), "[assistant-only: assistant]");
  });

  it("includes resource prefix for resource types", () => {
    const item = { type: "resource", resource: { uri: "test://foo", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } } };
    assert.ok(buildPlaceholder(item).includes("[Resource: test://foo]"));
  });
});

describe("filterContent", () => {
  it("passes through items without annotations", () => {
    const items = [{ type: "text" as const, text: "hello" }, { type: "text" as const, text: "world" }];
    const result = filterContent(items, false);
    assert.equal(result.content.length, 2);
    assert.equal(result.debug.itemsWithAnnotations, 0);
    assert.equal(result.debug.itemsFiltered, 0);
    assert.deepEqual(result.filtered, []);
  });

  it("filters assistant-only items", () => {
    const items = [
      { type: "text", text: "for user", annotations: { audience: ["user"] as unknown as AudienceRole[] } },
      { type: "text", text: "secret json", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } },
    ];
    const result = filterContent(items, false);
    assert.equal(result.content.length, 2);
    assert.equal((result.content[0] as any).text, "for user");
    assert.equal((result.content[1] as any).text, "[assistant-only: assistant]");
    assert.equal(result.debug.itemsFiltered, 1);
    assert.equal(result.filtered.length, 1);
    assert.equal(result.filtered[0]?.index, 1);
  });

  it("passes everything through when showAll is true", () => {
    const items = [
      { type: "text", text: "visible", annotations: { audience: ["assistant"] as unknown as AudienceRole[] } },
    ];
    const result = filterContent(items, true);
    assert.equal(result.content.length, 1);
    assert.equal((result.content[0] as any).text, "visible");
    assert.equal(result.debug.itemsFiltered, 1); // still counted as "would be filtered"
    assert.equal(result.filtered.length, 1);
  });
});
