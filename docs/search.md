# 搜索

## 概述

提供三种搜索方式：全局全文搜索（跨所有项目和会话搜索消息内容）、列表内搜索（在当前项目的会话列表中按标题/标签筛选）和会话内搜索（在当前对话详情页内搜索已渲染的消息内容）。

## 关联功能

- [浏览与导航](browse-and-navigate.md) - 列表内搜索是会话列表的筛选功能；搜索结果点击后导航到会话
- [对话详情](conversation-detail.md) - 搜索结果点击后跳转到对话详情；会话内搜索在对话详情页中使用
- [API 参考](api-reference.md) - 全局搜索使用 `/api/search` 端点
- [数据存储](data-storage.md) - 搜索直接扫描 JSONL 文件内容
- [技术架构](architecture.md) - Search 模块在前端架构中的位置

## 功能细节

### 全局搜索

通过弹窗进行的全文搜索，搜索所有会话中的消息内容。

**打开方式：**
- 点击侧边栏的 "Search" 按钮
- 键盘快捷键 `Cmd+K`（macOS）或 `Ctrl+K`

**搜索行为：**
1. 用户输入关键词，300ms 防抖后自动触发搜索
2. 可通过下拉框限定搜索范围为特定项目
3. 请求 `GET /api/search?q=keyword&project=pid`
4. 后端逐行扫描 JSONL 文件，大小写不敏感的 `indexOf` 匹配
5. 返回匹配结果（最多 50 条）

**结果展示：**
- 每条结果显示：项目名 → 会话名 → 匹配上下文（前后各 50 字符）→ 时间
- 关键词高亮：使用 `<mark>` 标签包裹匹配词
- 高亮支持多词匹配（空格分词，每个词单独高亮）

**结果点击：**
- 关闭搜索弹窗
- 直接设置 `window.location.hash`（不用 `Router.navigate`），触发 hashchange 事件
- Router 处理 hashchange，导航到对应项目的会话详情

**关闭方式：**
- 点击遮罩层
- 按 `Escape` 键

### 会话内搜索（Cmd+F）

在聊天详情页中，按 `Ctrl+F` / `Cmd+F` 可打开会话内搜索条。

**功能：**
- 在聊天头部和消息列表之间显示搜索条
- 实时搜索当前会话所有消息内容（300ms 防抖）
- 支持三种高级匹配选项：区分大小写 (`Aa`)、全字匹配 (`\b`)、正则表达式 (`.*`)
- 匹配文本用 `<mark>` 高亮，当前焦点项额外高亮
- 动态安全挂载的正则表达式处理，自动过滤无关节点和非法正则
- 上下箭头按钮或 `Enter` / `Shift+Enter` 在匹配项间跳转
- 计数器显示 "当前/总数"（如 "3/12"）
- 按 Escape 或点击关闭按钮清除所有高亮并恢复 DOM

**与全局搜索的区别：**
- 全局搜索（Cmd+K）：跨所有项目/会话搜索，调用后端 API
- 会话内搜索（Cmd+F）：仅搜索当前会话的已渲染消息，纯前端操作

### 列表内搜索

在会话列表页面的文本输入框中实时筛选会话。

**搜索范围（拼接后匹配）：**
- `displayName`
- `firstPrompt`
- `customName`
- `tags`（所有标签拼接）

**搜索方式：**
- 实时触发（`input` 事件，无防抖）
- 大小写不敏感的 `indexOf` 匹配
- 与分支筛选可叠加（先筛分支，再筛文本）

**交互：**
- 输入时立即过滤，更新会话卡片和数量徽章
- 切换项目时自动清空搜索框

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 前端 | public/modules/search.js:22-57 | `init()` - 事件绑定（输入防抖、快捷键、关闭） |
| 前端 | public/modules/search.js:63-76 | `open()` - 打开弹窗，清空状态，填充项目下拉 |
| 前端 | public/modules/search.js:113-147 | `executeSearch()` - 调用 API + 渲染结果 |
| 前端 | public/modules/search.js:154-188 | `renderResults()` - 渲染结果列表 + 点击导航 |
| 前端 | public/modules/search.js:197-226 | `highlightMatch()` - 关键词高亮 |
| 前端 | public/modules/chat-view.js | `openSearch()` - 打开会话内搜索条，绑定快捷键 |
| 前端 | public/modules/chat-view.js | `closeSearch()` - 关闭搜索条，清除高亮，恢复 DOM |
| 前端 | public/modules/chat-view.js | `executeSearch()` - 遍历已渲染消息，`<mark>` 高亮匹配文本 |
| 前端 | public/modules/chat-view.js | `goToMatch()` - 在匹配项间跳转，更新计数器和焦点高亮 |
| 前端 | public/index.html | `#chatSearchBar` - 搜索条 HTML（含 `#chatSearchMatchCase`、`#chatSearchWholeWord`、`#chatSearchRegex` 选项按钮） |
| 前端 | public/style.css | `.chat-search-bar`, `.chat-search-opts`, `.search-opt-btn`, `mark.chat-search-match` - 搜索条、选项按钮和高亮样式 |
| 前端 | public/app.js:345-382 | `applyFilters()` - 列表内搜索 + 分支筛选 |
| 后端 | server.js:493-596 | `GET /api/search` |

## API 接口

- `GET /api/search?q=keyword&project=pid` → [API 参考](api-reference.md#search)

## 修改指南

### 如果要支持正则搜索

1. 后端 `server.js:569` 将 `indexOf` 替换为 `RegExp.test()`
2. 需要处理用户输入的正则语法错误（try/catch）
3. 前端 `search.js` 的 `highlightMatch()` 也需要用正则分词高亮
4. 考虑加一个 toggle 让用户选择纯文本或正则模式

### 如果要加搜索结果分页

1. 后端 `server.js` 添加 `page`/`pageSize` 参数，修改 `MAX_RESULTS` 逻辑
2. 前端 `search.js` 的 `renderResults()` 添加 "Load more" 按钮
3. 保持已有结果不清空，追加新结果

### 如果要支持搜索历史

1. 用 `localStorage` 存储最近的搜索词
2. 在搜索弹窗中输入框下方显示历史列表
3. 点击历史项自动填充并执行搜索

### 如果要加列表内搜索的防抖

1. 修改 `app.js` 中 `sessionSearchInput` 的 `input` 事件处理
2. 添加 `setTimeout` 防抖（建议 150-200ms）
3. 当前无防抖在小数据量下没有性能问题

## 已知问题 / TODO

- [ ] 全局搜索不支持正则表达式
- [ ] 全局搜索结果没有分页（固定最多 50 条）
- [ ] 全局搜索没有搜索历史
- [ ] 列表内搜索没有防抖
- [x] ~~没有在当前对话内搜索的功能~~ — 已实现会话内搜索（Cmd+F）

### 最近优化记录 (Recent Updates)
- **搜索结果层级强化**：渲染时带有 `[projectName]` badge，优先突出 `sessionName` 且弱化 context 的展示比重以提升可读性。
- **搜索词高亮穿透**：点击结果跳转时，通过 `window.App.state.activeSearchKeyword` 传参，让详情页 `ChatView` 能进行 `<mark>` 高亮并自动滚动定位。
