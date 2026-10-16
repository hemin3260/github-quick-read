import { normalizeChatCompletionsEndpoint } from "./lib.js";

const ITEMS_KEY = "repoBriefItems";
const SETTINGS_KEY = "repoBriefSettings";

export const DEFAULT_SETTINGS = {
  apiEndpoint: "https://api.openai.com/v1/chat/completions",
  model: "auto",
  resolvedModel: "",
  resolvedEndpoint: "",
  apiKey: ""
};

export async function getItems() {
  const result = await chrome.storage.local.get(ITEMS_KEY);
  return Array.isArray(result[ITEMS_KEY]) ? result[ITEMS_KEY] : [];
}

export async function saveItems(items) {
  await chrome.storage.local.set({ [ITEMS_KEY]: items });
}

export async function upsertItem(item) {
  const items = await getItems();
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  await saveItems(items);
  return item;
}

export async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  const endpoint = normalizeChatCompletionsEndpoint(settings?.apiEndpoint || DEFAULT_SETTINGS.apiEndpoint);
  const previous = await getSettings();
  const hasExplicitResolution = settings?.model === "auto" && settings?.resolvedModel && settings?.resolvedEndpoint === endpoint;
  const canKeepResolution = settings?.model === "auto" && previous.resolvedEndpoint === endpoint && previous.apiKey === settings?.apiKey;
  const next = {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiEndpoint: endpoint,
    resolvedModel: hasExplicitResolution ? settings.resolvedModel : (canKeepResolution ? previous.resolvedModel : ""),
    resolvedEndpoint: hasExplicitResolution ? settings.resolvedEndpoint : (canKeepResolution ? previous.resolvedEndpoint : "")
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
