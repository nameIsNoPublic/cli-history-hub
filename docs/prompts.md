# Prompt Library（Prompt 武器库）

## 概述

从多个维度浏览用户发送过的所有 Prompt，打造个人的 Prompt 武器库。支持全局、项目级、会话级三种作用域查看，方便复用高质量指令、快速定位历史记忆锚点、复盘提问技巧演进。

## 关联功能

- [对话详情](conversation-detail.md) - chat header 的 Prompts 按钮（会话级入口）
- [浏览与导航](browse-and-navigate.md) - 会话列表 header 的 Prompts 按钮（项目级入口）
- [API 参考](api-reference.md) - GET /api/prompts 端点
- [技术架构](architecture.md) - prompts.js 模块

## 功能细节

### 三级作用域

| 作用域 | 路由 | 说明 |
|--------|------|------|
| 全局（All） | `#/prompts` | 显示所有项目、所有会话的 Prompt |
| 项目级（Project） | `#/prompts/project/{pid}` | 显示指定项目下所有会话的 Prompt |
| 会话级（Session） | `#/prompts/session/{pid}/{sid}` | 显示指定项目指定会话的 Prompt |

路由由 `router.js` 解析 hash 中的 `segments[0] === 'prompts'`，根据后续段数分派到不同作用域。进入视图时 `Prompts.activate(projectId, sessionId)` 自动设置筛选下拉框并加载数据。

### 入口

- **侧边栏 "Prompts" 按钮** → 全局视图 `#/prompts`（`app.js` 中 `dom.promptsBtn` 绑定）
- **会话列表 header "Prompts" 按钮** → 项目级 `#/prompts/project/{pid}`（`app.js` 中 `dom.projectPromptsBtn` 绑定，传入 `state.currentProjectId`）
- **聊天详情 header "Prompts" 按钮** → 会话级 **Toggle 模式**：不跳转页面，直接在当前聊天页面隐藏所有 AI 回复，只显示 USER 消息。再次点击恢复完整对话。激活时按钮高亮、顶部显示 "Showing prompts only" 提示条。（`app.js` 中 `togglePromptsOnly()` 函数控制，通过 `#chatView.prompts-only` CSS class 隐藏 `[data-role="assistant"]` 的 turn）

### Prompt 卡片

每条 Prompt 渲染为一个 `.prompt-card`，包含：

- **项目名**（`.prompt-card-project`）：截取路径最后两段显示（`shortenProjectName()`），hover 显示完整路径，点击调用 `App.selectProject(pid)` 跳转到该项目
- **会话名**（`.prompt-card-session`）：显示 `sessionName` 或 sessionId 前 8 位，点击通过 `window.location.hash` 跳转到该会话详情
- **Prompt 内容**（`.prompt-card-body`）：使用 `marked.parse()` 进行 Markdown 渲染（若 marked 库不可用则降级为纯文本 + `escapeHtml`）
- **时间戳**（`.prompt-card-time`）：调用 `App.formatTime()` 格式化
- **Copy 按钮**（`.btn-copy-prompt`）：复制原始文本到剪贴板，优先使用 `navigator.clipboard.writeText`，失败时降级为 `document.execCommand('copy')`

### 筛选与分页

**筛选（顶栏两个下拉框）：**

- **项目筛选**（`#promptsProjectFilter`）：`loadFilters()` 调用 `/api/projects` 填充选项，选择后触发 `updateSessionFilter()` + `loadPrompts(1)`
- **会话筛选**（`#promptsSessionFilter`）：联动项目筛选 — 选定项目后调用 `/api/projects/:pid/sessions-full` 更新会话列表；未选项目时下拉框禁用（`disabled`）。选择后触发 `loadPrompts(1)`

**分页：**

- 每页 30 条（前端请求 `pageSize=30`，后端默认 `pageSize=50`，以请求参数为准）
- 底部 "Load more prompts..." 按钮（`#promptsLoadMoreBtn`），点击追加加载下一页（`append = true`），已有卡片保留不清空
- 加载第一页时滚动回顶部（`promptsContent.scrollTop = 0`）
- 当 `_currentPage >= _totalPages` 时隐藏 Load more 按钮
- `_isLoading` 标志防止重复请求

### 网格布局

- CSS Grid：`grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`
- 响应式自适应列数，窄屏单列，宽屏自动扩展多列

## 涉及的代码

| 位置 | 文件 | 关键函数 |
|------|------|---------|
| 前端 | public/modules/prompts.js:init() | 初始化 DOM 引用、绑定筛选下拉框 change 事件、Load more 按钮、Refresh 按钮 |
| 前端 | public/modules/prompts.js:activate() | 激活视图，设置筛选下拉框值，加载第一页，更新 sidebar 高亮 |
| 前端 | public/modules/prompts.js:loadFilters() | 请求 /api/projects 填充项目下拉框，然后调用 updateSessionFilter() |
| 前端 | public/modules/prompts.js:updateSessionFilter() | 请求 /api/projects/:pid/sessions-full 填充会话下拉框，未选项目时禁用 |
| 前端 | public/modules/prompts.js:loadPrompts() | 请求 /api/prompts 加载 Prompt 列表，支持 append 追加模式 |
| 前端 | public/modules/prompts.js:createPromptCard() | 创建单个 Prompt 卡片 DOM，绑定项目/会话跳转和 Copy 事件 |
| 前端 | public/modules/prompts.js:shortenProjectName() | 截取路径最后两段作为项目短名 |
| 前端 | public/modules/prompts.js:copyToClipboard() | 复制到剪贴板（Clipboard API + execCommand 降级） |
| 前端 | public/modules/router.js:47-55 | 解析 `#/prompts`、`#/prompts/project/{pid}`、`#/prompts/session/{pid}/{sid}` 路由 |
| 前端 | public/modules/router.js:113-118 | `case 'prompts'` — 调用 Prompts.activate() |
| 前端 | public/app.js:51-52 | DOM 引用：promptsBtn、projectPromptsBtn |
| 前端 | public/app.js:819-841 | 三个入口按钮的 click 事件绑定 |
| 前端 | public/app.js:131 | viewMap 中 `prompts: 'promptsView'` |
| 前端 | public/index.html:22 | 侧边栏 Prompts 按钮 |
| 前端 | public/index.html:158-172 | `#promptsView` 视图 HTML 结构（header + 筛选下拉 + grid + load more） |
| 前端 | public/style.css | `.prompts-*` 相关样式（header、content、grid、card、footer 等） |
| 后端 | server.js:912-1006 | `GET /api/prompts` — 遍历 JSONL 提取 user 消息，排序分页返回 |

## API 接口

### GET /api/prompts

提取所有会话中的用户 Prompt，按时间倒序排列，支持筛选和分页。

**请求参数（query string）：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| project | string | 否 | - | 项目 dirName，限定特定项目 |
| session | string | 否 | - | 会话 ID，限定特定会话（需配合 project） |
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 50 | 每页条数 |

**后端处理流程：**

1. `listProjectDirs()` 获取所有项目目录，按 `project` 参数过滤
2. 遍历项目下的 `.jsonl` 文件（按 `session` 参数过滤）
3. 逐行解析 JSON，提取 `type === 'user'` 且 `!isMeta` 的消息
4. 从 `message.content`（string 或 array）中提取文本，`stripXmlTags()` 清理注入标签
5. 同时收集 sessionName（优先 sidecar customName，其次 JSONL 中的 rename 系统消息）
6. 按 `timestamp` 降序排序
7. 分页切片返回

**响应格式：**

```json
{
  "prompts": [
    {
      "projectId": "dirName",
      "projectName": "/Users/xxx/project",
      "sessionId": "abc123...",
      "sessionName": "My Session",
      "text": "prompt content...",
      "timestamp": "2026-03-20T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50,
  "totalPages": 3
}
```

## 修改指南

### 如果要新增 Prompt 卡片的展示字段

1. 后端 `server.js` 的 `GET /api/prompts` 路由中，在 `allPrompts.push({...})` 处添加新字段（如 `tokenCount`、`turnIndex`）
2. 前端 `prompts.js` 的 `createPromptCard()` 中渲染新字段的 HTML
3. `public/style.css` 中添加对应的样式类
4. 更新 `docs/api-reference.md` 中的响应格式说明

### 如果要修改分页大小

1. 前端 `prompts.js` 的 `loadPrompts()` 中修改 URL 拼接的 `pageSize=30`
2. 后端默认值在 `server.js:919` 的 `parseInt(req.query.pageSize, 10) || 50`
3. 注意：前端当前写死 30，后端默认 50，实际生效值以前端请求参数为准

### 如果要新增入口按钮

1. `public/index.html` 中添加按钮 HTML（参考已有的 `#promptsBtn`）
2. `public/app.js` 中添加 DOM 引用和 click 事件绑定
3. 事件中调用 `Prompts.activate(projectId, sessionId)` 并更新路由
4. 如需新的路由模式，在 `router.js` 的 `parseHash()` 中添加对应的解析分支

### 如果要添加 Prompt 内容搜索

1. 后端 `GET /api/prompts` 添加 `q` 查询参数，在提取 Prompt 后用 `indexOf` 或正则过滤
2. 前端 `prompts.js` 在顶栏添加搜索输入框，输入时加防抖（300ms），触发 `loadPrompts(1)`
3. 搜索关键词拼接到 API URL 的 query string 中

## 已知问题 / TODO

- [ ] 没有搜索框（只有项目/会话筛选，不能搜索 Prompt 内容）
- [ ] 没有 Prompt 收藏/标记功能
- [ ] 卡片内容过长时没有折叠/展开机制
- [ ] 后端每次请求都重新遍历所有 JSONL 文件，无缓存，大量数据时可能较慢
- [ ] `session` 参数需配合 `project` 使用，单独传 session 无效（因为遍历逻辑先按 project 过滤再按 session 过滤文件名）
