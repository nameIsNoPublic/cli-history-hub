# 数据存储

## 概述

CLI History Hub 不使用数据库，直接读写文件系统。数据由三层组成：JSONL 会话文件（Claude Code 和 Codex CLI 原生生成）、sidecar 元数据文件（本项目自建）、内存缓存。支持双数据源：Claude Code (`~/.claude/projects/`) 和 OpenAI Codex CLI (`~/.codex/sessions/`)。

## 关联功能

- [API 参考](api-reference.md) - 所有 API 端点的数据都来自本层
- [浏览与导航](browse-and-navigate.md) - 会话列表数据来自 JSONL 解析 + sidecar
- [对话详情](conversation-detail.md) - 消息内容来自 JSONL 解析
- [搜索](search.md) - 搜索直接扫描 JSONL 文件内容
- [会话管理](session-management.md) - 重命名/标签/收藏写入 sidecar
- [统计面板](stats.md) - Token 数据来自 JSONL 的 usage 字段
- [Codex CLI 集成](codex-integration.md) - Codex 数据源的 JSONL 格式和解析
- [技术架构](architecture.md) - 数据层在整体架构中的位置

## 功能细节

### 目录结构

```
~/.claude/
  projects/
    -Users-username-myproject/          # 项目目录（路径转换为目录名）
      abc123-def456.jsonl              # 会话文件（Claude Code 生成）
      xyz789.jsonl                     # 另一个会话文件
      session-meta/                    # sidecar 目录（本项目创建）
        abc123-def456.json             # 会话元数据
        xyz789.json
    -Users-username-another/
      ...

~/.codex/
  sessions/
    session-meta/                    # Codex 会话的 sidecar 目录（本项目创建）
      <sessionId>.json               # Codex 会话元数据（重命名/标签/收藏）
    <year>/<month>/<day>/
      rollout-<timestamp>-<uuid>.jsonl
```

### JSONL 会话文件

每个 `.jsonl` 文件是一个会话，每行一个 JSON 对象。这些文件由 Claude Code CLI 原生生成，本项目只读取不修改。

**行类型和关键字段：**

| type | 含义 | 关键字段 |
|------|------|---------|
| `user` | 用户消息 | `message.content`（string 或 content blocks 数组）、`isMeta`（true 表示系统元信息不是真正的用户输入）、`timestamp`、`uuid` |
| `assistant` | 助手消息 | `message.content`（content blocks 数组）、`message.model`、`message.usage`、`timestamp`、`uuid`、`gitBranch` |
| `system` | 系统消息 | `subtype`（如 `local_command`）、`content` |

**用户消息的 content 格式：**
- 纯字符串：`"message": { "content": "帮我写代码" }`
- Block 数组：`"message": { "content": [{ "type": "text", "text": "..." }] }`

**助手消息的 content blocks 类型：**
- `text` - 文本回复
- `thinking` - 思考过程
- `tool_use` - 工具调用（name + input）
- `tool_result` - 工具结果

**usage 字段：**
```json
{
  "input_tokens": 1200,
  "output_tokens": 800,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 500
}
```

**从 JSONL 提取的元数据：**
- `firstPrompt` - 第一条非 meta 用户消息的文本
- `customName` - 从 `system/local_command` 类型中解析 `Session renamed to: xxx`
- `created` / `modified` - 所有行中最早和最晚的 timestamp
- `gitBranch` - 第一个出现的 `gitBranch` 字段
- `projectPath` - 第一个出现的 `cwd` 字段
- `messageCount` - 用户消息 + 助手消息的总数

### Codex CLI JSONL 文件

Codex 的 JSONL 文件位于 `~/.codex/sessions/<year>/<month>/<day>/rollout-<timestamp>-<uuid>.jsonl`，会话索引位于 `~/.codex/session_index.jsonl`。

```
~/.codex/
  session_index.jsonl              # 每行：{ id, thread_name, updated_at }
  sessions/
    2026/03/20/
      rollout-1234567890-abcd-efgh.jsonl
```

**行类型和关键字段：**

| type | payload.type | 说明 |
|------|-------------|------|
| `session_meta` | — | 会话元数据：`cwd`, `model`, `cli_version` |
| `event_msg` | `user_message` | 用户消息：`message` 文本 |
| `event_msg` | `agent_message` | AI 回复：`message` 文本 |
| `event_msg` | `agent_reasoning` | 思考过程：`text` 字段 |
| `event_msg` | `token_count` | Token 用量：`info.total_token_usage.{input_tokens, output_tokens, cached_input_tokens}` |
| `turn_context` | — | 轮次上下文（`cwd`, `model`, `effort`） |

**与 Claude JSONL 的差异：**
- Codex 使用 `type` + `payload` 嵌套结构，Claude 使用扁平结构
- Codex 的 token 用量在独立的 `token_count` 行中，Claude 内嵌在 assistant 消息的 `usage` 字段
- Codex 不记录 `gitBranch`
- Codex 没有 `isMeta` 标记，没有 `system/local_command` 类型

### 内部会话过滤

Claude Code 会产生一些内部会话（非用户真正的对话），在会话列表、搜索、统计、时间线、Prompt 等所有端点中自动过滤：

| 类型 | 检测规则 | 说明 |
|------|---------|------|
| Warmup | `firstPrompt` 为 "warmup"（不区分大小写） | Claude Code 启动时发送的预热请求 |
| Summary | `firstPrompt` 以 "Context: This summary will be shown in a list" 开头 | Claude Code 内部生成对话摘要的请求 |

**检测函数：**
- `isInternalFirstPrompt(text)` — 检查 firstPrompt 文本是否为内部会话
- `checkInternalContent(content)` — 从 JSONL 内容中提取第一条用户消息并检测

**过滤位置：**
- `extractSessionMeta()` 返回 `isInternal` 标志
- `scanProjectSessions()` 过滤 `isInternal` 会话
- 搜索、统计、时间线、Prompt 端点使用 `checkInternalContent()` 过滤

### XML 标签清理

用户消息文本中可能包含 Claude Code 注入的 XML 标签，解析时会被去除：

```javascript
const XML_STRIP_TAGS = [
  'local-command-caveat', 'command-name', 'command-message',
  'command-args', 'local-command-stdout', 'system-reminder',
];
```

清理函数 `stripXmlTags()` 用正则匹配去除这些标签及其内容。

### Sidecar 元数据文件

本项目自建的 JSON 文件，存储用户在 Viewer 中添加的元数据。路径规则：

```
~/.claude/projects/{projectDir}/session-meta/{sessionId}.json
```

**文件格式：**
```json
{
  "customName": "用户自定义会话名",
  "tags": ["tag1", "tag2"],
  "isFavorite": true,
  "isDeleted": false,
  "updatedAt": "2026-03-19T12:00:00Z"
}
```

**命名优先级：** sidecar 的 `customName` > JSONL 中的 rename 记录

**读写时机：**
- 读取：获取会话列表（`scanProjectSessions`）、获取会话详情、搜索时
- 写入：`PUT /api/projects/:pid/sessions/:sid/meta`（重命名/加标签/收藏时）

### 内存缓存

`sessionCache` 是一个 `Map<string, { mtime, sidecarMtime, data }>` 结构：

- **键**：JSONL 文件的绝对路径
- **值**：`{ mtime: number, sidecarMtime: number, data: sessionMeta }`
- **失效条件**：JSONL 文件或对应 sidecar 文件的 `mtimeMs` 变化
- **主动失效**：`PUT /meta` 路由在更新 sidecar 后调用 `sessionCache.delete(cacheKey)`

**缓存流程：**
1. 读取 JSONL 文件的 `stat.mtimeMs`
2. 读取 sidecar 文件的 `stat.mtimeMs`（不存在则为 0）
3. 与缓存中的 mtime 比较，一致则直接返回缓存数据
4. 不一致则重新解析 JSONL + sidecar，更新缓存

**注意：** 统计 API (`/api/stats`) 和搜索 API (`/api/search`) 不使用此缓存，每次请求都完整扫描文件。

**Codex 缓存：**
- `sessionCache` 也缓存 Codex 会话元数据，键前缀为 `codex:`
- `codexProjectCache`（Map）缓存 Codex 项目列表，30 秒 TTL 自动失效
- Codex 会话的首行读取使用 `readCodexSessionHead()`，只读 4KB 避免全量解析

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 后端 | server.js:17 | `sessionCache = new Map()` |
| 后端 | server.js:22-38 | `XML_STRIP_TAGS`, `stripXmlTags()` |
| 后端 | server.js:48-72 | `isInternalFirstPrompt()`, `checkInternalContent()` — 内部会话检测 |
| 后端 | server.js:74-82 | `readSidecarMeta()` |
| 后端 | server.js:87-94 | `writeSidecarMeta()` |
| 后端 | server.js:99-178 | `extractSessionMeta()` — 含 `isInternal` 标志 |
| 后端 | server.js:183-222 | `scanProjectSessions()` - 含缓存逻辑 + 内部会话过滤 |
| 后端 | server.js:193-212 | `getProjectPath()` |
| 后端 | server.js:217-277 | `parseSessionMessages()` |
| 后端 | server.js:279-296 | `formatUserMessage()` |
| 后端 | server.js:298-328 | `formatAssistantMessage()` |

## 修改指南

### 如果要给 sidecar 增加新字段

1. 修改 `server.js` 的 `PUT /meta` 路由，处理新字段的写入
2. 修改 `extractSessionMeta()` 中的 sidecar 读取逻辑，包含新字段
3. 修改 `GET /sessions/:sid` 路由，在响应中返回新字段
4. 前端对应功能中读取和展示新字段

### 如果要优化缓存

1. 统计 API 可以考虑加缓存（当前每次全量扫描）
2. 搜索 API 可以考虑建立索引
3. 注意 sidecar mtime 检查的逻辑，新增缓存时需要包含

### 如果要支持新的 JSONL 行类型

1. 修改 `extractSessionMeta()` 中的解析逻辑
2. 如果新类型包含消息内容，还需修改 `parseSessionMessages()`
3. 如果新类型有特殊的 content 格式，需要添加对应的 `format*Message()` 函数

## 已知问题 / TODO

- [ ] 统计和搜索 API 没有缓存，数据量大时性能差
- [ ] 没有文件锁机制，并发写 sidecar 可能冲突（单用户场景影响不大）
- [ ] JSONL 文件很大时全量读取可能消耗内存
- [ ] 缓存无容量上限和 LRU 淘汰
