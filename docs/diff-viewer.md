# 文件变更 Diff 视图

## 概述

全屏 Modal 弹窗，以 IDE 风格的 Side-by-Side Diff 展示会话中所有被 Edit/Write 工具修改的文件及其代码变更，支持文件切换、变更块导航和跳转到对应消息。

## 关联功能

- [对话详情](conversation-detail.md) - Diff 视图从对话详情页的 "Files" 按钮打开，"Go to message" 跳回对话详情
- [数据存储](data-storage.md) - 文件变更数据来源于 JSONL 中 assistant 消息的 tool_use blocks
- [API 参考](api-reference.md) - fileChanges 数据通过会话详情 API 返回
- [技术架构](architecture.md) - DiffView 模块在前端架构中的位置

## 功能细节

### 数据提取

后端 `server.js` 的 `extractFileChanges()` 函数从 assistant 消息的 `tool_use` blocks 中提取文件变更：

1. 遍历所有消息，筛选 `type === 'assistant'` 且包含 `blocks` 的消息
2. 在 blocks 中查找 `type === 'tool_use'` 且 `name` 为 `Edit` 或 `Write` 的 block
3. 从 `block.input` 中提取 `file_path` 作为文件标识
4. **Edit 操作**：记录 `old_string`（旧内容）和 `new_string`（新内容）
5. **Write 操作**：记录 `content`（写入内容）
6. 同一文件的多次操作聚合到同一个 fileMap 条目，累计 `changeCount`
7. 每个操作同时记录 `timestamp` 和 `messageIndex`（用于 "Go to message" 跳转）

返回数据结构：`[{ file, changeCount, operations: [{ type, timestamp, messageIndex, oldString?, newString?, content? }] }]`

数据通过 `GET /api/projects/:pid/sessions/:sid` 响应的 `fileChanges` 字段返回，前端 `App.openSession()` 将其传递给 `DiffView.setFileChanges()`。

### 全屏 Modal 布局

点击对话详情页右上方的 "Files" 按钮（仅在 `fileChanges.length > 0` 时显示，角标显示文件数量）打开全屏 Modal。

- **顶栏**：文件计数器（如 "3 / 7"）+ Prev/Next 导航按钮 + 关闭按钮（×）
- **左侧文件列表（Sidebar）**：
  - 每个文件显示彩色扩展名标签（如 `js`、`css`、`html`，颜色通过 CSS `data-ext` 属性区分）
  - 文件名 + 操作次数（如 "2 ops"）
  - 新增/删除行数统计（`+N -M`，绿色/红色）
  - 当前选中文件蓝色左边框高亮，点击可直接切换
- **右侧 Diff 内容区**：
  - 文件路径信息（文件名 + 缩略目录路径）
  - 变更块导航按钮（▲▼ + 计数器）
  - 当前文件的所有操作，每个操作一个 section（含类型标签、时间戳、"Go to message" 按钮）

### Side-by-Side Diff（LCS 逐行对齐）

使用 LCS（Longest Common Subsequence，最长公共子序列）算法对旧代码和新代码进行逐行对齐，生成 side-by-side 视图。

**LCS 算法流程：**
1. 将旧内容和新内容按 `\n` 拆分为行数组
2. 构建 `dp[m+1][n+1]` 的动态规划表
3. 回溯 DP 表生成 diff 操作序列（`equal` / `del` / `add`）

**三种行类型：**

| 类型 | 左侧（旧代码） | 右侧（新代码） | 样式 |
|------|----------------|----------------|------|
| `equal` | 显示原始行 + 行号 | 显示相同行 + 行号 | 灰色无高亮（`.eq`） |
| `del` | 显示被删除行 + 行号 + `-` 前缀 | 空白占位符（filler） | 红色背景（`.del`） |
| `add` | 空白占位符（filler） | 显示新增行 + 行号 + `+` 前缀 | 绿色背景（`.add`） |

**filler 空占位符：** 当一侧有变更而另一侧没有对应行时，用灰色空行（`.filler`）保持两侧行对齐。

**Write 操作的特殊处理：** 由于是全新写入，左侧全部为 filler 占位，右侧全部为绿色新增行。

**大文件降级策略：**
- 内容超过 8000 字符自动截断（`MAX_CONTENT_LENGTH`），显示截断提示
- 旧代码或新代码超过 400 行时跳过 LCS 计算，降级为 `fallbackDiff()`：所有旧行标记为 `del`，所有新行标记为 `add`，不做逐行对齐

### 变更块导航（▲▼）

Diff 内容区头部右上角提供变更块快速导航功能。

- **`collectChangeChunks()`**：渲染完成后扫描所有 `<tr>` 行，找到包含 `.diff-code.del` 或 `.diff-code.add` 的行，将每组连续变更行的第一行记录为一个 "chunk"
- **`navigateChunk(dir)`**：根据方向（+1 / -1）移动 `_activeChunk` 索引，将目标 chunk 滚动到视口中心（`scrollIntoView({ block: 'center' })`），并添加 `diff-chunk-active` 高亮类
- **计数器显示**：格式为 "N / M"（如 "3 / 32"），初始为 "0 / M"，无变更时显示 "No changes"
- **边界处理**：到达第一个/最后一个 chunk 时对应按钮禁用（`disabled`）

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `←` / `→` | 切换到上一个/下一个文件 |
| `Shift+↑` / `Shift+←` | 跳转到上一个变更块 |
| `Shift+↓` / `Shift+→` | 跳转到下一个变更块 |
| `Escape` | 关闭弹窗 |

键盘事件仅在 Modal 处于打开状态时生效（检查 `modal.classList.contains('hidden')`）。

### Go to Message

每个操作 section 的右上角有 "Go to message" 按钮：
1. 关闭 Diff Modal
2. 根据 `messageIndex` 找到 `#messagesContainer` 中对应的 `.message-turn` 元素
3. `scrollIntoView({ behavior: 'smooth', block: 'center' })` 滚动到该消息
4. 添加 `diff-highlight-flash` 类触发闪烁高亮动画，2 秒后移除

## 涉及的代码

| 位置 | 文件 | 关键函数 |
|------|------|---------|
| 前端 | public/modules/diff-view.js:init() | 初始化 DOM 引用、绑定按钮点击和键盘事件 |
| 前端 | public/modules/diff-view.js:setFileChanges() | 接收后端文件变更数据、更新 Files 按钮角标显示 |
| 前端 | public/modules/diff-view.js:open() / close() | 打开/关闭全屏 Modal，控制 body 滚动锁定 |
| 前端 | public/modules/diff-view.js:renderSidebar() | 渲染左侧文件列表（扩展名标签、行数统计、点击切换） |
| 前端 | public/modules/diff-view.js:highlightSidebarItem() | 高亮当前选中的 sidebar 条目并滚动到可见区域 |
| 前端 | public/modules/diff-view.js:renderDiff() | 渲染右侧 Diff 内容区 + 变更导航按钮 |
| 前端 | public/modules/diff-view.js:computeLineDiff() | LCS 算法逐行对齐，返回 equal/del/add 操作序列 |
| 前端 | public/modules/diff-view.js:fallbackDiff() | 超过 400 行时的降级 diff（全 del + 全 add） |
| 前端 | public/modules/diff-view.js:createEditTable() | Side-by-side Edit diff 表格（LCS 对齐 + 行号） |
| 前端 | public/modules/diff-view.js:createWriteTable() | Side-by-side Write diff 表格（左侧 filler + 右侧绿色新增） |
| 前端 | public/modules/diff-view.js:createOperationSection() | 单个操作的 section（类型标签 + 时间戳 + Go to message + diff 表格） |
| 前端 | public/modules/diff-view.js:collectChangeChunks() | 扫描 diff 表格收集所有变更块位置 |
| 前端 | public/modules/diff-view.js:navigateChunk() | ▲/▼ 变更块跳转 + 高亮 |
| 前端 | public/modules/diff-view.js:goToMessage() | 关闭弹窗并跳转到对应消息 + 闪烁高亮 |
| 前端 | public/modules/diff-view.js:truncateContent() | 超过 8000 字符的内容截断 |
| 前端 | public/modules/diff-view.js:shortenPath() | 目录路径缩略（超过 3 级显示 `.../ ` 前缀） |
| 前端 | public/app.js:openSession() | 加载会话数据后调用 DiffView.setFileChanges() |
| 前端 | public/app.js:setupChatHeader() | 设置对话头部 Files 按钮 |
| 后端 | server.js:extractFileChanges() | 从 assistant 消息中提取 Edit/Write 操作并按文件聚合 |
| 后端 | server.js:GET /api/projects/:pid/sessions/:sid | 会话详情 API，响应中包含 fileChanges 字段 |

## API 接口

文件变更数据通过会话详情 API 返回：

- `GET /api/projects/:pid/sessions/:sid` → [API 参考](api-reference.md#session-detail)

响应中的 `fileChanges` 字段包含文件变更数组，由后端 `extractFileChanges()` 从解析后的消息中提取。前端不需要单独请求。

## 修改指南

### 如果要新增支持的工具类型（如 Bash 命令输出）

1. 后端 `server.js` 的 `extractFileChanges()` 中添加新的 `block.name` 判断（如 `'Bash'`）
2. 根据新工具的 `input` 结构提取相关字段（如 `command`、`stdout`）
3. 前端 `diff-view.js` 的 `createOperationSection()` 中添加新类型的分支渲染
4. 可能需要新增 `createBashTable()` 等渲染函数
5. 更新 `renderSidebar()` 中的行数统计逻辑

### 如果要修改 diff 渲染样式

1. 行级样式在 `public/style.css` 中，查找 `.diff-code`、`.diff-ln`、`.diff-sign` 相关类
2. 颜色类：`.del`（红色背景）、`.add`（绿色背景）、`.eq`（灰色）、`.filler`（空占位）
3. 扩展名标签颜色通过 `[data-ext]` 属性选择器定义
4. 浅色主题下的适配样式在 `body.light-theme` 选择器下

### 如果要调整截断阈值

1. 内容截断：修改 `diff-view.js` 顶部的 `MAX_CONTENT_LENGTH`（当前 8000 字符）
2. LCS 降级：修改 `computeLineDiff()` 中的行数阈值（当前 `m > 400 || n > 400`）
3. 阈值增大会提升大文件的 diff 精度，但增加计算耗时（LCS 为 O(m*n) 时间和空间复杂度）

### 如果要修改 sidebar 文件列表

1. 文件列表渲染在 `renderSidebar()` 中
2. 行数统计逻辑：Edit 操作分别统计 oldString 和 newString 的行数，Write 操作统计 content 行数
3. 扩展名提取：从文件名中取最后一个 `.` 后的部分

## 已知问题 / TODO

- [ ] LCS 算法 O(m*n) 时间和空间复杂度，超过 400 行自动降级为简单全删全增对比
- [ ] 内容截断阈值（8000 字符）为硬编码常量，无法由用户配置
- [ ] 暂不支持 Bash 工具的输出 diff
- [ ] 没有 inline diff（行内字符级差异高亮），仅支持行级 diff
- [ ] 没有 unified diff 视图模式（仅支持 side-by-side）
- [ ] "Go to message" 在分页加载场景下，如果目标消息尚未加载则无法跳转
