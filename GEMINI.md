# GEMINI.md

**核心设定：在所有对话中请严格执行“全程说中文”。**

---

## 项目概述
CLI History Hub — 本地 Web 应用，用于浏览和管理 Claude Code CLI 及 Codex 的对话历史。
后端完全基于 Node.js + Express，前端纯原生 JS/CSS，无数据库，直接读取 `~/.claude/projects/` 和 `~/.codex/sessions/` 下的 JSONL 文件。

## 启动命令
```bash
npm install    # 安装依赖（仅 express）
npm start      # 启动服务，浏览器访问 http://localhost:3456
```

## 项目结构与模块划分
```
─ server.js                 # 全部后端逻辑（Express + 10 个 API + JSONL 解析 + 缓存机制）
─ public/
  ├─ index.html             # SPA 入口（6 视图 + 6 弹窗）
  ├─ style.css              # 全局 CSS，暗色主题
  ├─ app.js                 # 主应用（window.App）：状态管理、视图切换、项目/会话列表编排
  └─ modules/
     ├─ router.js           # Hash 路由（window.Router）
     ├─ chat-view.js        # 消息渲染 + 分页（window.ChatView）
     ├─ search.js           # 全局搜索弹窗（window.Search）
     ├─ stats.js            # 统计面板 + Canvas 图表（window.Stats）
     ├─ prompts.js          # Prompts 指令库（window.Prompts）
     └─ features.js         # 重命名/标签/收藏/导出（window.Features）
─ docs/                     # 项目说明文档目录（详见 docs/README.md）
```

## 核心开发与架构规范 (严格遵守)

1. **绝对只读 JSONL**：`~/.claude/projects/` 和 `~/.codex/sessions/` 下的 `.jsonl` 文件只允许读取。所有的用户侧数据（重命名、标签、收藏等）必须写入独立的 `session-meta/*.json` sidecar 文件中。
2. **轻量极简前端**：坚持原生 Vanilla JS + CSS。**严禁**引入 React/Vue 等框架，**严禁**使用 Webpack/Vite 等构建工具。模块间一律通过 `window.*` 全局对象进行通信。
3. **单一依赖后端**：`package.json` 的生产依赖仅限 `express`，除非绝对必要，不引入额外 npm 包。
4. **安全底线**：后端读取文件时必须做路径合法性校验，严防目录遍历（Path Traversal），绝不能向外暴露非日志相关的系统文件。
5. **前端数据流**：模块入口在 `index.html` 按顺序加载。`app.js`（`window.App`）作为主编排器调用各子模块的 `init()`，并暴露公共工具（如 `api()`, `escapeHtml()`, `showView()`）。Router 与 App 之间双向调用时由标志位防死循环。

## 数据层与 API 机制

- **服务端缓存**：`sessionCache`（Map）按 JSONL 路径在内存中缓存解析好的会话元数据。缓存失效严格依赖双 `mtime`（JSONL 文件修改时间 + sidecar 文件修改时间）。
- **消息清洗与合并**：必须拦截过滤用户消息中 Claude 自动注入的 XML 标签（如 `<system-reminder>`）。对连续的 AI 助理回复，必须在服务端将其合并为一个完整的 Turn（含 Usage 累加）。
- **8 大核心 API 端点**：
  - `GET /api/projects`
  - `GET /api/projects/:pid/sessions-full`
  - `GET /api/projects/:pid/sessions/:sid` (原生支持 `?page=&pageSize=` 分页)
  - `PUT /api/projects/:pid/sessions/:sid/meta`
  - `GET /api/search?q=keyword&project=pid`
  - `GET /api/stats?project=pid`
  - `GET /api/tags`
  - `GET /api/prompts?project=&session=&page=`

## 代码与文档同步铁律
**改代码前先看文档，改完代码后必须改文档。**
一旦接手开发任务，修改任何功能逻辑、API 或数据流，**必须**同步更新 `docs/` 目录下对应的 Markdown 文档（见 `docs/README.md`）。不得存在代码与文档脱节的情况。

## Git 提交规范
必须遵循 Conventional Commits 规范，并在提交时提供准确的上下文：
- `<type>(<scope>): <description>` (常见 type: feat, fix, docs, refactor, style)
- 可选 scope 域: `server` / `app` / `router` / `chat-view` / `search` / `stats` / `features` / `api` / `docs`

## 修改代码避坑指南
1. **服务端单文件**：所有后端 Node.js 逻辑都在 `server.js` 单文件中，修改时仔细处理函数依赖，不要盲目拆分文件。
2. **前端样式**：所有界面修改只允许更改 `public/style.css`，**绝不允许**在 HTML 或 JS 中塞入 Inline Style 控制样式。
3. **元数据拓展**：如需在 sidecar 增加新字段（如新出处），需联动修改 `PUT /meta` 路由、`extractSessionMeta()` 解析函数及对应的前端数据消费模块。
