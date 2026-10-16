import { sendMessage } from "./ui.js";

const form = document.querySelector("#settings-form");
const endpointInput = document.querySelector("#api-endpoint");
const modelInput = document.querySelector("#model");
const autoSelectInput = document.querySelector("#auto-select-model");
const keyInput = document.querySelector("#api-key");
const notice = document.querySelector("#settings-notice");
const selectedModel = document.querySelector("#selected-model");

initialize();

async function initialize() {
  const settings = await sendMessage({ type: "getSettings" });
  endpointInput.value = settings.apiEndpoint;
  autoSelectInput.checked = !settings.model || settings.model === "auto";
  modelInput.value = autoSelectInput.checked ? "" : settings.model;
  keyInput.value = settings.apiKey;
  updateModelControls();
  showSelectedModel(settings.resolvedModel);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const settings = await sendMessage({ type: "saveSettings", settings: currentSettings() });
    showSelectedModel(settings.resolvedModel);
    showNotice(autoSelectInput.checked ? "设置已保存，首次解读时会自动选择模型。" : "设置已保存。", "success");
  } catch (error) {
    showNotice(error.message, "error");
  }
});

document.querySelector("#test-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  showNotice("正在测试模型连接…", "loading");
  try {
    const result = await sendMessage({ type: "testModel", settings: currentSettings() });
    showSelectedModel(result.model);
    showNotice(`连接成功，使用模型：${result.model}`, "success");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

function currentSettings() {
  return {
    apiEndpoint: endpointInput.value.trim(),
    model: autoSelectInput.checked ? "auto" : modelInput.value.trim(),
    apiKey: keyInput.value.trim()
  };
}

function updateModelControls() {
  modelInput.disabled = autoSelectInput.checked;
  modelInput.required = !autoSelectInput.checked;
}

function showSelectedModel(model) {
  selectedModel.hidden = !model;
  selectedModel.querySelector("strong").textContent = model || "";
}

autoSelectInput.addEventListener("change", () => {
  updateModelControls();
  if (!autoSelectInput.checked) document.querySelector(".advanced-settings").open = true;
});

function showNotice(message, kind) {
  notice.hidden = false;
  notice.className = `notice ${kind}`;
  notice.textContent = message;
}
