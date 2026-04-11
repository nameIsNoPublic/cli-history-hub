# CLAUDE.md

## 项目概述

CLI History Hub — 本地 Web 应用，浏览和管理 Claude Code CLI 和 OpenAI Codex CLI 的对话历史。
Node.js + Express 后端，原生 JS 前端，无数据库，直接读取 `~/.claude/projects/` 和 `~/.codex/sessions/` 下的 JSONL 文件。

## 启动命令

```bash
npm install    # 安装依赖（仅 express）
node server.js # 启动服务，http://localhost:3456
```

## 项目结构

```
server.js                 # 全部后端逻辑（Express + 10 个 API + JSONL 解析 + 缓存）
public/
  index.html              # SPA 入口（6 视图 + 6 弹窗）
  style.css               # 全局 CSS，暗色主题
  app.js                  # 主应用（window.App）：状态管理、视图切换、项目/会话列表
  modules/
    router.js             # Hash 路由（window.Router）
    chat-view.js          # 消息渲染 + 分页（window.ChatView）
    search.js             # 全局搜索弹窗（window.Search）
    stats.js              # 统计面板 + Canvas 图表（window.Stats）
    features.js           # 重命名/标签/收藏/导出（window.Features）
    prompts.js            # Prompt Library（window.Prompts）
docs/                     # 项目文档（详见 docs/README.md）
```

## 核心开发规范

1. **只读 JSONL** — `~/.claude/projects/` 和 `~/.codex/sessions/` 下的 `.jsonl` 文件只读不写。用户数据（重命名、标签、收藏）写入独立的 `session-meta/*.json` sidecar 文件。
2. **轻量前端** — 原生 JS + CSS，不引入 React/Vue 等框架，不使用构建工具。模块通过 `window.*` 全局对象通信。
3. **唯一依赖** — 后端只依赖 express，不引入额外 npm 包除非必要。
4. **安全** — 后端读取文件时必须校验路径合法性，防止目录遍历。不暴露非日志相关的系统文件。

## 前端模块通信

- 模块在 `index.html` 中按顺序加载：router → search → chat-view → stats → features → app
- 各模块暴露为 `window.Router`、`window.Search`、`window.ChatView`、`window.Stats`、`window.Features`
- `app.js`（`window.App`）是主编排器，调用各模块的 `init()` 并暴露共享工具函数：`api()`, `escapeHtml()`, `formatDate()`, `formatTime()`, `showView()`, `showToast()`
- Router ↔ App 双向调用，用 `_routerDriven` 和 `_navigating` 标志防止循环

## 10 个 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| GET | `/api/projects/:pid/sessions-full` | 会话元数据列表（带缓存） |
| GET | `/api/projects/:pid/sessions/:sid` | 会话消息（支持 `?page=N&pageSize=30` 分页） |
| PUT | `/api/projects/:pid/sessions/:sid/meta` | 更新 sidecar 元数据 |
| GET | `/api/search?q=keyword&project=pid` | 全文搜索（最多 50 条） |
| GET | `/api/stats?project=pid` | Token 用量统计 |
| GET | `/api/tags` | 所有已用标签 |
| GET | `/api/timeline` | 时间线热力图数据 |
| GET | `/api/prompts` | 用户 Prompt 列表 |
| POST | `/api/open-terminal` | 打开系统终端恢复会话 |

## 数据层要点

- **缓存**：`sessionCache`（Map）按 JSONL 文件路径缓存会话元数据，通过 mtime + sidecar mtime 失效
- **消息合并**：连续 assistant 消息合并为一个 turn（blocks 拼接、usage 累加）
- **XML 清理**：用户消息去除 `<system-reminder>` 等 Claude Code 注入的 XML 标签
- **智能标题**：customName > 有意义的 firstPrompt > displayName > "Untitled"

## 代码与文档同步（必须遵守）

**改代码前先看文档，改完代码后必须改文档。**

每个功能都有对应的文档，文档中记录了涉及的代码文件、关键函数、API 接口和修改指南。文档索引见 [docs/README.md](docs/README.md)。

### 改代码之前

1. 先到 `docs/` 下找到对应功能的文档，阅读 `## 涉及的代码` 和 `## 修改指南` 章节
2. 了解这个功能涉及哪些文件、函数之间的依赖关系、改动时有哪些注意事项
3. 查看 `## 关联功能` 了解改动可能影响到的其他功能

### 改完代码之后

必须同步更新 `docs/` 下受影响的文档，包括但不限于：
- `## 涉及的代码` 中的文件路径、函数名、行号
- `## 功能细节` 中的行为描述（如果功能逻辑变了）
- `## API 接口` 和 `docs/api-reference.md`（如果 API 变了）
- `## 关联功能` 中的交叉引用（如果新增/删除了功能间的关联）
- `## 已知问题 / TODO`（如果修复了已知问题或引入了新的限制）

### 功能 → 文档对照表

| 改了什么 | 要更新哪些文档 |
|---------|--------------|
| API 端点 | `docs/api-reference.md` + 使用该 API 的功能文档 |
| JSONL 解析 / sidecar / 缓存 | `docs/data-storage.md` |
| 项目列表 / 会话列表 / 路由 | `docs/browse-and-navigate.md` |
| 消息渲染 / 分页 | `docs/conversation-detail.md` |
| 文件变更 Diff 视图 | `docs/diff-viewer.md` |
| 搜索 | `docs/search.md` |
| 重命名 / 收藏 / 标签 | `docs/session-management.md` |
| 导出 | `docs/export.md` |
| 统计 / 图表 | `docs/stats.md` |
| 时间线热力图 | `docs/timeline.md` |
| Prompt Library / prompts.js | `docs/prompts.md` |
| 深色/浅色主题 | `docs/theme.md` |
| 技术栈 / 模块结构 / 新增模块 | `docs/architecture.md` |
| Codex 数据源 / 双源集成 | `docs/codex-integration.md` + `docs/data-storage.md` |
| 新增功能 | 新建文档 + 更新 `docs/README.md` 和根 `README.md` |

## 可用工具

- **auggie-mcp** — 代码库检索 MCP。需要查询业务代码时（如定位函数调用链、理解模块间关系、查找某个功能的实现位置等），可以调用 `mcp__auggie-mcp__codebase-retrieval` 辅助检索，不必每次都手动 Grep/Read。适合在以下场景使用：
  - 不确定某个功能的代码分布在哪些文件中
  - 需要理解某个函数的上下游调用关系
  - 修改前需要快速了解相关代码的全貌

## Git 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]
```

**type：**
- `feat` — 新功能
- `fix` — 修复 bug
- `docs` — 仅文档变更
- `style` — 样式调整（不影响逻辑）
- `refactor` — 重构（不新增功能也不修复 bug）
- `perf` — 性能优化
- `chore` — 构建/配置/依赖等杂项

**scope（可选）：** `server` / `app` / `router` / `chat-view` / `search` / `stats` / `features` / `api` / `docs`

**示例：**
```
feat(search): add regex support for global search
fix(server): fix cache invalidation on sidecar update
docs(api): update search endpoint response format
```

## 修改代码时注意

- 后端所有逻辑在 `server.js` 单文件中，修改时注意函数间的依赖关系
- 前端修改样式只改 `style.css`，不要加 inline style
- 新增前端模块：在 `public/modules/` 创建文件 → `index.html` 中 `app.js` 前添加 script → `app.js` 的 `init()` 中调用
- sidecar 增加新字段：改 PUT /meta 路由 → 改 extractSessionMeta() → 改前端对应模块
