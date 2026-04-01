import { describe, it, expect } from "vitest";
import { snakeToCamelKey, snakeToCamel } from "../extension/snake-to-camel.js";

describe("snakeToCamelKey", () => {
  it("converts snake_case to camelCase", () => {
    expect(snakeToCamelKey("created_at")).toBe("createdAt");
  });

  it("converts multiple underscores", () => {
    expect(snakeToCamelKey("incomplete_todo_count")).toBe("incompleteTodoCount");
  });

  it("leaves camelCase unchanged", () => {
    expect(snakeToCamelKey("createdAt")).toBe("createdAt");
  });

  it("leaves single word unchanged", () => {
    expect(snakeToCamelKey("id")).toBe("id");
  });

  it("preserves leading underscore", () => {
    expect(snakeToCamelKey("_private")).toBe("_private");
  });

  it("handles consecutive underscores", () => {
    expect(snakeToCamelKey("some__key")).toBe("some_Key");
  });
});

describe("snakeToCamel", () => {
  it("converts object keys", () => {
    expect(snakeToCamel({ created_at: "2024-01-01", tag_id: "1" })).toEqual({
      createdAt: "2024-01-01",
      tagId: "1",
    });
  });

  it("converts nested objects", () => {
    expect(snakeToCamel({ thread: { pinned_at: "2024-01-01", updated_at: "2024-01-02" } })).toEqual(
      { thread: { pinnedAt: "2024-01-01", updatedAt: "2024-01-02" } },
    );
  });

  it("converts arrays of objects", () => {
    expect(snakeToCamel([{ tag_id: "1" }, { tag_id: "2" }])).toEqual([
      { tagId: "1" },
      { tagId: "2" },
    ]);
  });

  it("converts nested arrays", () => {
    expect(snakeToCamel({ threads: [{ created_at: "2024-01-01" }] })).toEqual({
      threads: [{ createdAt: "2024-01-01" }],
    });
  });

  it("returns null as-is", () => {
    expect(snakeToCamel(null)).toBeNull();
  });

  it("returns primitives as-is", () => {
    expect(snakeToCamel("hello")).toBe("hello");
    expect(snakeToCamel(42)).toBe(42);
    expect(snakeToCamel(true)).toBe(true);
  });

  it("returns undefined as-is", () => {
    expect(snakeToCamel(undefined)).toBeUndefined();
  });

  it("handles empty object", () => {
    expect(snakeToCamel({})).toEqual({});
  });

  it("handles empty array", () => {
    expect(snakeToCamel([])).toEqual([]);
  });

  it("preserves null values in objects", () => {
    expect(snakeToCamel({ pinned_at: null })).toEqual({ pinnedAt: null });
  });
});
