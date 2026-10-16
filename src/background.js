import { extractJson, getModelsEndpoint, normalizeAnalysis, normalizeChatCompletionsEndpoint, parseGitHubRepository, PROJECT_CATEGORIES, selectAutomaticModel } from "./lib.js";
import { getItems, getSettings, saveItems, saveSettings, upsertItem } from "./store.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "capture":
      return captureRepository(message.url, message.sourceUrl || message.url);
    case "listItems":
      return getItems();
    case "updateItem":
      return updateItem(message.id, message.patch || {});
    case "deleteItem":
      return deleteItem(message.id);
    case "retryItem":
      return retryItem(message.id);
    case "getSettings":
      return getSettings();
    case "saveSettings":
      return saveSettings(message.settings || {});
    case "testModel":
      return testModel(message.settings || await getSettings());
    default:
      throw new Error("未知操作");
  }
}

async function captureRepository(url, sourceUrl) {
  const repository = parseGitHubRepository(url);
  if (!repository) throw new Error("当前页面不是有效的 GitHub 仓库");

  const items = await getItems();
  const existing = items.find((item) => item.id === repository.key);
  if (existing?.analysisStatus === "ready") return existing;

  const item = {
    id: repository.key,
    owner: repository.owner,
    repo: repository.repo,
    url: repository.url,
    sourceUrl,
    title: `${repository.owner}/${repository.repo}`,
    category: "其他",
    inboxState: existing?.inboxState || "未处理",
    analysisStatus: "processing",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysis: null,
    metadata: null,
    error: null
  };
  await upsertItem(item);
  return analyzeAndSave(item);
}

async function retryItem(id) {
  const item = (await getItems()).find((candidate) => candidate.id === id);
  if (!item) throw new Error("没有找到这条记录");
  item.analysisStatus = "processing";
  item.error = null;
  item.updatedAt = new Date().toISOString();
  await upsertItem(item);
  return analyzeAndSave(item);
}

async function analyzeAndSave(item) {
  try {
    const [metadata, readme] = await Promise.all([
      fetchRepositoryMetadata(item.owner, item.repo),
      fetchReadme(item.owner, item.repo)
    ]);
    const analysis = await generateAnalysis(metadata, readme);
    const analyzedAt = new Date().toISOString();
    const updated = {
      ...item,
      title: metadata.full_name || item.title,
      metadata: {
        description: metadata.description || "",
        language: metadata.language || "未知",
        stars: metadata.stargazers_count || 0,
        forks: metadata.forks_count || 0,
        openIssues: metadata.open_issues_count || 0,
        topics: metadata.topics || [],
        license: metadata.license?.spdx_id || "未声明",
        pushedAt: metadata.pushed_at || null
      },
      analysis,
      category: analysis.category,
      analysisStatus: "ready",
      analyzedAt,
      error: null,
      updatedAt: analyzedAt
    };
    await upsertItem(updated);
    return updated;
  } catch (error) {
    const failed = {
      ...item,
      analysisStatus: "error",
      error: error.message || String(error),
      updatedAt: new Date().toISOString()
    };
    await upsertItem(failed);
    throw error;
  }
}

async function fetchRepositoryMetadata(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!response.ok) throw new Error(`读取 GitHub 仓库失败（${response.status}）`);
  return response.json();
}

async function fetchReadme(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
    headers: { Accept: "application/vnd.github.raw+json" }
  });
  if (response.status === 404) return "（仓库没有 README）";
  if (!response.ok) throw new Error(`读取 README 失败（${response.status}）`);
  return (await response.text()).slice(0, 18000);
}

async function generateAnalysis(metadata, readme) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("请先在设置中填写模型 API Key");

  const prompt = `你是一位克制、务实的开源项目编辑。请根据仓库元数据和 README 生成便于快速决策的中文解读。\n\n规则：\n1. 不做用户工作适配度判断。\n2. 不照抄营销文案；所有判断尽量由 README 或元数据支撑，证据不足时明确说明。\n3. 先说具体事实，再给判断；避免“强大、革命性、值得关注”等空泛词。\n4. 每个列表项只表达一个信息，优先写能帮助读者判断是否继续阅读的内容。\n5. category 必须严格选择以下一个值：${PROJECT_CATEGORIES.join("、")}。\n6. 只返回 JSON，不要 Markdown。\n\nJSON 字段：\n{\n  "verdict": "一句话说明这是什么、是否值得继续了解，40字以内",\n  "overview": "依次说明项目解决的问题、核心方法和主要使用者，100字以内",\n  "highlights": ["最多3项有证据支撑的关键亮点"],\n  "risks": ["最多3项会影响采用决策的风险或未知点"],\n  "nextStep": "一个具体、低成本且可验证价值的下一步",\n  "category": "固定分类之一"\n}\n\n仓库元数据：\n${JSON.stringify({
    name: metadata.full_name,
    description: metadata.description,
    language: metadata.language,
    stars: metadata.stargazers_count,
    forks: metadata.forks_count,
    openIssues: metadata.open_issues_count,
    topics: metadata.topics,
    license: metadata.license?.spdx_id,
    pushedAt: metadata.pushed_at
  })}\n\nREADME：\n${readme}`;

  const { content } = await callChatCompletion(settings, [
    { role: "system", content: "你只输出可被 JSON.parse 解析的 JSON 对象；禁止尾逗号和 Markdown 代码块。" },
    { role: "user", content: prompt }
  ]);
  return normalizeAnalysis(extractJson(content));
}

async function callChatCompletion(settings, messages) {
  const endpoint = normalizeChatCompletionsEndpoint(settings.apiEndpoint);
  if (!endpoint) throw new Error("请填写模型 API Endpoint");
  let model = await resolveModel(settings, endpoint);
  let refreshedAutomaticModel = false;

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages
        })
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await wait(retryDelay(attempt));
        continue;
      }
      throw new Error(`无法连接模型接口 ${endpoint}：${error.message || String(error)}`);
    }

    const responseText = await response.text();
    let body = {};
    try {
      body = responseText ? JSON.parse(responseText) : {};
    } catch {
      body = {};
    }

    if (response.ok) {
      const content = body?.choices?.[0]?.message?.content;
      if (!content) throw new Error("模型接口没有返回文本内容");
      return { content, model };
    }

    const detail = body?.error?.message || responseText.slice(0, 300) || "接口未返回错误详情";
    if (
      settings.model === "auto" &&
      !refreshedAutomaticModel &&
      [400, 404].includes(response.status) &&
      /model|模型/i.test(detail)
    ) {
      model = await resolveModel({ ...settings, resolvedModel: "", resolvedEndpoint: "" }, endpoint, [model]);
      refreshedAutomaticModel = true;
      continue;
    }

    if (isRetryableStatus(response.status) && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10000)
        : retryDelay(attempt);
      await wait(delay);
      continue;
    }

    const code = body?.error?.code || body?.code;
    const codeText = code ? `，错误码 ${code}` : "";
    throw new Error(`模型接口调用失败（HTTP ${response.status}${codeText}，已尝试 ${attempt + 1} 次，Endpoint ${endpoint}）：${detail}`);
  }

  throw new Error("模型接口重试结束但没有返回结果");
}

async function resolveModel(settings, endpoint, excludedModels = []) {
  const configured = settings.model?.trim();
  if (configured && configured !== "auto") return configured;
  if (settings.resolvedModel && settings.resolvedEndpoint === endpoint) return settings.resolvedModel;

  const modelsEndpoint = getModelsEndpoint(endpoint);
  let response;
  try {
    response = await fetch(modelsEndpoint, {
      headers: { Authorization: `Bearer ${settings.apiKey}` }
    });
  } catch (error) {
    throw new Error(`无法自动获取模型列表：${error.message || String(error)}。可在高级设置中手动填写模型。`);
  }

  const responseText = await response.text();
  let body = {};
  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const detail = body?.error?.message || responseText.slice(0, 200) || "接口未返回错误详情";
    throw new Error(`无法自动获取模型列表（HTTP ${response.status}）：${detail}。可在高级设置中手动填写模型。`);
  }

  const availableModels = (body?.data || body?.models || []).filter((candidate) => {
    const id = typeof candidate === "string" ? candidate : candidate?.id;
    return !excludedModels.includes(id);
  });
  const model = selectAutomaticModel(availableModels);
  if (!model) throw new Error("接口没有返回可用的文本模型，可在高级设置中手动填写模型。");

  await saveSettings({
    ...settings,
    apiEndpoint: endpoint,
    model: "auto",
    resolvedModel: model,
    resolvedEndpoint: endpoint
  });
  return model;
}

function isRetryableStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function retryDelay(attempt) {
  return Math.min(1000 * (2 ** attempt) + Math.floor(Math.random() * 250), 10000);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function testModel(settings) {
  if (!settings.apiKey) throw new Error("请先填写 API Key");
  const { content, model } = await callChatCompletion(settings, [
    { role: "user", content: "只回复：连接成功" }
  ]);
  return { message: content.trim(), model };
}

async function updateItem(id, patch) {
  const items = await getItems();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("没有找到这条记录");
  const allowed = {};
  if (["未处理", "值得尝试", "归档"].includes(patch.inboxState)) allowed.inboxState = patch.inboxState;
  if (PROJECT_CATEGORIES.includes(patch.category)) allowed.category = patch.category;
  items[index] = { ...items[index], ...allowed, updatedAt: new Date().toISOString() };
  await saveItems(items);
  return items[index];
}

async function deleteItem(id) {
  const items = (await getItems()).filter((item) => item.id !== id);
  await saveItems(items);
  return { id };
}
