# Codex CLI 集成

## 概述

支持读取 OpenAI Codex CLI 的对话历史数据，与 Claude Code 的数据并行展示。侧边栏项目列表按数据源分组（Claude Code / Codex CLI），Codex 会话按工作目录（cwd）归属到项目。

## 关联功能

- [技术架构](architecture.md) - 双数据源架构
- [数据存储](data-storage.md) - Codex JSONL 格式说明
- [API 参考](api-reference.md) - API 返回的 `source` 字段
- [浏览与导航](browse-and-navigate.md) - 项目列表中的 Codex 标识
- [统计面板](stats.md) - 统计数据包含 Codex 用量

## 功能细节

### Codex 数据目录

```
~/.codex/
  session_index.jsonl              # 会话索引（id → thread_name 映射）
  sessions/
    <year>/<month>/<day>/
      rollout-<timestamp>-<uuid>.jsonl   # 单个会话文件
```

### JSONL 消息格式

Codex 的 JSONL 每行是一个 JSON 对象，`type` 字段区分行类型：

| type | payload.type | 说明 |
|------|-------------|------|
| `session_meta` | — | 会话元数据：`id`, `cwd`, `model_provider`, `cli_version`, `model` |
| `event_msg` | `user_message` | 用户消息：`message` 字段为文本 |
| `event_msg` | `agent_message` | AI 回复：`message` 字段为文本 |
| `event_msg` | `agent_reasoning` | 思考过程：`text` 字段 |
| `event_msg` | `token_count` | Token 用量：`info.total_token_usage` |
| `response_item` | — | 原始消息（可能与 event_msg 重复，当前忽略） |
| `turn_context` | — | 轮次上下文：`cwd`, `model`, `effort` |

### 项目分组

- Codex 使用 `session_meta.payload.cwd` 作为项目归属依据
- 项目 ID 格式：`codex:` + cwd 路径转换（`/` 替换为 `-`）
- 即使与 Claude Code 的项目目录重叠，也作为独立条目显示

### 会话标识

- 会话 ID 来自文件名中的 UUID 部分（`rollout-<timestamp>-<uuid>.jsonl` 中的 `<uuid>`）
- `session_index.jsonl` 中的 `thread_name` 作为会话的 `displayName`

### 消息渲染（透传适配方案）

**后端不做格式转换**，`parseCodexMessages()` 直接透传原始 Codex 事件数据：
- 返回 `{ source: 'codex', sessionMeta, rawEvents }`
- `rawEvents` 包含所有 `event_msg` 和 `turn_context` 原始行，字段名保持 Codex 原始格式

**前端根据 `source` 字段走不同渲染分支**：
- `chat-view.js:renderCodex(data)` — 专门处理 Codex 原始事件
- Codex 独有数据完整保留：`reasoning_output_tokens`、`effort`、`cached_input_tokens` 等

| Codex event_msg 类型 | 前端渲染 |
|---------------------|---------|
| `user_message` | User turn（同 Claude） |
| `agent_message` | Assistant turn，模型名从 `turn_context.model` 获取 |
| `agent_reasoning` | 可折叠的 Reasoning block |
| `token_count` | 附加到上一个 assistant turn 的 token badge，包含 reasoning tokens |

### 前端标识

- 侧边栏项目列表按数据源分组：`🟣 CLAUDE CODE` 和 `🟢 CODEX CLI`，各有独立分组头（带彩色圆点、项目计数、折叠箭头）
- 分组支持点击折叠/收起，状态通过 `localStorage`（`projectGroup_codex`）持久化
- 消息渲染中，模型名显示 Codex 原始模型名（如 `GPT-5.4`、`o3`）
- Token 信息保留 Codex 独有的 reasoning token 统计

### 静默降级

如果 `~/.codex` 目录不存在，所有 Codex 相关功能静默跳过，不影响 Claude 数据的正常使用。

## 涉及的代码

| 位置 | 文件 | 关键函数 |
|------|------|---------|
| 后端 | server.js | `readCodexSessionIndex()` - 读取会话索引 |
| 后端 | server.js | `findCodexJsonlFiles()` - 递归查找 JSONL 文件 |
| 后端 | server.js | `codexSessionIdFromPath()` - 从文件名提取 session ID |
| 后端 | server.js | `readCodexSessionHead()` - 读取首行元数据 |
| 后端 | server.js | `listCodexProjects()` - 按 cwd 分组列出项目 |
| 后端 | server.js | `getCodexProjects()` - 带缓存的项目列表 |
| 后端 | server.js | `extractCodexSessionMeta()` - 提取会话元数据 |
| 后端 | server.js | `parseCodexMessages()` - 透传原始事件（不做格式转换） |
| 前端 | public/modules/chat-view.js | `renderCodex()` - Codex 专用渲染分支 |
| 后端 | server.js | `isCodexProject()` - 判断是否为 Codex 项目 |
| 后端 | server.js | `findCodexSessionFile()` - 查找会话文件路径 |
| 前端 | public/app.js | `renderProjectList()` - 显示 Codex 项目标识 |
| 样式 | public/style.css | `.project-group-header` - 分组头样式（紫色/绿色圆点） |

## API 变更

### GET /api/projects

响应新增 `source` 字段：

```json
{
  "id": "codex:-Users-br-work-myproject",
  "name": "/Users/br_work/myproject",
  "shortName": "br_work/myproject",
  "sessionCount": 10,
  "source": "codex"
}
```

### GET /api/projects/:pid/sessions/:sid

Codex 会话响应新增 `source: "codex"` 字段，且 `fileChanges` 固定为空数组（Codex 不记录文件变更）。

### 其他 API

搜索、统计、时间线、Prompt Library 均已扩展为同时遍历 Codex 数据。

## 性能考量

- **Codex 项目缓存**：`getCodexProjects()` 有 30 秒 TTL 缓存，避免频繁扫描文件系统
- **按需解析**：`readCodexSessionHead()` 只读取文件首行（16KB buffer，因 Codex 的 session_meta 可能含长 instructions 字段超过 4KB），不全量解析
- **空会话过滤**：`/api/projects` 和 `/api/projects/:pid/sessions-full` 均过滤 messageCount 为 0 的会话，确保计数一致
- **元数据缓存**：`extractCodexSessionMeta()` 使用 `sessionCache`（以 `codex:` 前缀区分），通过 mtime 失效

## 已知限制

- Codex 会话不支持 sidecar 元数据（重命名、标签、收藏），因为 Codex 文件分散在日期目录中
- Codex 不记录 `gitBranch`，分支筛选不适用于 Codex 会话
- Codex 不记录文件变更（无 tool_use），Diff 视图对 Codex 会话无效
- `response_item` 类型的行当前被忽略（避免与 `event_msg` 重复计数）

## 修改指南

### 如果要支持 Codex 会话的 sidecar 元数据

1. 需要为 Codex 会话定义 sidecar 存储路径（建议 `~/.codex/session-meta/<sessionId>.json`）
2. 修改 `extractCodexSessionMeta()` 读取 sidecar
3. 修改 `PUT /meta` 路由支持 Codex 项目的写入
4. 修改缓存失效逻辑包含 sidecar mtime

### 如果要解析 response_item 类型

1. 在 `parseCodexMessages()` 中添加 `response_item` 处理
2. 注意去重：同一条消息可能同时出现在 `event_msg` 和 `response_item` 中
