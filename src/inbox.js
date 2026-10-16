import { compareByLatestAnalysis, formatCompactNumber, INBOX_STATES, ITEMS_PER_PAGE, paginateItems, PROJECT_CATEGORIES } from "./lib.js";
import { formatDate, sendMessage } from "./ui.js";

const cards = document.querySelector("#cards");
const emptyState = document.querySelector("#empty-state");
const noResults = document.querySelector("#no-results");
const template = document.querySelector("#card-template");
const stateFilter = document.querySelector("#state-filter");
const categoryFilter = document.querySelector("#category-filter");
const searchInput = document.querySelector("#search-input");
const pagination = document.querySelector("#pagination");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");
let items = [];
let currentPage = 1;
let pendingTargetId = new URLSearchParams(location.search).get("repo");

for (const category of PROJECT_CATEGORIES) categoryFilter.add(new Option(category, category));

initialize();

async function initialize() {
  items = await sendMessage({ type: "listItems" });
  render();
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (stateFilter.value !== "all" && item.inboxState !== stateFilter.value) return false;
    if (categoryFilter.value !== "all" && item.category !== categoryFilter.value) return false;
    if (!query) return true;
    return JSON.stringify(item).toLowerCase().includes(query);
  }).sort(compareByLatestAnalysis);

  if (pendingTargetId) {
    const targetIndex = filtered.findIndex((item) => item.id === pendingTargetId);
    if (targetIndex >= 0) currentPage = Math.floor(targetIndex / ITEMS_PER_PAGE) + 1;
  }

  const pageData = paginateItems(filtered, currentPage);
  currentPage = pageData.page;
  cards.replaceChildren(...pageData.items.map(renderCard));
  emptyState.hidden = items.length > 0;
  noResults.hidden = items.length === 0 || filtered.length > 0;
  document.querySelector("#item-count").textContent = filtered.length === items.length
    ? `共 ${items.length} 个项目`
    : `${filtered.length} / ${items.length} 个项目`;

  pagination.hidden = pageData.totalPages <= 1;
  previousPageButton.disabled = currentPage === 1;
  nextPageButton.disabled = currentPage === pageData.totalPages;
  pageStatus.textContent = pageData.totalItems
    ? `第 ${currentPage} / ${pageData.totalPages} 页 · 显示 ${pageData.start + 1}–${pageData.end} 条`
    : "";

  if (pendingTargetId) {
    const targetId = pendingTargetId;
    pendingTargetId = null;
    requestAnimationFrame(() => {
      const target = [...cards.querySelectorAll(".repo-card")].find((card) => card.dataset.id === targetId);
      if (!target) return;
      target.classList.add("target-card");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

function renderCard(item) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".repo-card");
  card.dataset.id = item.id;
  fragment.querySelector(".category-badge").textContent = item.category;
  const status = fragment.querySelector(".analysis-status");
  status.textContent = item.analysisStatus === "ready" ? `更新于 ${formatDate(item.updatedAt)}` : item.analysisStatus === "processing" ? "正在生成" : "生成失败";

  const title = fragment.querySelector(".repo-title");
  title.textContent = item.title;
  title.href = item.url;
  fragment.querySelector(".repo-description").textContent = item.metadata?.description || "等待获取仓库描述";
  fragment.querySelector(".repo-stats").textContent = item.metadata
    ? `★ ${formatCompactNumber(item.metadata.stars)} · ${item.metadata.language} · ${item.metadata.license}`
    : "";

  const ready = fragment.querySelector(".analysis-ready");
  const error = fragment.querySelector(".analysis-error");
  if (item.analysisStatus === "ready" && item.analysis) {
    fragment.querySelector(".verdict").textContent = item.analysis.verdict;
    fragment.querySelector(".overview").textContent = item.analysis.overview;
    fillList(fragment.querySelector(".highlights"), item.analysis.highlights);
    fillList(fragment.querySelector(".risks"), item.analysis.risks);
    fragment.querySelector(".next-step strong").textContent = item.analysis.nextStep;
  } else {
    ready.hidden = true;
    error.hidden = false;
    error.querySelector("p").textContent = item.analysisStatus === "processing" ? "解读仍在生成，请稍后刷新页面。" : item.error || "生成失败";
  }

  const categorySelect = fragment.querySelector(".category-select");
  for (const category of PROJECT_CATEGORIES) categorySelect.add(new Option(category, category, false, category === item.category));
  categorySelect.addEventListener("change", () => update(item.id, { category: categorySelect.value }));

  const stateSelect = fragment.querySelector(".state-select");
  for (const state of INBOX_STATES) stateSelect.add(new Option(state, state, false, state === item.inboxState));
  stateSelect.addEventListener("change", () => update(item.id, { inboxState: stateSelect.value }));

  fragment.querySelector(".retry-button").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const updated = await sendMessage({ type: "retryItem", id: item.id });
      replaceLocal(updated);
    } catch (retryError) {
      alert(retryError.message);
      await initialize();
    }
  });

  fragment.querySelector(".delete-button").addEventListener("click", async () => {
    if (!confirm(`删除 ${item.title} 的解读？`)) return;
    await sendMessage({ type: "deleteItem", id: item.id });
    items = items.filter((candidate) => candidate.id !== item.id);
    render();
  });
  return fragment;
}

function fillList(list, values) {
  list.replaceChildren(...(values || []).map((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  }));
}

async function update(id, patch) {
  const updated = await sendMessage({ type: "updateItem", id, patch });
  replaceLocal(updated);
}

function replaceLocal(updated) {
  items = items.map((item) => item.id === updated.id ? updated : item);
  render();
}

function resetPageAndRender() {
  currentPage = 1;
  pendingTargetId = null;
  render();
}

for (const control of [stateFilter, categoryFilter]) control.addEventListener("change", resetPageAndRender);
searchInput.addEventListener("input", resetPageAndRender);
previousPageButton.addEventListener("click", () => {
  currentPage -= 1;
  render();
  scrollTo({ top: 0, behavior: "smooth" });
});
nextPageButton.addEventListener("click", () => {
  currentPage += 1;
  render();
  scrollTo({ top: 0, behavior: "smooth" });
});
document.querySelector("#open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
