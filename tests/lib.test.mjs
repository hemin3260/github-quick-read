import test from "node:test";
import assert from "node:assert/strict";
import { compareByLatestAnalysis, extractJson, getModelsEndpoint, normalizeAnalysis, normalizeChatCompletionsEndpoint, paginateItems, parseGitHubRepository, parseReadableLink, selectAutomaticModel } from "../src/lib.js";

test("parses repository URL and removes subpaths", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/openai/openai-node/tree/master/src"), {
    owner: "openai",
    repo: "openai-node",
    key: "openai/openai-node",
    url: "https://github.com/openai/openai-node"
  });
});

test("rejects non-GitHub and GitHub non-repository URLs", () => {
  assert.equal(parseGitHubRepository("https://example.com/a/b"), null);
  assert.equal(parseGitHubRepository("https://github.com/trending/typescript"), null);
  assert.equal(parseGitHubRepository("https://github.com/orgs/openai/repositories"), null);
});

test("normalizes readable article links and removes tracking data", () => {
  assert.deepEqual(
    parseReadableLink("https://example.com/post?utm_source=x&chapter=2#comments"),
    {
      key: "article:https://example.com/post?chapter=2",
      url: "https://example.com/post?chapter=2",
      hostname: "example.com"
    }
  );
  assert.equal(parseReadableLink("chrome://extensions"), null);
});

test("extracts JSON from fenced model output", () => {
  assert.deepEqual(extractJson("```json\n{\"category\":\"Agent\"}\n```"), { category: "Agent" });
});

test("repairs trailing commas in model JSON without changing string content", () => {
  assert.deepEqual(
    extractJson('{"highlights":["实际录用。", ],"risks":["文本中保留, ] 这组字符",],}'),
    { highlights: ["实际录用。"], risks: ["文本中保留, ] 这组字符"] }
  );
});

test("normalizes category and list lengths", () => {
  const result = normalizeAnalysis({ category: "随便写的", highlights: [1, 2, 3, 4, 5] });
  assert.equal(result.category, "其他");
  assert.deepEqual(result.highlights, ["1", "2", "3", "4"]);
});

test("paginates with ten items and clamps invalid pages", () => {
  const items = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  const second = paginateItems(items, 2);
  assert.deepEqual(second.items.map((item) => item.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(second.totalPages, 3);
  assert.equal(second.start, 10);
  assert.equal(second.end, 20);

  const clamped = paginateItems(items, 99);
  assert.equal(clamped.page, 3);
  assert.deepEqual(clamped.items.map((item) => item.id), [21, 22, 23]);
});

test("normalizes OpenAI, DeepSeek, and Gemini base URLs", () => {
  assert.equal(
    normalizeChatCompletionsEndpoint("https://api.openai.com/v1"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsEndpoint("https://api.deepseek.com"),
    "https://api.deepseek.com/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsEndpoint("https://api.deepseek.com/v1/"),
    "https://api.deepseek.com/v1/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai"),
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/"),
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  );
});

test("builds a models endpoint from a chat completions endpoint", () => {
  assert.equal(getModelsEndpoint("https://api.openai.com/v1"), "https://api.openai.com/v1/models");
  assert.equal(getModelsEndpoint("https://opencode.ai/zen/v1/chat/completions"), "https://opencode.ai/zen/v1/models");
  assert.equal(getModelsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai"), "https://generativelanguage.googleapis.com/v1beta/openai/models");
});

test("selects a fast free text model and ignores non-chat model types", () => {
  assert.equal(selectAutomaticModel([
    { id: "text-embedding-3-small" },
    { id: "deepseek-reasoner" },
    { id: "mimo-v2.6-flash-free" },
    { id: "large-chat-pro" }
  ]), "mimo-v2.6-flash-free");
});

test("sorts the latest completed analysis first", () => {
  const items = [
    { id: "older", analyzedAt: "2026-10-12T08:00:00.000Z" },
    { id: "newer", analyzedAt: "2026-10-15T08:00:00.000Z" }
  ];
  assert.deepEqual(items.sort(compareByLatestAnalysis).map((item) => item.id), ["newer", "older"]);
});
