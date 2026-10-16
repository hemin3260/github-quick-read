import { parseGitHubRepository } from "./lib.js";
import { sendMessage, setText } from "./ui.js";

const captureButton = document.querySelector("#capture-button");
const notice = document.querySelector("#notice");
let activeTab;
let repository;
let buttonMode = "capture";
let currentItem;

initialize();

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  repository = parseGitHubRepository(activeTab?.url || "");

  if (!repository) {
    setText(document.querySelector("#repo-name"), "不是 GitHub 仓库页面");
    setText(document.querySelector("#repo-url"), activeTab?.url || "");
    captureButton.disabled = true;
    captureButton.textContent = "请先打开一个 GitHub 仓库";
    return;
  }

  setText(document.querySelector("#repo-name"), `${repository.owner}/${repository.repo}`);
  setText(document.querySelector("#repo-url"), repository.url);

  const items = await sendMessage({ type: "listItems" });
  const existing = items.find((item) => item.id === repository.key);
  if (existing?.analysisStatus === "ready") renderQuickRead(existing);
}

captureButton.addEventListener("click", async () => {
  if (buttonMode === "inbox") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/inbox.html") });
    return;
  }
  if (buttonMode === "options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (!repository) return;
  showNotice("正在读取 README 并生成解读，通常需要几十秒…", "loading");
  captureButton.disabled = true;
  captureButton.textContent = "正在生成…";
  try {
    const item = await sendMessage({ type: "capture", url: repository.url, sourceUrl: activeTab.url });
    renderQuickRead(item);
    showNotice("解读已保存，重要信息已显示在下方。", "success");
  } catch (error) {
    showNotice(error.message, "error");
    captureButton.disabled = false;
    captureButton.textContent = error.message.includes("API Key") ? "前往设置" : "重新生成";
    if (error.message.includes("API Key")) {
      buttonMode = "options";
    }
  }
});

document.querySelector("#open-inbox").addEventListener("click", () => {
  openWorkbench();
});

document.querySelector("#open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#view-detail").addEventListener("click", () => openWorkbench(currentItem?.id));

function renderQuickRead(item) {
  if (!item?.analysis) return;
  currentItem = item;
  document.querySelector("#quick-read").hidden = false;
  captureButton.hidden = true;
  setText(document.querySelector("#preview-category"), item.category);
  setText(document.querySelector("#preview-verdict"), item.analysis.verdict);
  setText(document.querySelector("#preview-overview"), item.analysis.overview);
  setText(document.querySelector("#preview-next-step"), item.analysis.nextStep);

  const risks = (item.analysis.risks || []).slice(0, 2);
  const riskBlock = document.querySelector("#preview-risk-block");
  riskBlock.hidden = risks.length === 0;
  document.querySelector("#preview-risks").replaceChildren(...risks.map((risk) => {
    const element = document.createElement("li");
    element.textContent = risk;
    return element;
  }));
}

function openWorkbench(id) {
  const query = id ? `?repo=${encodeURIComponent(id)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/inbox.html${query}`) });
}

function showNotice(message, kind) {
  notice.hidden = false;
  notice.className = `notice ${kind}`;
  notice.textContent = message;
}
