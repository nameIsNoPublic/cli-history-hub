# CLI History Hub

## 项目简介

CLI History Hub 是一个本地 Web 应用，用于浏览、搜索和管理 Claude Code CLI 和 OpenAI Codex CLI 产生的对话历史。它直接读取 `~/.claude/projects/` 和 `~/.codex/sessions/` 下的 JSONL 会话文件，提供项目分组、时间线浏览、全文搜索、会话管理和 Token 用量统计等功能。面向 AI 编程工具用户，帮助回顾和整理日常的 AI 编程对话。

## 快速开始

```bash
cd claude-history-viewer
npm install
node server.js
# 浏览器打开 http://localhost:3456
```

## 功能导航

按业务场景索引所有功能文档：

### 浏览对话

- [浏览与导航](browse-and-navigate.md) - 项目列表、会话列表、时间分组（Today/Yesterday/This Week...）、分支筛选、列表内搜索、URL 路由

### 查看对话

- [对话详情](conversation-detail.md) - 消息渲染（文本/思考/工具调用）、连续助手消息合并、分页加载、会话内搜索（Cmd+F）
- [文件变更 Diff 视图](diff-viewer.md) - LCS 逐行对齐的 Side-by-Side Diff、全屏 Modal、变更块导航
- [Prompt Library](prompts.md) - 多维度 Prompt 浏览、复用、复盘

### 搜索

- [搜索](search.md) - 全局全文搜索（Cmd+K）、会话内搜索（Cmd+F）、列表内搜索

### 管理会话

- [会话管理](session-management.md) - 重命名、收藏/置顶、标签管理、删除（软删除）
- [导出](export.md) - Markdown/JSON 文件下载、剪贴板复制
- [恢复会话](conversation-detail.md#恢复会话) - 一键打开终端恢复 CLI 会话（Claude --resume / Codex resume）

### 数据统计

- [统计面板](stats.md) - Token 用量汇总、每日柱状图、按项目/模型分类明细
- [时间线热力图](timeline.md) - GitHub 风格活跃度热力图、按天查看会话列表

### 多数据源

- [Codex CLI 集成](codex-integration.md) - OpenAI Codex CLI 对话历史接入、数据格式转换、双源合并

### 界面定制

- [深色/浅色主题](theme.md) - CSS 变量方案，一键切换，localStorage 持久化

### 开发者参考

- [技术架构](architecture.md) - 技术栈、前后端模块关系、数据流
- [数据存储](data-storage.md) - JSONL 解析、sidecar 元数据、内存缓存
- [API 参考](api-reference.md) - 10 个后端接口完整文档

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + Express 4.x |
| 前端 | 原生 JavaScript + marked.js (Markdown 渲染) |
| 图表 | Canvas 2D API（自绘柱状图） |
| 数据 | 文件系统（JSONL + JSON sidecar，无数据库） |
| 样式 | 原生 CSS，暗色主题 |

## 项目结构

```
claude-history-viewer/
  server.js                       # 后端：Express 服务器 + API + 数据解析
  package.json                    # 项目配置（唯一依赖：express）
  public/
    index.html                    # SPA 入口（6 视图 + 6 弹窗）
    style.css                     # 全局样式
    app.js                        # 主应用（状态管理、视图切换、列表渲染）
    modules/
      router.js                   # Hash 路由
      chat-view.js                # 消息渲染 + 分页
      search.js                   # 全局搜索弹窗
      stats.js                    # 统计面板 + Canvas 图表
      timeline.js                 # 时间线热力图
      features.js                 # 重命名/标签/收藏/导出
      diff-view.js                # 文件变更 Diff 全屏 Modal
      prompts.js                  # Prompt Library（多维度 Prompt 浏览/复用）
  docs/                           # 本文档目录
    README.md                     # 项目总览（本文件）
    architecture.md               # 技术架构
    browse-and-navigate.md        # 浏览与导航
    conversation-detail.md        # 对话详情
    search.md                     # 搜索
    session-management.md         # 会话管理
    export.md                     # 导出
    stats.md                      # 统计面板
    timeline.md                   # 时间线热力图
    diff-viewer.md                # 文件变更 Diff 视图
    prompts.md                    # Prompt Library
    codex-integration.md          # Codex CLI 集成
    theme.md                      # 深色/浅色主题
    data-storage.md               # 数据存储
    api-reference.md              # API 接口参考
```

## 文档交叉引用关系

```
README.md（本文件 - 根入口，链接所有文档）
  │
  ├── architecture.md ←──────────── 被所有文档引用（了解整体架构）
  │
  ├── browse-and-navigate.md
  │     ↔ search.md（搜索结果跳转到会话）
  │     ↔ conversation-detail.md（点击会话进入详情）
  │     ↔ session-management.md（收藏影响列表排序）
  │     → data-storage.md（会话元数据来源）
  │
  ├── conversation-detail.md
  │     → data-storage.md（JSONL 消息解析）
  │     ↔ export.md（导出当前对话内容）
  │     ↔ session-management.md（详情页的管理按钮）
  │     ↔ diff-viewer.md（Files 按钮打开 Diff 视图）
  │
  ├── diff-viewer.md
  │     → conversation-detail.md（从对话详情页入口）
  │     → data-storage.md（JSONL 中的 tool_use 数据）
  │     → api-reference.md（会话详情 API 的 fileChanges 字段）
  │
  ├── search.md
  │     → api-reference.md（搜索 API）
  │     ↔ browse-and-navigate.md（搜索结果导航）
  │     ↔ conversation-detail.md（会话内搜索 Cmd+F）
  │
  ├── session-management.md
  │     → data-storage.md（sidecar 存储）
  │     ↔ browse-and-navigate.md（收藏 → Pinned 分组）
  │     ↔ conversation-detail.md（详情页按钮）
  │
  ├── export.md
  │     ↔ conversation-detail.md（导出的数据来源）
  │
  ├── stats.md
  │     → data-storage.md（token 数据来源）
  │     → api-reference.md（stats API）
  │
  ├── timeline.md
  │     → api-reference.md（timeline API）
  │     ↔ browse-and-navigate.md（点击热力图跳转到会话）
  │
  ├── prompts.md
  │     → api-reference.md（prompts API）
  │     ↔ browse-and-navigate.md（从会话列表进入 Prompt Library）
  │     ↔ conversation-detail.md（从对话详情进入 Prompt Library）
  │
  ├── codex-integration.md
  │     → architecture.md（双数据源架构）
  │     → data-storage.md（Codex JSONL 格式）
  │     → api-reference.md（source 字段）
  │     ↔ browse-and-navigate.md（项目列表标识）
  │     ↔ stats.md（统计包含 Codex 数据）
  │
  ├── theme.md
  │     → architecture.md（CSS 变量体系）
  │
  ├── data-storage.md ←──────────── 被多个功能文档引用（底层数据支撑）
  │
  └── api-reference.md ←─────────── 被功能文档按需引用（API 细节）
```
