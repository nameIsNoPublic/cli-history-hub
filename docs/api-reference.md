# API 接口参考

## 概述

CLI History Hub 后端提供 9 个 RESTful API 端点，全部定义在 `server.js` 中。所有接口返回 JSON 格式数据，错误时返回 `{ error: string }`。

## 关联功能

- [数据存储](data-storage.md) - API 的数据来源：JSONL 文件解析和 sidecar 元数据读写
- [浏览与导航](browse-and-navigate.md) - 使用 `/api/projects` 和 `/api/projects/:pid/sessions-full`
- [对话详情](conversation-detail.md) - 使用 `/api/projects/:pid/sessions/:sid`（含分页）
- [搜索](search.md) - 使用 `/api/search`
- [会话管理](session-management.md) - 使用 `/api/projects/:pid/sessions/:sid/meta` 和 `/api/tags`
- [统计面板](stats.md) - 使用 `/api/stats`
- [时间线热力图](timeline.md) - 使用 `/api/timeline`
- [Prompt Library](prompts.md) - 使用 `/api/prompts`
- [Codex CLI 集成](codex-integration.md) - Codex 数据源的 API 扩展
- [技术架构](architecture.md) - API 层在整体架构中的位置

## 端点列表

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/projects` | 获取所有项目列表 |
| 2 | GET | `/api/projects/:pid/sessions-full` | 获取项目下的所有会话元数据 |
| 3 | GET | `/api/projects/:pid/sessions/:sid` | 获取单个会话的完整消息 |
| 4 | PUT | `/api/projects/:pid/sessions/:sid/meta` | 更新会话元数据（重命名/标签/收藏） |
| 5 | GET | `/api/search` | 全局全文搜索 |
| 6 | GET | `/api/stats` | Token 用量统计 |
| 7 | GET | `/api/timeline` | 时间线热力图数据 |
| 8 | GET | `/api/tags` | 获取所有已用标签 |
| 9 | GET | `/api/prompts` | 用户 Prompt 列表 |

---

<a id="projects"></a>
## 1. GET /api/projects

获取所有包含会话的项目列表。

### 请求

无参数。

### 响应

```json
[
  {
    "id": "-Users-br-work-myproject",
    "name": "/Users/br_work/myproject",
    "shortName": "br_work/myproject",
    "sessionCount": 15,
    "source": "claude"
  },
  {
    "id": "codex:-Users-br-work-myproject",
    "name": "/Users/br_work/myproject",
    "shortName": "br_work/myproject",
    "sessionCount": 10,
    "source": "codex"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 项目 ID。Claude 项目为目录名，Codex 项目为 `codex:` + 路径转换 |
| `name` | string | 项目的真实路径（从 JSONL 的 `cwd` 字段获取），找不到时从目录名反推 |
| `shortName` | string | 路径最后两段，如 `br_work/myproject` |
| `sessionCount` | number | 会话数量（只计有消息的会话） |
| `source` | string | 数据来源：`"claude"` 或 `"codex"` |

### 排序

按 `sessionCount` 降序排列。

### 实现细节

- 扫描 `~/.claude/projects/` 下所有子目录（Claude 数据源）
- 扫描 `~/.codex/sessions/` 下所有 JSONL 文件（Codex 数据源），按 `cwd` 分组
- 过滤掉以 `.` 开头的隐藏目录
- 跳过没有任何消息的空项目
- 通过 `getProjectPath()` 从 JSONL 文件中提取 `cwd` 字段作为真实路径
- 同一目录的 Claude 和 Codex 项目作为独立条目显示，用 `source` 字段区分

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:354-380 | `GET /api/projects` 路由 |
| server.js:333-345 | `listProjectDirs()` |
| server.js:193-212 | `getProjectPath()` |
| server.js:152-188 | `scanProjectSessions()` |

---

<a id="sessions-full"></a>
## 2. GET /api/projects/:pid/sessions-full

获取指定项目下所有会话的元数据列表。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `pid` | URL 路径 | 项目 ID（即目录名） |

### 响应

```json
[
  {
    "sessionId": "abc123-def456",
    "firstPrompt": "帮我写一个排序算法",
    "customName": "排序项目",
    "displayName": "排序项目",
    "messageCount": 24,
    "created": "2026-03-01T10:00:00Z",
    "modified": "2026-03-01T11:30:00Z",
    "gitBranch": "feature/sort",
    "projectPath": "/Users/br_work/myproject",
    "tags": ["算法", "重要"],
    "isFavorite": true
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionId` | string | 会话 ID（即 .jsonl 文件名，不含扩展名） |
| `firstPrompt` | string | 第一条用户消息的文本（已清理 XML 标签） |
| `customName` | string\|null | 用户自定义名称（优先 sidecar，其次 JSONL 中的重命名记录） |
| `displayName` | string | 显示名称：customName > firstPrompt 前 100 字符 > "Untitled" |
| `messageCount` | number | 用户 + 助手消息数量 |
| `created` | string\|null | 最早时间戳 |
| `modified` | string\|null | 最晚时间戳 |
| `gitBranch` | string\|null | git 分支名（从 JSONL 的 `gitBranch` 字段获取） |
| `projectPath` | string\|null | 项目路径（从 JSONL 的 `cwd` 字段获取） |
| `tags` | string[] | 标签列表（从 sidecar 获取） |
| `isFavorite` | boolean | 是否收藏（从 sidecar 获取） |

### 排序

按 `modified` 降序排列（最新修改的在前）。

### 实现细节

- 使用 mtime 缓存机制：只有 JSONL 文件或 sidecar 文件被修改时才重新解析
- 跳过 `messageCount === 0` 的空会话
- XML 标签清理：去除 `<system-reminder>` 等干扰内容

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:385-394 | `GET /api/projects/:pid/sessions-full` 路由 |
| server.js:152-188 | `scanProjectSessions()` |
| server.js:68-147 | `extractSessionMeta()` |
| server.js:43-51 | `readSidecarMeta()` |

---

<a id="session-detail"></a>
## 3. GET /api/projects/:pid/sessions/:sid

获取单个会话的完整消息内容，支持分页。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `pid` | URL 路径 | 项目 ID |
| `sid` | URL 路径 | 会话 ID |
| `page` | Query | 页码（可选，默认返回全部）。page=1 是最新消息，page=N 是最旧消息 |
| `pageSize` | Query | 每页消息数（可选，默认 30） |

### 响应

```json
{
  "customName": "排序项目",
  "tags": ["算法"],
  "isFavorite": true,
  "messages": [
    {
      "type": "user",
      "uuid": "xxx",
      "timestamp": "2026-03-01T10:00:00Z",
      "text": "帮我写一个排序算法"
    },
    {
      "type": "assistant",
      "uuid": "yyy",
      "timestamp": "2026-03-01T10:00:05Z",
      "model": "claude-sonnet-4-6-20260319",
      "usage": {
        "input_tokens": 1200,
        "output_tokens": 800,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 500
      },
      "gitBranch": "feature/sort",
      "blocks": [
        { "type": "thinking", "thinking": "让我分析..." },
        { "type": "text", "text": "这是一个快速排序实现..." },
        { "type": "tool_use", "name": "Write", "input": { "file_path": "..." } }
      ]
    }
  ],
  "fileChanges": [
    {
      "file": "/Users/br_work/myproject/sort.js",
      "changeCount": 1,
      "operations": [
        {
          "type": "write",
          "timestamp": "2026-03-01T10:00:05Z",
          "content": "function quickSort(arr) { ... }",
          "messageIndex": 1
        }
      ]
    }
  ],
  "totalMessages": 50,
  "page": 1,
  "pageSize": 30,
  "totalPages": 2
}
```

### 消息格式

**用户消息：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | "user" | 固定值 |
| `uuid` | string | 消息 UUID |
| `timestamp` | string | ISO 时间戳 |
| `text` | string | 消息文本（已清理 XML 标签） |

**助手消息：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | "assistant" | 固定值 |
| `uuid` | string | 消息 UUID |
| `timestamp` | string | ISO 时间戳 |
| `model` | string\|null | 模型名称 |
| `usage` | object\|null | Token 用量 |
| `gitBranch` | string\|null | git 分支 |
| `blocks` | array | 内容块数组 |

**blocks 类型：**

| type | 字段 | 说明 |
|------|------|------|
| `text` | `text` | 文本内容 |
| `thinking` | `thinking` | 思考过程文本 |
| `tool_use` | `name`, `input` | 工具调用名称和参数 |
| `tool_result` | `content` | 工具返回结果 |

**fileChanges 格式：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | string | 被修改文件的完整路径 |
| `changeCount` | number | 该文件的变更次数 |
| `operations` | array | 变更操作列表 |

**operations 中每个操作：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | "edit"\|"write" | 操作类型 |
| `timestamp` | string\|null | 操作时间戳 |
| `messageIndex` | number | 对应消息在 messages 数组中的索引 |
| `oldString` | string | （仅 edit）被替换的旧内容 |
| `newString` | string | （仅 edit）替换后的新内容 |
| `content` | string | （仅 write）写入的文件内容 |

`fileChanges` 从所有消息（不受分页影响）中提取 Edit 和 Write 操作，按文件路径分组。

### 分页逻辑

- 不传 `page` 参数时返回所有消息
- `page=1` 返回最新消息，`page=totalPages` 返回最旧消息
- 从消息数组尾部开始切片：`endIdx = total - (page-1) * pageSize`

### 消息合并

连续的 assistant 消息会被合并为一个 turn：
- blocks 数组拼接
- 取较晚的 timestamp
- usage 各字段累加
- 取最后一个的 model

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js | `GET /api/projects/:pid/sessions/:sid` 路由 |
| server.js | `parseSessionMessages()` |
| server.js | `formatUserMessage()` |
| server.js | `formatAssistantMessage()` |
| server.js | `extractFileChanges()` - 从消息中提取文件变更 |

---

<a id="meta"></a>
## 4. PUT /api/projects/:pid/sessions/:sid/meta

更新会话的 sidecar 元数据。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `pid` | URL 路径 | 项目 ID |
| `sid` | URL 路径 | 会话 ID |

**请求体（JSON）- 所有字段均可选：**

```json
{
  "customName": "新名称",
  "tags": ["tag1", "tag2"],
  "isFavorite": true
}
```

### 响应

```json
{
  "ok": true,
  "meta": {
    "customName": "新名称",
    "tags": ["tag1", "tag2"],
    "isFavorite": true,
    "updatedAt": "2026-03-19T12:00:00Z"
  }
}
```

### 实现细节

- 只更新请求体中提供的字段，不影响其他字段
- 写入后自动删除该会话的缓存条目（`sessionCache.delete`）
- sidecar 文件路径：`~/.claude/projects/{pid}/session-meta/{sid}.json`
- 如果 `session-meta` 目录不存在会自动创建

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:462-488 | `PUT /api/projects/:pid/sessions/:sid/meta` 路由 |
| server.js:43-51 | `readSidecarMeta()` |
| server.js:56-63 | `writeSidecarMeta()` |

---

<a id="search"></a>
## 5. GET /api/search

全局全文搜索，搜索所有会话的消息内容。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `q` | Query | **必填**。搜索关键词（大小写不敏感） |
| `project` | Query | 可选。限定搜索的项目 ID |

### 响应

```json
{
  "results": [
    {
      "projectId": "-Users-br-work-myproject",
      "projectName": "/Users/br_work/myproject",
      "sessionId": "abc123",
      "sessionName": "排序项目",
      "matchContext": "...帮我写一个排序算法...",
      "timestamp": "2026-03-01T10:00:00Z"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectId` | string | 项目 ID |
| `projectName` | string | 项目显示名 |
| `sessionId` | string | 会话 ID |
| `sessionName` | string | 会话显示名（sidecar customName > JSONL rename > sessionId 前 8 位） |
| `matchContext` | string | 匹配上下文（前后各 50 字符） |
| `timestamp` | string\|null | 匹配消息的时间戳 |

### 限制

- 最多返回 50 条结果（`MAX_RESULTS = 50`）
- 搜索方式：`String.toLowerCase().indexOf()`，不支持正则
- 搜索范围：用户消息文本和助手消息文本
- 用户消息会先清理 XML 标签再搜索

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:493-596 | `GET /api/search` 路由 |

---

<a id="stats"></a>
## 6. GET /api/stats

获取 Token 用量统计数据。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `project` | Query | 可选。限定统计的项目 ID |

### 响应

```json
{
  "totalTokens": {
    "input": 1500000,
    "output": 500000,
    "cacheCreation": 200000,
    "cacheRead": 800000
  },
  "totalSessions": 50,
  "totalMessages": 400,
  "daily": [
    { "date": "2026-03-15", "input": 50000, "output": 20000 }
  ],
  "byProject": [
    {
      "projectId": "-Users-br-work-myproject",
      "projectName": "/Users/br_work/myproject",
      "input": 100000,
      "output": 40000
    }
  ],
  "byModel": [
    { "model": "claude-sonnet-4-6-20260319", "count": 150, "output": 300000 }
  ]
}
```

### 数据说明

| 字段 | 说明 |
|------|------|
| `totalTokens` | 全量 Token 汇总（input / output / cache_creation / cache_read） |
| `totalSessions` | 有消息的会话总数 |
| `totalMessages` | 用户 + 助手消息总数 |
| `daily` | 近 30 天每日 Token 用量，按日期升序排列 |
| `byProject` | 按项目汇总的 Token 用量，按总量降序排列 |
| `byModel` | 按模型汇总的消息数和输出 Token，按消息数降序排列 |

### 实现细节

- `daily` 只包含最近 30 天的数据
- Token 数据来自 assistant 消息的 `message.usage` 字段
- 不使用缓存，每次请求重新扫描所有 JSONL 文件

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:601-733 | `GET /api/stats` 路由 |

---

<a id="timeline"></a>
## 7. GET /api/timeline

获取时间线热力图数据，按天聚合会话活跃度。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `months` | Query | 可选。回溯月数，默认 3，范围 1-12 |

### 响应

```json
{
  "days": [
    {
      "date": "2026-03-19",
      "sessionCount": 5,
      "messageCount": 120,
      "totalTokens": 45000,
      "sessions": [
        {
          "sessionId": "abc123",
          "projectId": "-Users-br-work-myproject",
          "projectName": "br_work/myproject",
          "title": "排序项目",
          "messageCount": 30
        }
      ]
    }
  ],
  "startDate": "2025-12-19",
  "endDate": "2026-03-19"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `days` | array | 有活跃数据的日期列表，按日期升序 |
| `days[].date` | string | 日期（YYYY-MM-DD） |
| `days[].sessionCount` | number | 当日新建的会话数 |
| `days[].messageCount` | number | 当日会话的消息总数 |
| `days[].totalTokens` | number | 当日 Token 用量（input + output） |
| `days[].sessions` | array | 当日会话列表 |
| `startDate` | string | 时间范围起始日期 |
| `endDate` | string | 时间范围结束日期 |

### 实现细节

- 使用 `scanProjectSessions()` 复用已有缓存获取会话元数据
- 按会话的 `created` 日期归到对应天
- Token 用量通过扫描 JSONL 文件的 assistant 消息 usage 字段聚合
- 只返回时间范围内有数据的日期（无活跃的日期不包含在 days 数组中）

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js | `GET /api/timeline` 路由 |
| server.js | `scanProjectSessions()`（复用） |
| server.js | `listProjectDirs()`（复用） |
| server.js | `getProjectPath()`（复用） |

---

<a id="tags"></a>
## 8. GET /api/tags

获取所有已使用的标签列表（跨所有项目去重）。

### 请求

无参数。

### 响应

```json
{
  "tags": ["算法", "bug修复", "重要"]
}
```

### 实现细节

- 扫描所有项目目录下的 `session-meta/*.json` 文件
- 提取每个文件的 `tags` 数组，去重后按字母排序返回
- 用于标签管理弹窗的"建议标签"功能

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js:738-768 | `GET /api/tags` 路由 |

---

<a id="prompts"></a>
## 9. GET /api/prompts

获取用户 Prompt 列表，支持按项目和会话筛选，支持分页。

### 请求

| 参数 | 位置 | 说明 |
|------|------|------|
| `project` | Query | 可选。限定项目 ID |
| `session` | Query | 可选。限定会话 ID |
| `page` | Query | 可选。页码，默认 1 |
| `pageSize` | Query | 可选。每页条数，默认 50 |

### 响应

```json
{
  "prompts": [
    {
      "projectId": "-Users-br-work-myproject",
      "projectName": "/Users/br_work/myproject",
      "sessionId": "abc123",
      "sessionName": "排序项目",
      "text": "帮我写一个排序算法",
      "timestamp": "2026-03-01T10:00:00Z"
    }
  ],
  "total": 200,
  "page": 1,
  "pageSize": 50,
  "totalPages": 4
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompts` | array | Prompt 列表 |
| `prompts[].projectId` | string | 项目 ID |
| `prompts[].projectName` | string | 项目显示名 |
| `prompts[].sessionId` | string | 会话 ID |
| `prompts[].sessionName` | string | 会话显示名 |
| `prompts[].text` | string | 用户 Prompt 文本 |
| `prompts[].timestamp` | string | Prompt 时间戳 |
| `total` | number | 符合条件的 Prompt 总数 |
| `page` | number | 当前页码 |
| `pageSize` | number | 每页条数 |
| `totalPages` | number | 总页数 |

### 实现细节

- 遍历 JSONL 文件提取用户消息
- 支持按 project 和 session 维度筛选
- 返回结果按时间倒序排列

### 涉及代码

| 文件 | 函数/行号 |
|------|----------|
| server.js | `GET /api/prompts` 路由 |

---

## 修改指南

### 如果要新增 API 端点

1. 在 `server.js` 的 `// API ENDPOINTS` 区块中添加路由
2. 在本文档中添加对应章节
3. 更新引用该 API 的功能文档的 `## API 接口` 章节

### 如果要修改响应格式

1. 修改 `server.js` 中的路由处理函数
2. 修改前端对应模块中调用该 API 的代码
3. 更新本文档中的响应示例和字段说明

### 如果要给所有 API 加统一中间件

1. 在 `server.js` 中 `app.use(express.json())` 之后添加
2. 注意 `express.static` 中间件的位置不要影响静态文件服务

## 已知问题 / TODO

- [ ] 搜索 API 不支持正则表达式
- [ ] 搜索 API 没有分页
- [ ] 统计 API 没有缓存，大量数据时可能较慢
- [ ] 没有请求频率限制
- [ ] 没有错误码规范（只有 400/404/500）
