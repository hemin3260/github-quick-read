# GitHub 速读

GitHub 速读是一个无构建步骤的 Chromium 扩展原型：在公开 GitHub 仓库页面点击扩展，即可生成中文行动型解读、固定分类，并将结果保存在浏览器本地。

> 当前为 `v0.1.0` 测试版，用于验证“收纳 → 摘要 → 分类 → 处理”的核心闭环，适合个人使用和小范围测试。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目根目录。
5. 打开“GitHub 速读”的设置页，填写一个 OpenAI Chat Completions 兼容接口和 API Key；模型默认自动选择。

设置页同时接受完整 Endpoint 和 OpenAI、Gemini、DeepSeek Base URL，并会自动补全 Chat Completions 路径。

默认配置是：

- Endpoint：`https://api.openai.com/v1/chat/completions`
- Model：自动选择速度优先的可用文本模型，也可在高级设置中手动指定

## 使用

1. 打开一个公开 GitHub 仓库。
2. 点击浏览器工具栏中的“GitHub 速读”。
3. 点击“生成解读”，直接查看结论和重要信息。
4. 点击“查看完整解读”进入工作台，筛选分类、修改处理状态或手动修正分类。

工作台默认按最新解读排序，每页展示 10 条。

## 本地验证

无需 npm：

```bash
node --test tests/*.test.mjs
```

## 已知限制

- 只处理公开 GitHub 仓库。
- GitHub 未认证 API 有速率限制。
- API Key 存储在浏览器扩展的本地存储中，只适合个人验证。
- 模型接口必须兼容 Chat Completions 的 `choices[0].message.content` 返回格式。
- 请求不发送自定义 `temperature`，以兼容 GPT-6 Astra 等推理模型。
- 对 `408`、`429` 和常见 `5xx` 临时错误最多自动重试 3 次，并使用指数退避和轻微随机抖动。
- 尚未实现跨设备同步、批量处理、X 书签同步和个性化适配。

## 隐私说明

- 仓库元数据和 README 会发送到用户自行配置的模型 API，用于生成解读。
- API Key 和解读结果保存在当前浏览器的扩展本地存储中，不会提交到本项目仓库。
- 请勿在共享电脑中保存高权限 API Key。

## License

[MIT](LICENSE)
