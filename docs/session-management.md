# 会话管理

## 概述

用户可以对会话进行重命名、收藏/置顶和打标签操作，所有元数据存储在 sidecar JSON 文件中，不修改 Claude Code 原生的 JSONL 文件。

## 关联功能

- [数据存储](data-storage.md) - sidecar 文件的存储机制
- [浏览与导航](browse-and-navigate.md) - 收藏状态影响列表排序（Pinned 分组）；标签显示在会话卡片上
- [对话详情](conversation-detail.md) - 详情页头部的管理按钮
- [导出](export.md) - 导出按钮与管理按钮同在详情页头部
- [API 参考](api-reference.md) - 使用 `/api/projects/:pid/sessions/:sid/meta` 和 `/api/tags`
- [技术架构](architecture.md) - Features 模块在前端架构中的位置

## 功能细节

### 重命名

通过弹窗给会话设置自定义名称。

**触发：** 详情页头部的编辑按钮（&#9998;）

**流程：**
1. 打开重命名弹窗，输入框预填当前标题
2. 输入框自动获得焦点并全选
3. 按 Enter 或点 Save 保存
4. 调用 `PUT /api/.../meta` 写入 `{ customName: "新名称" }`
5. 更新详情页标题
6. 后台刷新会话列表（`App.loadSessions()`）

**关闭：** 点 Cancel / 点遮罩层 / 按 Escape

**命名优先级：** sidecar 的 `customName` > JSONL 中的 rename 记录 > firstPrompt > "Untitled"

**数据源支持：** Claude Code 和 Codex CLI 会话均支持重命名/收藏/标签。Claude 的 sidecar 存储在 `~/.claude/projects/{pid}/session-meta/`，Codex 的 sidecar 存储在 `~/.codex/sessions/session-meta/`。

### 收藏/置顶

一键收藏会话，收藏的会话在列表中置顶显示。

**触发：** 详情页头部的星标按钮（&#9734;/&#9733;）

**流程：**
1. 点击星标按钮切换收藏状态
2. 调用 `PUT /api/.../meta` 写入 `{ isFavorite: true/false }`
3. 更新星标按钮外观（空心星 ↔ 实心星）
4. 显示 Toast 提示 "Added to favorites" / "Removed from favorites"
5. 后台刷新会话列表

**列表中的效果：**
- 收藏的会话显示在 "Pinned" 分组中，置于所有时间分组之上
- 会话卡片显示实心星标
- 取消收藏后回到对应的时间分组

### 标签

给会话添加自定义标签，支持从已有标签中选择。

**触发：** 详情页头部的标签按钮（&#127991; Tags）

**流程：**
1. 打开标签弹窗，显示当前会话的标签列表
2. 从 `GET /api/tags` 加载所有已用标签作为"建议"
3. 在输入框中输入新标签名，按 Enter 添加
4. 或点击建议标签直接添加
5. 点击标签上的 × 删除标签
6. 点 Done / 点遮罩层 / 按 Escape 关闭弹窗
7. **关闭时自动保存**：调用 `PUT /api/.../meta` 写入 `{ tags: [...] }`
8. 更新详情页头部的标签展示
9. 后台刷新会话列表

**建议标签：** 从所有项目的 sidecar 中收集去重，排除当前会话已有的标签。

**标签在列表中的效果：**
- 会话卡片底部显示彩色标签
- 列表内搜索可匹配标签文本

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 前端 | public/modules/features.js:131-178 | 重命名：`openRenameModal()`, `saveRename()` |
| 前端 | public/modules/features.js:184-331 | 标签：`openTagModal()`, `closeTagModal()`, `addTagFromInput()`, `removeTag()`, `renderTagList()`, `renderTagSuggestions()` |
| 前端 | public/modules/features.js:479-527 | 收藏：`toggleFavorite()`, `updateFavoriteButton()` |
| 前端 | public/modules/features.js:533-601 | 通用：`closeModal()`, `showToast()`, `apiPut()` |
| 前端 | public/app.js:665-674 | `updateFavoriteButton()` (App 侧的外观更新) |
| 后端 | server.js | `PUT /api/projects/:pid/sessions/:sid/meta`（支持 Claude 和 Codex 会话） |
| 后端 | server.js | `GET /api/tags` |
| 后端 | server.js:47-70 | `readSidecarMeta()`, `writeSidecarMeta()` |

## API 接口

- `PUT /api/projects/:pid/sessions/:sid/meta` → [API 参考](api-reference.md#meta)
- `GET /api/tags` → [API 参考](api-reference.md#tags)

## 修改指南

### 如果要增加新的元数据字段

1. 后端 `server.js` 的 `PUT /meta` 路由中添加新字段的处理（`req.body.newField`）
2. 后端 `extractSessionMeta()` 中从 sidecar 读取新字段并包含在返回值中
3. 前端 `features.js` 中添加对应的 UI 和交互逻辑
4. 更新 `app.js` 的 `state.currentSessionMeta` 包含新字段
5. 更新 [数据存储](data-storage.md) 文档中的 sidecar 格式说明

### 如果要从列表页直接管理会话

1. 在 `app.js` 的 `createSessionCard()` 中添加操作按钮
2. 注意不要让按钮点击事件冒泡到卡片的 click 事件（`e.stopPropagation()`）
3. 管理操作完成后调用 `applyFilters()` 刷新列表

### 如果要支持批量操作

1. 添加多选模式（checkbox 或长按选择）
2. 批量操作需要多次调用 `PUT /meta`（后端没有批量接口）
3. 考虑添加批量 API 端点以提高性能

## 已知问题 / TODO

- [ ] 只能在详情页管理会话，不能在列表页操作
- [ ] 没有批量操作（批量打标签、批量收藏）
- [ ] 标签没有颜色区分
- [ ] 标签建议没有按使用频率排序
- [ ] 重命名没有长度限制校验
- [ ] `updateFavoriteButton()` 在 `features.js` 和 `app.js` 中有两份实现
