# 对话详情

## 概述

用户点击会话卡片后进入对话详情页，查看完整的对话消息，包括用户提问、助手回复（文本/思考/工具调用）、Token 用量等信息。

## 关联功能

- [浏览与导航](browse-and-navigate.md) - 从会话列表点击进入详情
- [搜索](search.md) - 搜索结果点击后跳转到对话详情
- [导出](export.md) - 导出当前对话的消息内容
- [会话管理](session-management.md) - 详情页头部的重命名/标签/收藏按钮
- [数据存储](data-storage.md) - JSONL 消息解析和消息合并逻辑
- [API 参考](api-reference.md) - 会话详情的 API 端点（含分页、文件变更和 Resume 终端）
- [技术架构](architecture.md) - ChatView 和 DiffView 模块在前端架构中的位置

## 功能细节

### 消息渲染

每条消息渲染为一个 "turn"（轮次），分用户轮和助手轮。

**用户轮 (User Turn)：**
- 角色标签 "User"
- 时间戳（MM/DD HH:mm 格式）
- 消息文本（经 Markdown 渲染）
- 空消息（`text` 为空或纯空白）不渲染

**助手轮 (Assistant Turn)：**
- 角色标签显示模型名称（如 `claude-sonnet-4-6-20260319`）
- 时间戳
- Token 用量（output_tokens，格式化为带逗号的数字）
- 内容区包含多种 block：

| Block 类型 | 渲染方式 |
|-----------|---------|
| `text` | Markdown 渲染（使用 marked.js） |
| `thinking` | 可折叠区域，默认收起，显示前 100 字符预览 |
| `tool_use` | 可折叠区域，显示工具名称，展开显示 JSON 格式的输入参数 |

**折叠/展开交互：**
- 点击 thinking/tool 的标题行切换展开状态
- 通过 CSS 类 `show` 控制内容区显示
- 箭头图标旋转指示状态（`arrow` + `open` 类）

### 消息合并

后端在解析 JSONL 时，将连续的 assistant 消息合并为一个 turn。

**合并规则：**
- 条件：当前消息和前一条都是 `type === 'assistant'`
- `blocks` 数组拼接
- `timestamp` 取较晚的
- `model` 取后者的（如果存在）
- `usage` 各字段累加（input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens）
- `gitBranch` 取第一个非空值

**为什么需要合并：** Claude Code 的一个回复可能产生多条 JSONL 行（如文本回复 + 工具调用 + 继续回复），这些在逻辑上属于同一个 turn。

### 分页加载

消息列表支持分页，避免大型对话一次加载过多消息。

**分页策略：**
- 默认不分页，一次返回所有消息
- 指定 `page` 参数时启用分页（`pageSize` 默认 30）
- `page=1` 是最新消息，`page=N` 是最旧消息
- 页面顶部显示 "Load earlier messages" 按钮

**加载更多流程：**
1. 点击 "Load earlier messages"
2. 请求 `GET /api/projects/{pid}/sessions/{sid}?page={nextPage}&pageSize=30`
3. 将旧消息 prepend 到消息容器顶部
4. 保持当前滚动位置不变（`scrollTop = newScrollHeight - prevScrollHeight`）
5. 更新分页状态，如果已到最后一页则隐藏按钮

**初始加载行为：**
- `ChatView.render()` 完成后滚动到容器顶部（`scrollTop = 0`）
- `App.openSession()` 完成后滚动到容器底部（`scrollTop = scrollHeight`）
- 实际效果：app.js 的 scrollBottom 覆盖了 ChatView 的 scrollTop

### 消息复制

用户消息（User turn）的 header 右侧有一个复制按钮（剪贴板图标），hover 时显示，点击复制该条消息的原始文本到剪贴板。

**行为：**
- 按钮默认隐藏（`opacity: 0`），鼠标悬停 `.message-turn` 时显示
- 点击后通过 `navigator.clipboard.writeText` 复制，不支持时 fallback 到 `execCommand('copy')`
- 复制成功显示 Toast "Copied!"

**涉及的代码：**
- `chat-view.js:createUserTurn()` — 渲染复制按钮 + 绑定点击事件
- `chat-view.js:copyToClipboard()` / `fallbackCopy()` — 剪贴板操作
- `style.css:.btn-copy-msg` — 按钮样式（hover 显示 + 高亮）

### 会话内搜索

在聊天详情页头部和消息列表之间有一个可收起的搜索条，支持在当前会话的消息中搜索关键词。

**打开方式：**
- 快捷键 `Ctrl+F` / `Cmd+F`（chatView 可见时触发）
- 也可通过 `ChatView.openSearch()` 编程调用

**搜索行为：**
- 输入框有 300ms 防抖
- 支持区分大小写 (`Aa`)、全字匹配 (`\b`)、正则表达式 (`.*`) 三种高级搜索模式选项
- 动态根据选项生成 RegExp，在所有 `.turn-body` 元素中遍历文本节点，用 `<mark class="chat-search-match">` 安全地高亮包裹匹配文本（规避正则切分导致的 HTML 破坏）
- 当前焦点项额外加 `chat-search-active` class，高亮显示并 scrollIntoView
- 匹配计数显示格式如 "3/12"

**跳转：**
- 上/下按钮（或 Enter / Shift+Enter）在匹配项间循环跳转
- 到末尾自动循环到开头

**关闭：**
- 点击关闭按钮或按 Escape
- 关闭后清除所有 `<mark>` 标签，恢复原始 DOM

### 文件变更追踪 + Diff 视图

对话详情页右上方有一个 "Files" 按钮（仅在会话包含文件变更时显示，角标显示文件数量），点击后打开全屏 Modal 弹窗，以 IDE 风格展示会话中所有被修改的文件及其代码 diff。

**数据提取：**
- 后端 `extractFileChanges()` 从 assistant 消息的 `tool_use` blocks 中提取 `Edit` 和 `Write` 操作
- 返回数据包含文件路径、变更次数和每次操作的详情（old_string / new_string / content）
- 通过 session detail API 的 `fileChanges` 字段返回

**全屏 Modal 布局：**
- **顶栏**：标题 "File Changes" + 文件计数器（如 "3 / 7"）+ Prev/Next 导航按钮 + 关闭按钮
- **左侧文件列表**：每个文件显示彩色扩展名标签（JS 紫色、CSS 蓝色、HTML 橙色等）、文件名、操作次数、新增/删除行数统计（`+N -M`）；当前选中文件蓝色左边框高亮
- **右侧 Diff 内容区**：显示当前文件的所有变更操作

**Diff 显示（LCS 逐行对齐的 Side-by-Side 视图）：**
- 基于 LCS（最长公共子序列）算法逐行对齐旧代码和新代码
- **左侧**：旧代码，删除行红色背景 + `-` 前缀 + 行号
- **右侧**：新代码，新增行绿色背景 + `+` 前缀 + 行号
- **相同行**：两侧同时显示，灰色无高亮
- **空占位**：删除行对面 / 新增行对面显示灰色空白占位符
- **Write 操作**：左侧全部空占位，右侧绿色显示新建内容
- 大内容自动截断（超过 8000 字符），超过 400 行自动降级为简单对比
- hover 行高亮

**变更块导航（▲▼）：**
- Diff 内容区右上角有 ▲/▼ 按钮和计数器（如 "3 / 32"）
- 点击 ▼ 自动滚动到下一个变更块（跳过相同行，直达红/绿改动处）
- 点击 ▲ 跳回上一个变更块
- 快捷键：`Shift+↑` / `Shift+↓` 在变更块间跳转

**文件导航与交互：**
- Prev/Next 按钮或 `←` / `→` 方向键切换文件
- 点击左侧文件列表直接跳转
- 每个 diff 操作有 "Go to message" 按钮，点击后关闭弹窗，滚动到对应消息并高亮闪烁
- `Escape` 键关闭弹窗
- 支持暗色/浅色主题（浅色下 diff 文字颜色自动适配）

### 对话头部信息

详情页头部包含：
- 返回按钮（← 回到会话列表）
- 收藏星标按钮
- 会话标题（使用 `smartTitle` 逻辑）
- 重命名按钮
- Resume 按钮（"▶ Resume"，点击打开系统终端恢复会话，Claude 执行 `claude --resume`，Codex 执行 `codex resume`）+ Prompts 按钮（Toggle 模式：隐藏 AI 回复，只显示 USER 消息）+ Files 按钮（显示文件变更数量角标）+ 标签按钮 + 导出按钮
- 元信息行：日期、消息数、git 分支
- 标签展示区

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 前端 | public/modules/chat-view.js:38-69 | `render()` - 渲染消息列表 |
| 前端 | public/modules/chat-view.js:74-128 | `loadMore()` - 加载更多消息 |
| 前端 | public/modules/chat-view.js:134-156 | `getMessagesForExport()` - 导出用数据 |
| 前端 | public/modules/chat-view.js:177-191 | `createUserTurn()` |
| 前端 | public/modules/chat-view.js:196-231 | `createAssistantTurn()` |
| 前端 | public/modules/chat-view.js:236-263 | `createThinkingBlock()`, `createToolBlock()` |
| 前端 | public/modules/chat-view.js:269-292 | `bindToggleEvents()` |
| 前端 | public/modules/chat-view.js | `openSearch()`, `closeSearch()`, `executeSearch()`, `goToMatch()` - 会话内搜索 |
| 前端 | public/index.html | `#chatSearchBar` - 搜索条 HTML |
| 前端 | public/style.css | `.chat-search-bar`, `mark.chat-search-match` - 搜索条和高亮样式 |
| 前端 | public/modules/diff-view.js | `DiffView` 模块 - 全屏 Diff Modal |
| 前端 | public/modules/diff-view.js:init() | 初始化 DOM 引用、绑定按钮和键盘事件 |
| 前端 | public/modules/diff-view.js:setFileChanges() | 接收后端文件变更数据、更新角标 |
| 前端 | public/modules/diff-view.js:open()/close() | 打开/关闭全屏 Modal |
| 前端 | public/modules/diff-view.js:renderSidebar() | 渲染左侧文件列表（含行数统计） |
| 前端 | public/modules/diff-view.js:renderDiff() | 渲染右侧 Diff 内容区 + 变更导航按钮 |
| 前端 | public/modules/diff-view.js:computeLineDiff() | LCS 算法逐行对齐 |
| 前端 | public/modules/diff-view.js:createEditTable() | Side-by-side Edit diff（LCS 对齐 + 行号） |
| 前端 | public/modules/diff-view.js:createWriteTable() | Side-by-side Write diff（行号 + 绿色新建） |
| 前端 | public/modules/diff-view.js:navigateFile() | Prev/Next 文件切换 |
| 前端 | public/modules/diff-view.js:navigateChunk() | ▲/▼ 变更块跳转 |
| 前端 | public/modules/diff-view.js:collectChangeChunks() | 收集 diff 中所有变更块位置 |
| 前端 | public/modules/diff-view.js:goToMessage() | 关闭弹窗并跳转到对应消息 |
| 前端 | public/app.js:openSession() | 加载会话数据 + 传递 fileChanges 到 DiffView |
| 前端 | public/app.js:setupChatHeader() | 设置对话头部信息 + Resume 按钮文案切换 |
| 前端 | public/app.js:resumeSession() | Resume 按钮：调用后端打开终端恢复会话 |
| 前端 | public/app.js:isCodexProject() | 判断是否 Codex 项目 |
| 后端 | server.js:openTerminalWithCommand() | 跨平台打开系统终端执行命令 |
| 后端 | server.js:`POST /api/open-terminal` | Resume 按钮后端接口 |
| 后端 | server.js:extractFileChanges() | 从消息中提取 Edit/Write 操作 |
| 后端 | server.js:parseSessionMessages() | 消息解析 + 合并 |
| 后端 | server.js:GET /api/projects/:pid/sessions/:sid | 会话详情 API（含 fileChanges） |

## API 接口

- `GET /api/projects/:pid/sessions/:sid?page=1&pageSize=30` → [API 参考](api-reference.md#session-detail)

## 修改指南

### 如果要支持新的 block 类型

1. 后端 `server.js` 的 `formatAssistantMessage()` 中添加新 block 类型的格式化
2. 前端 `chat-view.js` 的 `createAssistantTurn()` 中添加新 block 类型的渲染
3. 如果新 block 可折叠，创建对应的 `create*Block()` 函数 + CSS 样式
4. 在 `bindToggleEvents()` 中绑定新 block 的折叠事件

### 如果要修改分页策略

1. 后端分页逻辑在 `server.js:418-441`（page 从尾部切片）
2. 前端分页状态在 `chat-view.js:10-13`（`_currentPage`, `_totalPages`）
3. 加载更多逻辑在 `chat-view.js:74-128`
4. 注意滚动位置保持的逻辑（`prevScrollHeight`）

### 如果要修改消息合并规则

1. 合并逻辑在 `server.js:246-274`（`parseSessionMessages` 中的 merged 循环）
2. 注意 usage 的累加和 blocks 的拼接顺序
3. 修改后需检查导出功能是否正确

## 已知问题 / TODO

- [ ] 初始加载时 ChatView 和 App 的滚动行为冲突
- [ ] thinking 和 tool_use 的内容没有 Markdown 渲染
- [x] ~~没有消息搜索（在当前对话中搜索）~~ — 已实现会话内搜索
- [ ] 没有消息复制按钮
- [ ] 分页加载没有 loading 状态提示

### 最近优化记录 (Recent Updates)
- **长对话导航**：加入页面右下角的悬浮按钮（回到顶部/直达底部），利用 `chatMessages` 的 scroll 事件配合 `debounce` 动态显隐。
- **全局搜索高亮靶点**：结合 `search.js` 传来的 `activeSearchKeyword`，利用原生 `TreeWalker` 扫描 DOM 文本树，将命中的词汇用 `<mark class="flash-highlight">` 强光包裹、动画淡出，并使用 `scrollIntoView` 居中直达。
