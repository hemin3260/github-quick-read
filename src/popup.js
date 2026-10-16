import { parseGitHubRepository, parseReadableLink } from "./lib.js";
import { sendMessage, setText } from "./ui.js";

const captureButton = document.querySelector("#capture-button");
const notice = document.querySelector("#notice");
let activeTab;
let repository;
let readableLink;
let pageData;
let buttonMode = "capture";
let currentItem;

initialize();

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  repository = parseGitHubRepository(activeTab?.url || "");

  if (repository) {
    readableLink = { key: repository.key, url: repository.url };
    setText(document.querySelector("#repo-name"), `${repository.owner}/${repository.repo}`);
    setText(document.querySelector("#repo-url"), repository.url);
  } else {
    readableLink = parseReadableLink(activeTab?.url || "");
    if (!readableLink) {
      disableCapture("当前页面不支持解读", "请打开公开的文章、博客、X 长文或 GitHub 仓库");
      return;
    }

    try {
      pageData = await readCurrentPage(activeTab.id);
      const canonicalLink = parseReadableLink(pageData.url);
      if (canonicalLink) readableLink = canonicalLink;
      setText(document.querySelector("#repo-name"), pageData.title || readableLink.hostname);
      setText(document.querySelector("#repo-url"), readableLink.url);
      if (pageData.content.length < 160) {
        disableCapture(pageData.title || "未读取到足够正文", "页面可能需要登录，或正文尚未加载完成");
        return;
      }
    } catch (error) {
      disableCapture("无法读取当前页面", error.message || "该页面可能限制了扩展访问");
      return;
    }
  }

  const items = await sendMessage({ type: "listItems" });
  const existing = items.find((item) => item.id === readableLink.key);
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
  if (!readableLink) return;
  showNotice(repository ? "正在读取 README 并生成解读…" : "正在读取正文并生成解读…", "loading");
  captureButton.disabled = true;
  captureButton.textContent = "正在生成…";
  try {
    const item = await sendMessage({
      type: "capture",
      url: readableLink.url,
      sourceUrl: activeTab.url,
      pageData
    });
    renderQuickRead(item);
    showNotice("解读已保存，重要信息已显示在下方。", "success");
  } catch (error) {
    showNotice(error.message, "error");
    captureButton.disabled = false;
    captureButton.textContent = error.message.includes("API Key") ? "前往设置" : "重新生成";
    if (error.message.includes("API Key")) buttonMode = "options";
  }
});

document.querySelector("#open-inbox").addEventListener("click", () => openWorkbench());
document.querySelector("#open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#view-detail").addEventListener("click", () => openWorkbench(currentItem?.id));

async function readCurrentPage(tabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractVisibleArticle });
  const result = results?.[0]?.result;
  if (!result) throw new Error("扩展没有获得页面正文");
  return result;
}

function extractVisibleArticle() {
  const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const meta = (...selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.content;
      if (value) return text(value);
    }
    return "";
  };

  const candidates = [...document.querySelectorAll("article, main, [role='main']")];
  const root = candidates.sort((a, b) => text(b.innerText).length - text(a.innerText).length)[0] || document.body;
  const imageNotes = [...root.querySelectorAll("img")]
    .map((image) => text(image.alt || image.closest("figure")?.querySelector("figcaption")?.innerText))
    .filter((value, index, values) => value.length > 2 && values.indexOf(value) === index)
    .slice(0, 20);
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, svg, nav, header, footer, aside, form, button, input, select, textarea, [aria-hidden='true']")
    .forEach((element) => element.remove());
  const content = text(clone.innerText || clone.textContent).slice(0, 18000);
  const canonical = document.querySelector("link[rel='canonical']")?.href;
  const publishedAt = meta(
    "meta[property='article:published_time']",
    "meta[name='date']",
    "meta[name='pubdate']",
    "meta[itemprop='datePublished']"
  ) || document.querySelector("time[datetime]")?.dateTime || "";

  return {
    url: canonical || location.href,
    title: meta("meta[property='og:title']", "meta[name='twitter:title']") || text(document.title),
    description: meta("meta[name='description']", "meta[property='og:description']", "meta[name='twitter:description']"),
    author: meta("meta[name='author']", "meta[property='article:author']"),
    publishedAt: text(publishedAt),
    siteName: meta("meta[property='og:site_name']") || location.hostname.replace(/^www\./i, ""),
    content,
    imageNotes,
    imageCount: root.querySelectorAll("img").length
  };
}

function disableCapture(title, detail) {
  setText(document.querySelector("#repo-name"), title);
  setText(document.querySelector("#repo-url"), detail);
  captureButton.disabled = true;
  captureButton.textContent = "此页面暂不可解读";
}

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
  const query = id ? `?item=${encodeURIComponent(id)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/inbox.html${query}`) });
}

function showNotice(message, kind) {
  notice.hidden = false;
  notice.className = `notice ${kind}`;
  notice.textContent = message;
}
