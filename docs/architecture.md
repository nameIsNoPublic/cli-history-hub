# 技术架构

## 概述

CLI History Hub 是一个本地 Web 应用，用于浏览和管理 Claude Code CLI 和 OpenAI Codex CLI 产生的对话历史。采用 Node.js + Express 后端 + 原生 JS 前端的轻量架构，无数据库依赖，支持双数据源。

## 关联功能

- [数据存储](data-storage.md) - 数据层的详细设计
- [API 参考](api-reference.md) - 10 个后端 API 端点的完整文档
- [浏览与导航](browse-and-navigate.md) - 前端核心交互流程
- [对话详情](conversation-detail.md) - 消息渲染模块
- [搜索](search.md) - 搜索模块
- [会话管理](session-management.md) - 会话管理模块
- [导出](export.md) - 导出模块
- [统计面板](stats.md) - 统计模块
- [Codex CLI 集成](codex-integration.md) - Codex 数据源的架构设计

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 后端 | Node.js + Express 4.x | 唯一依赖，零构建工具 |
| 前端 | 原生 JavaScript（ES5 兼容） | 无框架，IIFE 模块模式 |
| 前端渲染 | marked.js（CDN） | Markdown 转 HTML |
| 图表 | Canvas 2D API | 自绘柱状图，无图表库 |
| 数据存储 | 文件系统 | JSONL + JSON sidecar，无数据库，双数据源（Claude + Codex） |
| 样式 | 原生 CSS | 单文件 style.css，暗色/浅色主题切换 |

## 项目文件结构

```
claude-history-viewer/
  server.js                   # 后端：Express 服务器 + 10 个 API + 数据解析逻辑
  package.json                # 项目配置，只有 express 一个依赖
  public/                     # 前端静态文件
    index.html                # SPA 入口页面，6 个视图 + 6 个弹窗
    style.css                 # 全局样式
    favicon.svg               # 图标
    app.js                    # 主应用：状态管理、视图切换、项目/会话列表
    modules/
      router.js               # Hash 路由
      chat-view.js             # 消息渲染 + 分页
      search.js                # 全局搜索弹窗
      stats.js                 # 统计面板 + 图表
      features.js              # 重命名/标签/收藏/导出
      diff-view.js             # 文件变更 Diff 全屏 Modal
      timeline.js              # 时间线热力图
      prompts.js               # Prompt Library
  docs/                       # 文档（本目录）
```

## 前端模块关系

```
index.html
  │
  ├── modules/router.js       → window.Router     (hash 路由)
  ├── modules/search.js       → window.Search     (全局搜索)
  ├── modules/chat-view.js    → window.ChatView   (消息渲染)
  ├── modules/stats.js        → window.Stats      (统计面板)
  ├── modules/features.js     → window.Features   (重命名/标签/收藏/导出)
  ├── modules/diff-view.js    → window.DiffView   (文件变更 Diff 全屏 Modal)
  ├── modules/timeline.js     → window.Timeline   (时间线热力图)
  ├── modules/prompts.js      → window.Prompts    (Prompt Library)
  └── app.js                  → window.App        (主应用，编排上述模块)
```

**加载顺序：** 模块先加载，`app.js` 最后加载。各模块通过 `window.*` 全局对象互相调用。

**模块间依赖：**
- `app.js` 调用所有模块的 `init()` 方法
- 模块通过 `window.App` 访问共享状态和工具函数（`api()`, `escapeHtml()`, `formatTime()` 等）
- `Router` ↔ `App`：双向调用，用 `_routerDriven` 和 `_navigating` 标志防止循环
- `Features` → `ChatView`：导出时调用 `ChatView.getMessagesForExport()`
- `Search` → `App`：搜索结果点击后通过修改 hash 触发导航
- `App` → `DiffView`：打开会话时传递 `fileChanges` 数据到 DiffView
- `App` → `Prompts`：激活 Prompts 视图时传递 projectId/sessionId

## 后端架构

```
server.js
  │
  ├── 数据层函数
  │   ├── stripXmlTags()           # XML 标签清理
  │   ├── readSidecarMeta()        # 读 sidecar JSON
  │   ├── writeSidecarMeta()       # 写 sidecar JSON
  │   ├── extractSessionMeta()     # 解析 JSONL 提取会话元数据
  │   ├── scanProjectSessions()    # 扫描项目下所有会话（含缓存）
  │   ├── getProjectPath()         # 从 JSONL 提取项目真实路径
  │   ├── parseSessionMessages()   # 解析 JSONL 的全部消息 + 合并
  │   ├── formatUserMessage()      # 格式化用户消息
  │   ├── formatAssistantMessage() # 格式化助手消息
  │   ├── extractFileChanges()    # 提取 Edit/Write 文件变更
  │   │
  │   ├── # Codex 数据源
  │   ├── readCodexSessionIndex()  # 读取 Codex 会话索引
  │   ├── findCodexJsonlFiles()    # 递归查找 Codex JSONL 文件
  │   ├── listCodexProjects()      # 按 cwd 分组列出 Codex 项目
  │   ├── getCodexProjects()       # 带缓存的 Codex 项目列表
  │   ├── extractCodexSessionMeta()# 提取 Codex 会话元数据
  │   └── parseCodexMessages()     # 解析 Codex 消息为内部格式
  │
  ├── API 路由（10 个）
  │   ├── GET  /api/projects
  │   ├── GET  /api/projects/:pid/sessions-full
  │   ├── GET  /api/projects/:pid/sessions/:sid
  │   ├── PUT  /api/projects/:pid/sessions/:sid/meta
  │   ├── GET  /api/search
  │   ├── GET  /api/stats
  │   ├── GET  /api/timeline
  │   ├── GET  /api/tags
  │   ├── GET  /api/prompts
  │   └── POST /api/open-terminal
  │
  └── 静态文件服务
      └── express.static('public/')
```

**所有后端逻辑在一个文件中**（server.js，约 777 行），没有拆分模块。

## 数据流

### 浏览会话列表

```
用户点击项目 → App.selectProject()
  → Router.navigate('#/project/{pid}')
  → fetch GET /api/projects/{pid}/sessions-full
    → scanProjectSessions()
      → 检查缓存 → 命中返回 / 未命中则 extractSessionMeta()
        → 读取 JSONL + readSidecarMeta()
  → App.renderSessionList()（含时间分组、收藏置顶）
```

### 查看对话详情

```
用户点击会话 → App.openSession()
  → Router.navigate('#/project/{pid}/session/{sid}')
  → fetch GET /api/projects/{pid}/sessions/{sid}
    → parseSessionMessages()（含消息合并）
    → readSidecarMeta()
  → ChatView.render()（渲染消息 + thinking/tool 折叠）
```

### 全局搜索

```
用户输入关键词 → Search.executeSearch()（300ms 防抖）
  → fetch GET /api/search?q=keyword&project=pid
    → 遍历所有 JSONL 文件 → 逐行解析 → indexOf 匹配
    → 返回前 50 条结果
  → Search.renderResults()（高亮匹配词）
  → 用户点击结果 → 修改 hash → Router 导航到会话
```

### 更新会话元数据

```
用户操作（重命名/加标签/收藏）
  → Features.apiPut() → fetch PUT /api/projects/{pid}/sessions/{sid}/meta
    → readSidecarMeta() → 合并更新字段 → writeSidecarMeta()
    → sessionCache.delete()（失效缓存）
  → 更新前端 App.state
  → App.loadSessions()（刷新列表）
```

## 前端视图结构

`index.html` 中有 6 个视图（同时只显示一个）和 6 个弹窗：

**视图：**
| ID | 对应 | 显示条件 |
|----|------|---------|
| `welcomeView` | 欢迎页 | 初始状态 / 路由 `#/` |
| `sessionListView` | 会话列表 | 路由 `#/project/{pid}` |
| `chatView` | 对话详情 | 路由 `#/project/{pid}/session/{sid}` |
| `statsView` | 统计面板 | 路由 `#/stats` |
| `timelineView` | 时间线热力图 | 路由 `#/timeline` |
| `promptsView` | Prompt Library | 路由 `#/prompts` |

**弹窗：**
| ID | 功能 | 触发 |
|----|------|------|
| `renameModal` | 重命名会话 | 详情页的编辑按钮 |
| `tagModal` | 管理标签 | 详情页的标签按钮 |
| `exportModal` | 导出对话 | 详情页的导出按钮 |
| `searchModal` | 全局搜索 | 侧边栏搜索按钮 / Cmd+K |
| `diffModal` | 文件变更 Diff | 详情页的 Files 按钮 |
| `deleteModal` | 删除会话确认 | 详情页的删除按钮 |

## 涉及的代码

| 位置 | 文件 | 说明 |
|------|------|------|
| 后端 | server.js | 全部后端逻辑（777 行） |
| 前端入口 | public/index.html | HTML 结构 + 模块加载顺序 |
| 前端主应用 | public/app.js | 状态管理 + 视图切换 + 事件绑定 |
| 前端路由 | public/modules/router.js | Hash 路由解析和导航 |
| 前端消息渲染 | public/modules/chat-view.js | 消息 turn 渲染 + 分页 |
| 前端搜索 | public/modules/search.js | 搜索弹窗 + 结果渲染 |
| 前端统计 | public/modules/stats.js | 统计面板 + Canvas 图表 |
| 前端功能 | public/modules/features.js | 重命名/标签/收藏/导出 |
| 前端 Diff | public/modules/diff-view.js | 文件变更 Diff 全屏 Modal |
| 样式 | public/style.css | 全局 CSS 样式 |

## 修改指南

### 如果要拆分 server.js

建议按数据层和路由层拆分：
1. `lib/data.js` - JSONL 解析、sidecar 读写、缓存
2. `lib/routes.js` - API 路由定义
3. `server.js` - Express 配置 + 启动

### 如果要引入前端框架

1. 需要添加构建工具（如 Vite）
2. 当前的 `window.*` 模块间通信需要重构为模块导入
3. `App.state` 需要迁移到框架的状态管理方案

### 如果要新增前端模块

1. 在 `public/modules/` 创建文件，暴露为 `window.ModuleName`
2. 在 `index.html` 中 `app.js` 之前添加 `<script>` 标签
3. 在 `app.js` 的 `init()` 中调用 `ModuleName.init()`

## 深色/浅色主题切换

### 实现方式

- **CSS 变量方案**：`:root` 定义暗色主题变量（默认），`[data-theme="light"]` 覆盖所有 CSS 变量为浅色值（GitHub Light 风格）
- **切换按钮**：位于 `.sidebar-header` 右上角，暗色模式显示太阳图标（☀），浅色模式显示月亮图标（☾）
- **持久化**：`localStorage.setItem('theme', 'light'|'dark')` 保存用户选择，页面加载时读取并应用
- **默认主题**：暗色（dark）

### 涉及的代码

| 文件 | 说明 |
|------|------|
| `public/style.css` | `[data-theme="light"]` 变量块 + 硬编码颜色覆盖 + `.btn-theme-toggle` 样式 |
| `public/index.html` | `#themeToggleBtn` 按钮（在 `.sidebar-header` 中） |
| `public/app.js` | `initTheme()` / `applyTheme()` / `toggleTheme()` 函数，暴露为 `window.App.toggleTheme` |

### 已知限制

- Canvas 图表（`public/modules/stats.js`）中的硬编码颜色（`#30363d` 网格线、`#8b949e` 文字、`#0d1117` 背景）在浅色主题下不会自动适配，需要后续在 JS 中读取 CSS 变量值来绘制

## 已知问题 / TODO

- [ ] 后端全部逻辑在单文件中，随功能增长维护成本上升
- [ ] 前端使用全局变量通信，无模块化构建
- [ ] 没有自动化测试
- [ ] 没有 TypeScript 类型定义
- [ ] Canvas 图表硬编码颜色不随主题切换变化
