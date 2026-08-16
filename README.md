# NovelCreator · 小说创作助手

> 本地优先的小说写作工作台。用「章节目录 / 卷 / 梗概条目」组织长篇小说结构，用「概念库 + 人物关系白板 + 故事线白板」沉淀设定，内置 AI 写作助手（提炼梗概 / 识别角色 / 续写 / 润色 / 审校 / 生文本分析），并可一键导出全篇或单章。数据完全保存在你自己的文件夹里；AI 可选接入，未配置密钥时其余功能完全离线可用。

---

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-4-brown)
![ReactFlow](https://img.shields.io/badge/React%20Flow-12-ff0071)
![TailwindCSS](https://img.shields.io/badge/Tailwind%20CSS-3-38bdf8?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## English TL;DR

**NovelCreator** is a local-first writing studio for long-form fiction.

- **Local-first by default**: manuscript data lives in a plain folder on your own disk — `project.json`, `concepts.json`, `storylines.json`, and `nodes/*.md` (YAML front-matter + Markdown body). No cloud, no account.
- **Structured long-form writing**: organize your book into volumes (卷) and chapter nodes (章节目录), each composed of beat entries (梗概条目) that pair a one-line summary (梗概, not exported) with the prose body (正文, exported).
- **Worldbuilding that feeds back**: a concept library (characters / places / items / generic) with aliases and colors; concept names are auto-highlighted (colored font) inside the editor, and renaming an alias can trigger a global replace.
- **Visual planning**: a relations whiteboard for character relationships and a storyline whiteboard with single/branch plots, an active-line state, and four flow directions.
- **Optional AI assistant** (via a backend proxy; key stays local): raw-text analysis (生文本分析), summarize 梗概 by word-count chunks, extract characters, continue / polish / proofread prose.
- **Flexible export**: join the prose of every beat along a storyline's order, or export a single chapter; automatic chapter numbers, volume headers (`第1卷 卷名`), and configurable paragraph spacing.

```bash
# Windows: just double-click
start.bat

# Or run manually (see 快速启动 below)
```

---

## 目录

- [项目定位](#项目定位)
- [核心能力](#核心能力)
- [功能全景](#功能全景)
- [数据与安全边界](#数据与安全边界)
- [技术架构](#技术架构)
- [快速启动](#快速启动)
- [开发与验证](#开发与验证)
- [路线图](#路线图)
- [适合谁](#适合谁)
- [License](#license)

---

## 项目定位

NovelCreator 不是一个「一键生成小说」的工具，而是一个**帮作者把长篇小说的结构、设定和正文组织起来**的本地工作台，并提供**可选**的 AI 辅助（拆解、提炼、续写、润色）：

| 目标 | NovelCreator 的做法 |
|---|---|
| 长篇结构不散 | 卷 → 章节目录 → 梗概条目三层结构，节点可上下排序、按卷缩进归组 |
| 设定能反哺写作 | 人物/地点/物品/概念进入结构化本地库，正文中自动彩色高亮 |
| 关系与剧情可视化 | 人物关系白板、故事线白板（单线/分支 + 激活主线 + 四向布局） |
| 素材快速入库 | 生文本分析：粘贴杂糅文本，AI 拆出标题/梗概/世界观/人物/概念/剧情，勾选导入 |
| 稿件随时能拼 | 按故事线连接顺序一键拼接正文，或单独导出某一章，自动章节序号、卷序号 |
| 数据本地优先 | 所有数据以文件夹形式存在用户指定的本地路径，AI 密钥也仅存本机后端 |

---

## 核心能力

### 项目与本地存储

- 首页新建 / 打开项目，数据以**文件夹**形式保存在本地。
- 自动保存（防抖 500ms），编辑即存。
- 项目结构一目了然：`project.json`（项目信息）、`concepts.json`（概念 + 关系）、`storylines.json`（故事线）、`nodes/*.md`（节点正文，YAML front-matter）、`export-settings.json`（导出偏好）。

### 章节目录与卷

- **章节目录（章节节点）**：标题 + 若干「梗概条目」。
- **梗概条目** = 梗概（一句话剧情，仅预览、不导出）+ 正文（换行即分段，导出）。
- **卷**：卷名 / 卷介绍（不导出）/ 卷正文（导出），把节点按顺序归组并缩进展示。
- 编辑器里**梗概字号比正文大**，每条梗概可**折叠 / 展开其正文**（类似 Markdown 标题），底部可「全部折叠 / 展开」。
- 章节目录页可直接**删除单个梗概条目**；章节数 / order 显示方式在「设置」中切换。
- 支持上下移动、删除，节点与卷可混排。

### 概念与人物

- 概念四类：通用 / 人物 / 地点 / 物品；支持别名、描述、颜色。
- 人物额外支持性格、背景、身份字段。
- 正文中出现的概念名会**自动彩色高亮**（彩色字体），方便一眼看出设定是否已建立。
- 改名 / 改别名支持**全局替换**：按最长优先匹配、只替换完全相等的那一个词，避免「萧熏儿」被误改成「萧溟儿」。

### 人物关系白板

- 人物以节点呈现，关系连线带标签。
- 连线起止方向贴合节点把手法线，曲线过渡更自然。
- 关系方向切换通过右键菜单完成，不干扰左键拖动。

### 故事线白板

- 故事线支持**单线 / 分支**两种类型，由 start 节点 + 有序节点序列 + 分支边组成。
- 分支边有「激活 / 非激活」状态，激活主线高亮，并带流动边框动画。
- 默认发展顺序可配置为 左→右 / 右→左 / 上→下 / 下→上，节点的把手方向、箭头、外观（上下方向自动切为竖排）随之变化。

### 导出

- **全篇**：选择一条故事线，按连接顺序拼接每个梗概条目的正文。
- **单章**：单独导出某一个章节节点；在其他界面点选了某个章节后，导出页会自动跟随选中该章。
- 自动生成章节序号与卷序号（如 `第1卷 伤心潜叶城`）。
- 可配置：段落开头空两格、段间距、章节头尾空行；配合「每一卷章节数从头开始计数」。
- 一键导出为 `.txt`，并即时预览预计字数。

### AI 写作助手

> AI 功能**可选**：不配置 API Key 时，编辑 / 导出 / 白板等全部功能照常离线可用；配置后即可使用以下能力。所有 AI 调用走后端代理，密钥仅存本机。

- **生文本分析**：粘贴杂糅「设定 / 正文 / 背景 / 解释」的生文本，点「一键分析」，AI 拆出标题、一句话梗概、世界观、人物、概念、剧情；勾选后一键导入概念库，或新建剧情节点写入梗概。
- **识别角色**：从正文中提取人物候选（名称 / 别名 / 身份 / 性格 / 背景）。
- **提炼梗概**：把正文浓缩成梗概条目；支持**按字数分段**（默认 1000 字，可在设置里调），按自然段累积、在段落边界停止，让梗概更浓缩而不是一段一梗概。
- **续写 / 润色 / 审校**：对某条梗概的正文分别续写、润色、审校（流式输出）。
- 这些任务在**浮动任务面板**里后台运行，可并发、可单独导入结果，编辑不受阻塞。

### AI API 配置

- 内置服务商预设：DeepSeek、DeepSeek（Anthropic 兼容）、OpenAI（ChatGPT）、Anthropic（Claude）、通义千问、Kimi、智谱 GLM、Ollama（本地）、自定义。
- 配置 Base URL / 模型 / API Key，并提供「测试连接」。
- **用量统计**：请求次数、输入 / 输出 tokens、预计费用（按模型公开价格估算）；支持按「今天 / 昨天 / 近一周 / 近一个月」切换范围，并可切换柱状 / 折线图，附按模型明细，可一键重置。

### 设置

- 外观模式（日间 / 夜间）。
- 预览：字体、字号、文字区背景色、两侧留白背景色。
- 白板：展开梗概字号、默认发展顺序。
- 章节目录：每一卷章节数从头开始计数、显示章节数（而非 order）。
- 梗概分析：提炼梗概分段字数（越大梗概越浓缩）。

---

## 功能全景

当前侧边栏由 9 个一级模块组成：

| 一级模块 | 说明 |
|---|---|
| 生文本分析 | 粘贴杂糅文本，AI 拆解为标题 / 梗概 / 世界观 / 人物 / 概念 / 剧情，勾选导入 |
| 章节目录 | 节点 / 卷管理、梗概条目编辑、章节数切换 |
| 故事线白板 | 单线 / 分支、激活主线、四向布局 |
| 概念 | 通用 / 人物 / 地点 / 物品，别名与颜色，改名全局替换 |
| 人物 | 人物卡（性格 / 背景 / 身份） |
| 人物关系 | 关系白板、关系连线与方向 |
| 导出 | 全篇 / 单章拼接正文、章节 / 卷序号、格式设置 |
| AI API 配置 | 服务商与密钥配置、用量统计（范围 / 柱状 / 折线） |
| 设置 | 外观、白板、预览、章节计数、梗概分段字数 |

---

## 数据与安全边界

NovelCreator 是一个**本地优先**的应用。后端只监听本机 `127.0.0.1:8765`，不对外提供服务。

| 数据 / 动作 | 去向 |
|---|---|
| 项目数据 | 保存在用户指定的本地文件夹（`project.json` / `concepts.json` / `storylines.json` / `nodes/*.md`） |
| 偏好设置 | 保存在浏览器 `localStorage` |
| AI 配置（API Key） | 保存在**本机后端** `backend/ai_config.json`（已进 `.gitignore`），不进入浏览器、不进入 Git、不上传 |
| 网络请求 | 前端与本地后端之间仅 `localhost` 通信；AI 功能**可选**——配置密钥后，由后端代理访问你指定的 AI 服务商（DeepSeek / 通义 / Kimi / Ollama 等），正文与设定会被发送给该服务商用于处理 |
| 退出 | 点击「退出」会停止本地服务并尝试关闭标签页 |

> 由于数据是普通文件，你可以随时用 Git、云盘或其他方式备份；作者对你的稿件零感知。**使用 AI 功能前请自行确认所选用服务商的数据政策**，敏感稿件建议使用本地模型（Ollama）。

---

## 技术架构

NovelCreator 由「本地 FastAPI 后端 + React 前端」两部分组成，后端既提供 REST API，也托管构建后的前端静态资源。

```text
┌───────────────────────────── 浏览器 ─────────────────────────────┐
│  React 18 + TypeScript 5 + Vite 5                                │
│  ├─ Zustand 4          全局状态                                   │
│  ├─ React Flow 12      人物关系白板 / 故事线白板                    │
│  ├─ CodeMirror 6       正文编辑器（概念彩色高亮）                    │
│  ├─ Recharts           用量统计图表                                │
│  ├─ Tailwind CSS 3     样式                                       │
│  └─ localStorage       偏好设置                                   │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTP (127.0.0.1:8765)
┌───────────────────────────── 后端 ───────────────────────────────┐
│  FastAPI + uvicorn + pydantic + PyYAML + httpx                   │
│  ├─ REST API（项目 / 节点 / 卷 / 概念 / 关系 / 故事线 / 导出 / AI） │
│  ├─ 文件存储层（JSON + Markdown / YAML front-matter）             │
│  ├─ AI 代理层（OpenAI-compatible /chat/completions +             │
│  │   Anthropic Messages API，支持流式；密钥存 ai_config.json）     │
│  ├─ 用量统计（usage_store，记录 tokens 与费用估算）                │
│  └─ 静态资源托管（frontend/dist）                                  │
└──────────────────────────────────────────────────────────────────┘
                        │ 可选（仅 AI 功能、已配置密钥时）
                        ▼
              用户指定的 AI 服务商（DeepSeek / 通义 / Kimi / Ollama …）
```

关键设计：

- **节点存储**：每个章节节点是一个 `nodes/*.md` 文件，YAML front-matter 存标题 / 顺序 / 梗概 / 人物，正文存 Markdown body。
- **顺序模型**：节点与卷共享 `order` 字段，重排即改写 `order`；梗概条目的章节数由 `order` 顺序推导（卷不占章节数）。
- **白板状态**：白板位置与故事线 / 关系线分别持久化，React Flow 只负责呈现与交互。
- **设置持久化**：`useSettings` 通过 Zustand `persist` 存到 `localStorage`（key `ddgame-settings`）；AI 密钥走独立的 `ai_config.json`，绝不混入 localStorage。
- **概念高亮**：按「最长优先」把概念名与别名编译成正则，在 CodeMirror 装饰层渲染彩色字体，且别名改名只替换完全相等的词。
- **AI 容错**：`_extract_json` 容忍代码围栏 / 包裹键 / 首尾噪声，解析失败自动重试一次；`_ask_json` 支持顶层对象与数组两种返回。

---

## 快速启动

### Windows 零基础用户

1. 双击根目录下的 `start.bat`。
2. 脚本会自动：创建后端虚拟环境并安装依赖 → 安装前端依赖 → 构建前端 → 启动服务 → 打开浏览器。
3. 浏览器访问 `http://127.0.0.1:8765`。

> 首次运行需要本机已安装 [Python 3](https://www.python.org/) 与 [Node.js LTS](https://nodejs.org/)。

### 手动启动（macOS / Linux / Windows）

```bash
# 后端
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py

# 前端（另开一个终端，或直接构建静态资源）
cd frontend
npm install
npm run build
```

后端默认监听 `127.0.0.1:8765`，并托管 `frontend/dist/` 构建产物。

---

## 开发与验证

```bash
cd frontend
npm run dev       # Vite 开发服务器（前端热更新）
npm run build     # tsc --noEmit 类型检查 + vite build
```

后端无独立测试命令；改动后端后直接 `python run.py` 启动验证。提交前建议至少跑一次 `npm run build`，确保类型与构建均通过。

---

## 路线图

以下是规划中的方向（未实现，欢迎关注）：

- **一致性工具**：伏笔（埋设 / 呼应 / 回收）、状态表、事实库，映射到现有 JSON 存储。
- **提示词模板与工作流**：透明可编辑的提示词模板、题材包、多步编排。
- **时间轴**：故事年表（当前版本暂缓，仅保留故事线）。
- **导出增强**：docx / pdf 格式、多章节批选。

---

## 适合谁

| 适合 | 不适合 |
|---|---|
| 想要结构化组织长篇 / 系列文的作者 | 只想一键生成完整小说的人 |
| 重视数据自主、希望稿件是本地文件的作者 | 需要多人实时协作和云端团队权限的人 |
| 想用白板梳理人物关系与故事分支的作者 | 已经习惯在线写作平台、不愿本地部署的人 |
| 希望用 AI 辅助提炼 / 续写 / 润色、但密钥留在本机的作者 | 完全不想碰命令行 / 配置运行环境的人 |

---

## License

本项目计划使用 [MIT License](./LICENSE) 开源（请在仓库中添加 `LICENSE` 文件）。你可以自由使用、复制、修改、分发和商用本项目代码；请保留原始版权与许可声明。
