# OpenCode CLI 集成

## 概述

支持读取 OpenCode CLI 的对话历史数据，与 Claude Code 和 Codex CLI 的数据并行展示。侧边栏项目列表按数据源分组（Claude Code / Codex CLI / OpenCode），OpenCode 会话按工作目录（directory）归属到项目。

## 关联功能

- [技术架构](architecture.md) - 多数据源架构
- [数据存储](data-storage.md) - OpenCode SQLite 数据库说明
- [API 参考](api-reference.md) - API 返回的 `source` 字段
- [浏览与导航](browse-and-navigate.md) - 项目列表中的 OpenCode 标识
- [统计面板](stats.md) - 统计数据包含 OpenCode 用量

## 功能细节

### OpenCode 数据目录

```
~/.local/share/opencode/
  opencode.db                        # SQLite 数据库（主要数据源）
  storage/
    session-meta/                    # Sidecar 元数据目录
      {session-id}.json              # 用户自定义元数据
```

### SQLite 数据库结构

OpenCode 使用 SQLite 数据库存储会话数据，主要表结构：

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `project` | 项目信息 | `id`, `worktree`, `name` |
| `session` | 会话信息 | `id`, `project_id`, `title`, `directory`, `model`, `tokens_*`, `cost` |
| `message` | 消息 | `id`, `session_id`, `data` (JSON) |
| `part` | 消息部分 | `id`, `message_id`, `session_id`, `data` (JSON) |

### 消息格式

**message.data** (JSON):
```json
{
  "role": "user" | "assistant",
  "tokens": {
    "input": 225453,
    "output": 29068,
    "reasoning": 75,
    "cache": { "read": 1024, "write": 0 }
  },
  "modelID": "mimo-v2.5-pro",
  "providerID": "xiaomi",
  "cost": 0.0225,
  "time": { "created": 1778946846355 }
}
```

**part.data** (JSON):
```json
{ "type": "text", "text": "用户消息内容" }
{ "type": "reasoning", "text": "思考过程内容", "time": { "start": ..., "end": ... } }
{ "type": "tool", "tool": "contextweaver_codebase-retrieval", "callID": "...", "state": { "status": "completed", "input": {...}, "output": "..." } }
{ "type": "step-start", "snapshot": "..." }
{ "type": "step-finish", "tokens": {...}, "cost": 0.02 }
```

### 项目分组

- OpenCode 使用 `session.directory` 作为项目归属依据
- 项目 ID 格式：`opencode:` + 数据库中的 `project.id`
- 即使与 Claude Code 或 Codex 的项目目录重叠，也作为独立条目显示

### 会话标识

- 会话 ID 来自数据库 `session.id` 字段（如 `ses_1b167bcdefferfp8anZEsIe4RR`）
- 会话标题来自 `session.title` 字段
- Sidecar 元数据中的 `customName` 优先级最高

### 消息渲染（透传适配方案）

**后端不做格式转换**，直接从 SQLite 数据库读取并透传：
- 返回 `{ source: 'opencode', messages, model, tokens, ... }`
- `messages` 包含完整的 `parts` 数组，字段名保持 OpenCode 原始格式

**前端根据 `source` 字段走不同渲染分支**：
- `chat-view.js:renderOpenCode(data)` — 专门处理 OpenCode 消息

| OpenCode part 类型 | 前端渲染 |
|-------------------|---------|
| `text` | 消息文本（Markdown 渲染） |
| `reasoning` | 可折叠的 Reasoning block |
| `tool` | 可折叠的 Tool block（显示工具名和状态） |
| `step-start` / `step-finish` | 忽略（内部状态） |

### 前端标识

- 侧边栏项目列表按数据源分组：`🟣 CLAUDE CODE`、`🟢 CODEX CLI` 和 `🔵 OPENCODE`，各有独立分组头（带彩色圆点、项目计数、折叠箭头）
- 分组支持点击折叠/收起，状态通过 `localStorage`（`projectGroup_opencode`）持久化
- 消息渲染中，模型名显示 OpenCode 原始模型名（如 `mimo-v2.5-pro`、`MiniMax-M2.7`）
- Token 信息显示 output tokens 和 reasoning tokens

### 静默降级

如果 `~/.local/share/opencode/opencode.db` 文件不存在，所有 OpenCode 相关功能静默跳过，不影响 Claude 和 Codex 数据的正常使用。

## 涉及的代码

| 位置 | 文件 | 关键函数 |
|------|------|---------|
| 后端 | server.js | `getOpenCodeDb()` - 获取 SQLite 数据库连接 |
| 后端 | server.js | `listOpenCodeProjects()` - 按 directory 分组列出项目 |
| 后端 | server.js | `getOpenCodeProjects()` - 带缓存的项目列表 |
| 后端 | server.js | `isOpenCodeProject()` - 判断是否为 OpenCode 项目 |
| 后端 | server.js | `readOpenCodeSidecarMeta()` - 读取 sidecar 元数据 |
| 后端 | server.js | `writeOpenCodeSidecarMeta()` - 写入 sidecar 元数据 |
| 后端 | server.js | `extractOpenCodeSessionMeta()` - 提取会话元数据 |
| 后端 | server.js | `getOpenCodeSessionMessages()` - 获取会话消息 |
| 前端 | public/app.js | `renderProjectList()` - 显示 OpenCode 项目标识 |
| 前端 | public/modules/chat-view.js | `renderOpenCode()` - OpenCode 专用渲染分支 |
| 样式 | public/style.css | `.project-group-header.opencode` - 蓝色圆点标识 |

## API 变更

### GET /api/projects

响应新增 `source: "opencode"` 字段：

```json
{
  "id": "opencode:2bf83a6f1318c9a75851ce22014d2185af939cf3",
  "name": "D:\\Documents\\Pycharm-project\\genealogy-manage-system",
  "shortName": "genealogy-manage-system",
  "sessionCount": 5,
  "source": "opencode"
}
```

### GET /api/projects/:pid/sessions/:sid

OpenCode 会话响应包含：
- `source: "opencode"`
- `messages`: 完整消息数组（含 `parts`）
- `model`: 模型信息对象
- `tokensInput`, `tokensOutput`, `tokensReasoning`: Token 统计
- `cost`: 费用
- `fileChanges`: 空数组（OpenCode 不以相同方式记录文件变更）

### PUT /api/projects/:pid/sessions/:sid/meta

OpenCode 会话的 sidecar 元数据存储在 `~/.local/share/opencode/storage/session-meta/{sessionId}.json`

### POST /api/open-terminal

OpenCode 会话恢复命令：`opencode -s {sessionId}`

## 性能考量

- **SQLite 只读连接**：使用 `better-sqlite3` 的只读模式打开数据库，不影响 OpenCode 正常运行
- **项目缓存**：`getOpenCodeProjects()` 有 30 秒 TTL 缓存，避免频繁查询数据库
- **Sidecar 缓存**：`readOpenCodeSidecarMeta()` 使用文件系统缓存

## 已知限制

- OpenCode 的 `step-start` / `step-finish` 事件当前被忽略
- 文件变更追踪（Diff 视图）对 OpenCode 会话无效
- 搜索功能需要遍历所有消息的 `part.data`，性能可能不如 JSONL 文件扫描

## 修改指南

### OpenCode 会话的 sidecar 元数据

OpenCode 会话已支持 sidecar 元数据：
- sidecar 存储在 `~/.local/share/opencode/storage/session-meta/{sessionId}.json`
- `readOpenCodeSidecarMeta()` 读取 sidecar 的 `customName`/`tags`/`isFavorite`
- `PUT /meta` 路由通过 `isOpenCodeProject()` 分支处理 OpenCode 写入

### 如果要解析 step-start / step-finish 事件

1. 在 `getOpenCodeSessionMessages()` 中添加对这些事件的处理
2. 可以用于显示会话的快照信息或性能指标
