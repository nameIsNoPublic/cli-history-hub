# 浏览与导航

## 概述

用户通过项目列表、会话列表、时间分组、分支筛选和 URL 路由来定位并打开目标会话。

## 关联功能

- [搜索](search.md) - 搜索结果点击后跳转到会话详情
- [对话详情](conversation-detail.md) - 点击会话卡片进入对话详情
- [会话管理](session-management.md) - 收藏状态影响列表排序（Pinned 分组置顶）
- [统计面板](stats.md) - 通过侧边栏按钮或 URL 路由进入统计页
- [数据存储](data-storage.md) - 会话元数据的来源（JSONL + sidecar）
- [API 参考](api-reference.md) - 项目列表和会话列表的 API 端点
- [技术架构](architecture.md) - 路由和视图切换的整体设计

## 功能细节

### 返回首页

点击侧边栏顶部的 "Claude Code" 或 "History Viewer" 文字可返回 Welcome 首页（`#/`），同时清除当前项目/会话选中状态和所有 sidebar 按钮高亮。

**涉及的代码：**
- `index.html`：`#homeBtn`（h1）+ `#homeBtnSub`（p），class `home-link`
- `app.js:bindEvents()` 中 `goHome()` 函数
- `style.css`：`.home-link` hover 透明度效果

### 项目列表

侧边栏展示所有包含会话的项目，按数据源分组（`🟣 CLAUDE CODE` / `🟢 CODEX CLI`），各组内按会话数量降序排列。

**显示内容：**
- 分组头：彩色圆点 + 数据源名称 + 项目计数 + 折叠箭头（chevron）
- 项目短名称（路径最后两段，如 `username/myproject`）
- 会话数量徽章
- 当前选中项目高亮

**分组折叠/收起：**
- 点击分组头可折叠/展开该组的项目列表
- 折叠时 chevron 旋转 -90°，项目列表隐藏
- 折叠状态通过 `localStorage` 持久化（key: `projectGroup_claude` / `projectGroup_codex`）
- 涉及的代码：`app.js:renderProjectGroup()` 函数、`style.css` 的 `.project-group-wrapper.collapsed` 样式

**交互：**
- 点击项目 → 加载会话列表 → URL 变为 `#/project/{pid}`
- 会自动更新侧边栏高亮状态

### 侧边栏可拖拽调整宽度

侧边栏和主内容区之间有一条可拖拽的分隔条（splitter），用户可以拖动调整侧边栏宽度。

**行为：**
- 鼠标悬停分隔条时变蓝色高亮，光标变为 `col-resize`
- 拖拽范围限制在 180px ~ 500px
- 宽度自动保存到 `localStorage`（key: `sidebarWidth`），下次打开自动恢复

**涉及的代码：**
| 位置 | 文件 | 说明 |
|------|------|------|
| 前端 | public/index.html | `#splitter` div（sidebar 和 content 之间） |
| 前端 | public/app.js:initSplitter() | 拖拽逻辑 + localStorage 持久化 |
| 前端 | public/style.css | `.splitter` 样式（宽度、光标、hover/dragging 状态） |

### 会话列表

展示选中项目的所有会话，支持时间分组和筛选。

**会话卡片包含：**
- **标题**（智能标题逻辑，见下文）：`.session-title`，`font-weight: 600`，`font-size: 15px`，`margin-bottom: 12px`
- **副标题**（firstPrompt 预览，仅当与标题不同时显示）：`.session-subtitle`，`color: var(--text-secondary)`，`font-size: 12px`，`opacity: 0.85`
- **元信息行**：修改时间、消息数、git 分支（`.session-meta`，增加顶部间距）
- **Session ID**：`.session-id`，等宽字体显示后 8 位短哈希（如 `#217ab29f`），右对齐低透明度，hover 变亮，点击复制完整 session ID 到剪贴板（`stopPropagation` 不触发卡片跳转）
- **标签列表**：`.session-tags`
- **收藏星标**：`.session-star`（仅收藏的会话在标题左侧显示）

**智能标题逻辑 (`smartTitle`)：**
1. 有 `customName` → 直接用
2. `displayName` 是通用词（hi/hello/test/untitled 等，或单词且 <= 6 字符）→ 尝试用 `firstPrompt`
3. `firstPrompt` 超过 10 字符 → 截断到 80 字符显示
4. 其他 → 用 `displayName`，兜底 "Untitled"

### 时间分组

会话按修改时间自动分组显示：

| 分组名 | 条件 |
|--------|------|
| Pinned | `isFavorite === true` 的会话（始终置顶） |
| Today | 今天 |
| Yesterday | 昨天 |
| This Week | 2-6 天前 |
| This Month | 7-29 天前 |
| Earlier | 30 天及更早 |

**实现：** `getTimeGroup()` 函数将日期转为分组名，比较的是日历日期（不含时间），空分组不渲染。

### Prompts 按钮

会话列表 header 区域有一个 Prompts 按钮，点击后跳转到 Prompt Library 视图，自动筛选当前项目的所有用户 Prompt。

### 分支筛选

会话列表头部的下拉框，可按 git 分支过滤会话。

**实现：**
1. 从当前项目的所有会话中收集唯一的 `gitBranch` 值
2. 按字母排序填充到 `<select>` 中
3. 选择分支后调用 `applyFilters()` 重新渲染列表
4. "All Branches" 选项清除筛选

### 列表内搜索

会话列表头部的文本输入框，实时过滤会话。支持两级搜索：本地元数据匹配 + 异步消息内容搜索。

**搜索范围：**
1. **即时匹配（本地）：** `displayName` + `firstPrompt` + `customName` + `tags`
2. **延迟匹配（API）：** 调用 `/api/search` 搜索会话消息正文内容，将命中的 session 补充进结果

**实现：** 输入时触发 `input` 事件 → `applyFilters()` → 先做本地元数据 `indexOf` 匹配并立即渲染，同时 300ms 防抖后异步调用 `/api/search`，将内容匹配到的 session 合并去重后重新渲染。分支筛选和文本搜索可叠加。用 `_filterSearchVersion` 版本号防止过期的异步结果覆盖新的搜索。

### URL 路由

使用 hash 路由，支持浏览器前进/后退和直接访问。

| 路由 | 视图 |
|------|------|
| `#/` | 欢迎页 |
| `#/project/{pid}` | 会话列表 |
| `#/project/{pid}/session/{sid}` | 对话详情 |
| `#/stats` | 统计面板（全部项目） |
| `#/stats/{pid}` | 统计面板（特定项目） |

**路由机制：**
- `Router.parseHash()` 解析 hash 为 `{ view, projectId, sessionId }`
- `Router.handleRoute()` 调用对应的 `App.*` 方法
- `App` 的操作反过来调用 `Router.navigate()` 设置 hash
- 用 `_routerDriven` 和 `_navigating` 双标志防止循环调用

**页面加载时：** 如果 URL 含有 hash，`Router.init()` 会解析并导航到对应视图。

### 数据刷新

两种方式确保用户看到最新数据：

**自动刷新：** 利用浏览器的 `visibilitychange` 事件，当用户从其他标签页切回 Viewer 时，自动重新请求当前视图的数据。零轮询、零 WebSocket。

**手动刷新：** 会话列表和对话详情头部各有一个刷新按钮（&#8635;），点击重新加载当前视图数据。

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 前端 | public/app.js:226-258 | `loadProjects()`, `renderProjectList()` |
| 前端 | public/app.js:264-313 | `selectProject()`, `loadSessions()` |
| 前端 | public/app.js:319-339 | `populateBranchFilter()` |
| 前端 | public/app.js:345-396 | `applyFilters()`, `_filterSearchTimer`, `_filterSearchVersion` |
| 前端 | public/app.js:388-508 | `renderSessionList()`, `renderTimeGroup()`, `createSessionCard()` |
| 前端 | public/app.js:159-221 | `GENERIC_NAMES`, `smartTitle()`, `getTimeGroup()`, `TIME_GROUP_ORDER` |
| 前端 | public/app.js | `refreshCurrentView()`, `setupVisibilityRefresh()` |
| 前端 | public/modules/router.js | `Router` 模块全部 |
| 后端 | server.js:354-380 | `GET /api/projects` |
| 后端 | server.js:385-394 | `GET /api/projects/:pid/sessions-full` |

## API 接口

- `GET /api/projects` → [API 参考](api-reference.md#projects)
- `GET /api/projects/:pid/sessions-full` → [API 参考](api-reference.md#sessions-full)

## 修改指南

### 如果要修改会话列表排序

1. 排序逻辑在 `server.js:187`（后端按 `modified` 降序）
2. 前端收藏置顶在 `app.js:399-418`（先分 pinned/rest，再按时间分组）
3. 如果要加新的排序维度，需后端传递字段 + 前端分组逻辑

### 如果要增加新的时间分组

1. 修改 `app.js` 的 `getTimeGroup()` 函数添加新的判断条件
2. 在 `TIME_GROUP_ORDER` 数组中添加新分组名（决定显示顺序）

### 如果要增加新的路由

1. 修改 `router.js` 的 `parseHash()` 添加新的 segment 解析
2. 修改 `handleRoute()` 添加新的 case 处理
3. 在 `app.js` 的 `VIEW_IDS` 中添加新视图映射
4. 在 `index.html` 中添加对应的 `<div class="view">` 容器

### 如果要改项目列表显示

1. 修改 `server.js` 的 `GET /api/projects` 返回更多字段
2. 修改 `app.js` 的 `renderProjectList()` 渲染新内容

## 已知问题 / TODO

- [ ] 项目列表没有搜索/筛选功能
- [ ] 会话列表不支持多选操作
- [ ] 路由不支持 query 参数（如保持筛选状态）
- [ ] 时间分组的判断基于浏览器本地时间
