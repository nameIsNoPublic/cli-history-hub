---
name: check-docs
description: >
  代码变更后评估项目文档是否需要更新或创建。
  触发时机：完成功能开发、bug 修复或任何影响行为的代码变更后，提交前自动触发。也可手动调用 /check-docs。
  不触发：纯对话交互、无代码变更时。
---

# 文档完整性检查

评估未提交的代码变更，对照项目文档规范，输出需要更新或创建的文档清单。启动后台 agent 执行，不阻塞主工作流。

## 检查流程

1. 运行 `git diff --stat` 和 `git status -u` 获取所有变更/新增文件
2. 读取 `CLAUDE.md` 中的"功能 → 文档对照表"
3. 读取 `docs/README.md` 获取当前文档索引和交叉引用图
4. 逐个变更文件对照映射表，判断影响哪些文档
5. 按下表逐项检查是否有遗漏：

### 必检项

| 条件 | 要求的操作 |
|------|-----------|
| `public/modules/` 下新增 JS 文件 | 创建独立的 `docs/{模块名}.md` |
| `server.js` 新增/修改 API 端点 | 更新 `docs/api-reference.md` |
| 新增功能或行为变更 | 在对应功能文档中新增/更新章节 |
| 函数名或签名变更 | 更新受影响文档的"涉及的代码"表格 |
| 新建了文档文件 | 添加到 `docs/README.md` 索引 + 交叉引用图 |
| 新增功能→文档映射 | 添加到 `CLAUDE.md` 对照表 |
| 新增功能/模块/API/视图 | 更新根 `README.md`（功能列表、项目结构、API 表格、数量） |

### 辅助检查

- `docs/README.md` 项目结构是否与实际文件一致
- 根 `README.md` 的 API 数量是否与实际端点一致
- 根 `README.md` 的视图/弹窗数量是否与 HTML 一致

## 输出格式

```markdown
## 文档更新清单

### 需要新建的文档
- [ ] `docs/xxx.md` — 原因

### 需要更新的文档
- [ ] `docs/yyy.md` — 更新哪个章节、改什么内容
- [ ] `docs/README.md` — 添加什么索引/引用
- [ ] `CLAUDE.md` — 添加什么映射
- [ ] `README.md` — 更新什么内容

### 无需操作
- 文件名 — 无文档影响 / 已是最新
```

如果所有文档都已是最新，输出："文档已全部同步，无需操作。"

## 规则

- 逐个检查每一个变更文件，不遗漏
- **新增功能必须创建独立文档**，按业务模块拆分，不要塞进已有文档里
- **小功能也要更新**对应功能文档中的相关章节（如 splitter、响应式修复）
- `public/modules/` 新增文件必须有独立 `docs/{name}.md`
- `server.js` API 变更必须更新 `docs/api-reference.md`
- 纯 CSS 变更除非新增视觉功能，否则不需要更新文档
- 更新文档时必须同步检查以下 4 个索引文件：
  1. `docs/README.md` — 索引 + 项目结构 + 交叉引用图
  2. `CLAUDE.md` — 功能→文档对照表
  3. `README.md`（根目录）— 功能列表 + 项目结构 + API 表格 + 数量统计
  4. 新文档关联的其他功能文档的"关联功能"章节
- 宁可多报也不漏报

## 当前文档清单

每个业务功能对应独立文档：

| 文档 | 覆盖内容 |
|------|---------|
| `browse-and-navigate.md` | 项目列表、会话列表、sidebar splitter、路由 |
| `conversation-detail.md` | 消息渲染、分页、消息复制、会话内搜索 |
| `diff-viewer.md` | 文件变更 Diff 全屏 Modal |
| `search.md` | 全局搜索、会话内搜索 |
| `session-management.md` | 重命名、收藏、标签 |
| `export.md` | Markdown/JSON/剪贴板导出 |
| `stats.md` | Token 统计、图表、模型分析 |
| `timeline.md` | 时间线热力图 |
| `theme.md` | 深色/浅色主题切换 |
| `architecture.md` | 技术栈、模块关系 |
| `data-storage.md` | JSONL 解析、sidecar、缓存 |
| `api-reference.md` | 8 个 API 端点 |
