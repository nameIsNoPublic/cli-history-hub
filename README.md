# CLI History Hub

一个本地 Web 应用，用于浏览、搜索和管理 AI 编程助手的对话历史。

当前支持 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 和 [OpenAI Codex CLI](https://github.com/openai/codex)，直接读取本地 JSONL 会话文件，提供可视化界面，无需数据库，零配置启动。

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey?logo=creativecommons)

## 功能

### 多数据源支持

| 数据源 | 数据路径 | 状态 |
|--------|---------|------|
| Claude Code | `~/.claude/projects/` | ✅ 已支持 |
| OpenAI Codex CLI | `~/.codex/sessions/` | ✅ 已支持 |
| Cursor / Aider / 其他 | — | 🔮 可扩展 |

- 侧边栏按数据源分组（🟣 Claude Code / 🟢 Codex CLI），支持折叠收起
- 各数据源独立渲染，保留原始格式，不做数据转换
- 缺失的数据源静默跳过，不影响其他功能

### 浏览与导航

- **项目分组** — 按工作目录自动归类，显示项目简名和会话数量
- **时间分组** — Today / Yesterday / This Week / This Month / Earlier
- **分支筛选** — 按 git 分支过滤会话列表
- **会话搜索** — 列表内实时筛选（支持标题、prompt、标签匹配）
- **收藏置顶** — 收藏的会话固定在 Pinned 分组最顶部
- **可调侧边栏** — 拖拽分隔条调整宽度，自动记忆
- **点击标题回首页** — 点击左上角 "CLI History" 返回 Welcome 页
- **URL 路由** — Hash 路由支持浏览器前进/后退和直接链接分享

### 对话详情

- **消息渲染** — 完整渲染用户消息和 AI 回复（Markdown、代码块、列表、表格）
- **思考过程** — 可折叠的 Thinking / Reasoning 块
- **工具调用** — 可折叠的 Tool Use 块（显示工具名和输入参数）
- **消息合并** — 连续 assistant 消息自动合并为一个 turn
- **分页加载** — 大型对话分页加载，顶部 "Load earlier messages" 按钮
- **消息复制** — User 消息 hover 显示复制按钮，一键复制原始文本
- **Prompts 过滤** — 点击 Prompts 按钮隐藏所有 AI 回复，只看用户输入

### 搜索

- **全局搜索** — `Cmd+K` / `Ctrl+K` 跨所有项目和会话全文搜索，关键词高亮，点击跳转
- **会话内搜索** — `Cmd+F` / `Ctrl+F` 在当前对话中搜索，支持：
  - 区分大小写（`Aa`）
  - 全字匹配（`\b`）
  - 正则表达式（`.*`）
  - 匹配计数 + 上下跳转（Enter / Shift+Enter）
  - Prompts-only 模式下自动限制为仅搜索用户消息

### 文件变更追踪（Diff 视图）

- **全屏 Modal** — 点击 Files 按钮打开，左侧文件列表 + 右侧 Diff 内容
- **LCS 逐行对齐** — 基于最长公共子序列算法的真正 Side-by-Side Diff
- **三种行类型** — 相同行（灰色两侧）、删除行（红色左侧）、新增行（绿色右侧）
- **变更块导航** — ▲/▼ 按钮或 `Shift+↑/↓` 在变更间跳转，显示 "3/32" 计数
- **文件导航** — `←/→` 切换文件，左侧文件列表显示彩色扩展名标签和 +N/-M 行数
- **定位到消息** — 每个 Diff 操作有 "Go to message" 按钮跳回原始对话位置

### Prompt Library（Prompt 武器库）

- **三级作用域** — 全局 / 项目级 / 会话级，从不同维度浏览所有用户 Prompt
- **会话级 Toggle** — 聊天详情页点击 Prompts 按钮原地切换，不跳转页面
- **项目级/全局** — 卡片网格布局，响应式自适应列数
- **复制 & 跳转** — 每条 Prompt 可复制原始文本，可点击跳转到原始会话
- **筛选联动** — 项目和会话两级下拉筛选，选择项目后自动更新会话列表
- **分页加载** — 每页 30 条，底部 "Load more" 追加加载

### 数据统计

- **汇总卡片** — 总 Input/Output Tokens、总会话数、总消息数
- **每日柱状图** — 最近 30 天的 Token 用量趋势（Canvas 自绘）
- **按项目明细** — 各项目的 Token 用量排名，点击可跳转
- **模型分析** — 甜甜圈图展示模型占比，支持 Cost($) / Tokens 双视图切换
- **按项目筛选** — 下拉框切换查看单个项目的统计

### 时间线热力图

- **GitHub 风格** — 按周排列的活跃度格子，颜色深浅表示当天活跃程度
- **5 级色阶** — 从无活跃到极高活跃
- **Hover 提示** — 悬停显示日期、会话数、消息数
- **点击展开** — 点击某天查看当天的会话列表，可直接跳转到会话

### 会话管理

- **重命名** — 自定义会话名称（存储在 sidecar 文件，不修改原始 JSONL）
- **收藏** — 星标收藏，收藏的会话在列表中置顶显示
- **标签** — 自定义标签，支持输入新标签和从已有标签中选择
- **导出** — 三种格式：Markdown 文件下载、JSON 文件下载、复制到剪贴板

### 界面

- **深色/浅色主题** — 一键切换（sidebar 右上角），偏好保存到 localStorage
- **响应式布局** — 消息区域、Diff 弹窗、统计面板等随窗口自适应
- **可拖拽侧边栏** — 180px ~ 500px 范围内自由调整，宽度自动记忆
- **Scroll FAB** — 长对话中快速滚动到顶部/底部的浮动按钮

## 安装与使用

### 方式一：npx 一行启动（推荐）

```bash
npx cli-history-hub open
```

无需安装，自动启动服务并打开浏览器。

### 方式二：全局安装

```bash
npm install -g cli-history-hub

# 启动并打开浏览器
cli-history-hub open

# 或后台启动
cli-history-hub start

# 查看状态
cli-history-hub status

# 停止服务
cli-history-hub stop
```

### 方式三：下载独立二进制

从 [Releases](https://github.com/nameIsNoPublic/cli-history-hub/releases) 下载对应平台的可执行文件，无需 Node.js 环境：

- `cli-history-hub-macos-arm64` — macOS Apple Silicon
- `cli-history-hub-macos-x64` — macOS Intel
- `cli-history-hub-linux-x64` — Linux x64
- `cli-history-hub-win-x64.exe` — Windows x64

```bash
# macOS / Linux
chmod +x cli-history-hub-macos-arm64
./cli-history-hub-macos-arm64 open
```

### 方式四：从源码运行

```bash
git clone https://github.com/nameIsNoPublic/cli-history-hub.git
cd cli-history-hub
npm install
node server.js
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `cli-history-hub open` | 启动服务并打开浏览器 |
| `cli-history-hub start` | 后台启动服务 |
| `cli-history-hub stop` | 停止后台服务 |
| `cli-history-hub status` | 查看运行状态 |
| `cli-history-hub` | 前台启动（Ctrl+C 停止） |
| `cli-history-hub --port 8080` | 指定端口 |

> 确保 `~/.claude/projects/` 或 `~/.codex/sessions/` 中有会话数据。如果两个目录都不存在，页面将显示空列表。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + Express 4.x |
| 前端 | 原生 JavaScript + [marked.js](https://github.com/markedjs/marked)（Markdown 渲染） |
| 图表 | Canvas 2D API（自绘柱状图 + 甜甜圈图） |
| Diff | LCS（最长公共子序列）算法，纯前端实现 |
| 数据 | 文件系统（JSONL + JSON sidecar，无数据库，双数据源） |
| 样式 | 原生 CSS，CSS 变量驱动的暗色/浅色双主题 |

## 项目结构

```
cli-history-hub/
  server.js                 # 后端：Express 服务器 + 9 个 API + 双数据源解析
  package.json              # 项目配置（唯一依赖：express）
  LICENSE                   # CC BY-NC-SA 4.0
  public/
    index.html              # SPA 入口（7 视图 + 5 弹窗）
    style.css               # 全局样式（CSS 变量 + 暗色/浅色主题）
    app.js                  # 主应用（状态管理、视图切换、事件绑定）
    modules/
      router.js             # Hash 路由
      chat-view.js          # 消息渲染 + 分页 + 会话内搜索
      search.js             # 全局搜索弹窗
      stats.js              # 统计面板 + Canvas 图表
      features.js           # 重命名 / 标签 / 收藏 / 导出
      timeline.js           # 时间线热力图
      diff-view.js          # 文件变更 Diff 全屏 Modal
      prompts.js            # Prompt Library
  docs/                     # 项目文档（12 篇功能文档 + 索引）
```

## 数据来源

本应用**只读取**原生产生的 `.jsonl` 会话文件，不修改它们。

**Claude Code 数据：**
```
~/.claude/projects/{project-dir}/*.jsonl
```

**Codex CLI 数据：**
```
~/.codex/sessions/{year}/{month}/{day}/rollout-*.jsonl
~/.codex/session_index.jsonl
```

用户在 Hub 中添加的元数据（重命名、标签、收藏）存储在独立的 sidecar 文件中：
```
~/.claude/projects/{project-dir}/session-meta/{session-id}.json
```

> 如果 `~/.codex` 目录不存在，Codex 相关功能静默跳过。未来接入新的 CLI 工具只需新增数据源适配层，无需修改现有代码。

## API

共 9 个后端接口，详见 [API 参考文档](docs/api-reference.md)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表（含数据源标识） |
| GET | `/api/projects/:pid/sessions-full` | 会话元数据列表 |
| GET | `/api/projects/:pid/sessions/:sid` | 会话消息（Claude 格式 / Codex 透传） |
| PUT | `/api/projects/:pid/sessions/:sid/meta` | 更新会话元数据 |
| GET | `/api/search` | 全文搜索（跨双数据源） |
| GET | `/api/stats` | Token 用量统计 |
| GET | `/api/tags` | 标签列表 |
| GET | `/api/timeline` | 时间线热力图数据 |
| GET | `/api/prompts` | 用户 Prompt 列表 |

## 文档

完整的项目文档在 [docs/](docs/README.md) 目录下：

- [技术架构](docs/architecture.md) — 技术栈、模块关系、数据流
- [浏览与导航](docs/browse-and-navigate.md) — 项目列表、会话列表、时间分组、路由
- [对话详情](docs/conversation-detail.md) — 消息渲染、消息合并、分页、会话内搜索
- [文件变更 Diff](docs/diff-viewer.md) — LCS Side-by-Side Diff、全屏 Modal
- [Prompt Library](docs/prompts.md) — 多维度 Prompt 浏览、复用、复盘
- [搜索](docs/search.md) — 全局搜索、会话内搜索（含高级选项）
- [会话管理](docs/session-management.md) — 重命名、收藏、标签
- [导出](docs/export.md) — Markdown / JSON / 剪贴板
- [统计面板](docs/stats.md) — Token 统计、图表、模型分析
- [时间线热力图](docs/timeline.md) — GitHub 风格活跃度日历
- [深色/浅色主题](docs/theme.md) — CSS 变量方案、持久化
- [Codex CLI 集成](docs/codex-integration.md) — Codex 数据源接入、透传适配
- [数据存储](docs/data-storage.md) — JSONL 解析、sidecar、缓存
- [API 参考](docs/api-reference.md) — 9 个接口完整文档

## License

[CC BY-NC-SA 4.0](LICENSE) — 允许自由使用和修改，禁止商业用途，衍生作品需使用相同协议。
