// PROTOTYPE: pure domain helpers kept browser- and storage-independent for testing.

export const PROJECT_CATEGORIES = [
  "Agent",
  "模型与推理",
  "开发工具",
  "知识库与 RAG",
  "数据分析",
  "部署运维",
  "设计与内容",
  "学习资源",
  "其他"
];

export const INBOX_STATES = ["未处理", "值得尝试", "归档"];

export const ITEMS_PER_PAGE = 10;

export function compareByLatestAnalysis(first, second) {
  const time = (item) => Date.parse(item?.analyzedAt || item?.updatedAt || item?.createdAt || 0) || 0;
  return time(second) - time(first);
}

export function paginateItems(items, requestedPage, pageSize = ITEMS_PER_PAGE) {
  const safeItems = Array.isArray(items) ? items : [];
  const safePageSize = Math.max(1, Number(pageSize) || ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(safeItems.length / safePageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), totalPages);
  const start = (page - 1) * safePageSize;

  return {
    page,
    pageSize: safePageSize,
    totalPages,
    totalItems: safeItems.length,
    start,
    end: Math.min(start + safePageSize, safeItems.length),
    items: safeItems.slice(start, start + safePageSize)
  };
}

export function normalizeChatCompletionsEndpoint(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (url.hostname === "api.openai.com" && ["", "/v1"].includes(path)) {
    url.pathname = "/v1/chat/completions";
  } else if (url.hostname === "api.deepseek.com" && ["", "/v1"].includes(path)) {
    url.pathname = `${path}/chat/completions`.replace(/^\/\//, "/");
  } else if (
    url.hostname === "generativelanguage.googleapis.com" &&
    ["/v1beta/openai", "/v1beta/openai/"].includes(url.pathname)
  ) {
    url.pathname = "/v1beta/openai/chat/completions";
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function getModelsEndpoint(input) {
  const endpoint = normalizeChatCompletionsEndpoint(input);
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, "/models");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function selectAutomaticModel(models) {
  const blocked = /(embed|embedding|rerank|moderation|whisper|transcri|tts|speech|audio|realtime|image|dall-e)/i;
  const candidates = (Array.isArray(models) ? models : [])
    .map((model) => typeof model === "string" ? model : model?.id)
    .filter((id) => typeof id === "string" && id.trim() && !blocked.test(id));

  const score = (id) => {
    const value = id.toLowerCase();
    let result = 0;
    if (/free/.test(value)) result += 1000;
    if (/flash/.test(value)) result += 450;
    if (/lite/.test(value)) result += 260;
    if (/mini/.test(value)) result += 220;
    if (/nano/.test(value)) result += 200;
    if (/chat/.test(value)) result += 120;
    if (/instruct/.test(value)) result += 80;
    if (/(reason|thinking|\br1\b|pro|large|opus)/.test(value)) result -= 350;
    if (/(preview|experimental|\bexp\b)/.test(value)) result -= 60;
    return result;
  };

  return candidates.sort((first, second) => score(second) - score(first) || first.localeCompare(second))[0] || "";
}

export function parseGitHubRepository(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    return null;
  }

  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !rawRepo) return null;

  const repo = rawRepo.replace(/\.git$/i, "");
  const reservedRoots = [
    "about", "apps", "collections", "customer-stories", "events", "explore",
    "features", "issues", "marketplace", "notifications", "orgs", "pricing",
    "pulls", "search", "security", "settings", "sponsors", "topics", "trending",
    "users"
  ];
  if (!repo || reservedRoots.includes(owner.toLowerCase())) {
    return null;
  }

  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  return {
    owner,
    repo,
    key,
    url: `https://github.com/${owner}/${repo}`
  };
}

export function extractJson(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1));

  let lastError;
  for (const candidate of [...new Set(candidates)]) {
    for (const value of [candidate, removeTrailingJsonCommas(candidate)]) {
      try {
        return JSON.parse(value);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(`模型没有返回有效 JSON：${lastError?.message || "格式无法识别"}`);
}

function removeTrailingJsonCommas(value) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }

    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(value[nextIndex] || "")) nextIndex += 1;
      if (["]", "}"].includes(value[nextIndex])) continue;
    }
    result += character;
  }
  return result;
}

export function normalizeAnalysis(value) {
  const category = PROJECT_CATEGORIES.includes(value?.category) ? value.category : "其他";
  const list = (input) => Array.isArray(input) ? input.map(String).filter(Boolean).slice(0, 4) : [];
  const highlights = list(value?.highlights);

  return {
    verdict: String(value?.verdict || "暂时无法形成明确结论"),
    overview: String(value?.overview || "暂无项目概述"),
    highlights,
    risks: list(value?.risks),
    nextStep: String(value?.nextStep || "先阅读项目 README"),
    category
  };
}

export function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}
