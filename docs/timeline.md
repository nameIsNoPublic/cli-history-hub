# 时间线热力图

## 功能概述

GitHub 风格的活跃度热力图，以日历格子展示每天的 Claude Code 使用情况。横轴为周，纵轴为周一到周日，颜色深浅代表当日会话活跃程度。默认展示最近 3 个月的数据。

## 功能细节

### 热力图格子

- 每个格子代表一天
- 颜色分 5 级：无活跃（bg-tertiary）→ `#0e4429` → `#006d32` → `#26a641` → `#39d353`
- 颜色级别根据 sessionCount 与最大值的比值决定

### 交互

- **Hover**：显示 tooltip，包含日期、session 数量、message 数量
- **点击**：在下方展开该天的会话列表
- **会话跳转**：点击会话列表中的条目，跳转到对应项目的对话详情

### 布局

- 顶部月份标签（Jan, Feb, Mar...）
- 左侧星期标签（Mon, Wed, Fri 间隔显示）
- 底部颜色图例（Less → More）

## 导航入口

- 侧边栏 "Timeline" 按钮
- URL 路由 `#/timeline`
- 返回按钮回到之前的视图

## API 接口

使用 `GET /api/timeline?months=3`，详见 [API 参考](api-reference.md#timeline)。

## 涉及的代码

| 文件 | 说明 |
|------|------|
| `server.js` | `GET /api/timeline` 路由 — 聚合每日会话数据和 Token 用量 |
| `public/modules/timeline.js` | `window.Timeline` 模块 — 热力图渲染、tooltip、日期会话列表 |
| `public/index.html` | `#timelineView` 视图 HTML + sidebar 按钮 + script 标签 |
| `public/style.css` | `.timeline-*` 系列样式 |
| `public/app.js` | VIEW_IDS 添加 timeline、cacheDom、bindEvents、init 调用 |
| `public/modules/router.js` | `#/timeline` 路由解析和处理 |

## 关键函数

| 模块 | 函数 | 说明 |
|------|------|------|
| `window.Timeline` | `init()` | 创建 tooltip DOM 元素 |
| `window.Timeline` | `show()` | 显示视图、设置路由、加载数据并渲染 |
| timeline.js | `renderHeatmap()` | 构建热力图 DOM：周列、日行、格子、图例 |
| timeline.js | `getColorLevel()` | 根据 sessionCount 计算颜色级别（0-4） |
| timeline.js | `showTooltip()` | 显示 hover 提示，自动防溢出 |
| timeline.js | `showDayDetail()` | 展开该天的会话列表面板 |

## 关联功能

- [浏览与导航](browse-and-navigate.md) — 点击会话列表跳转到对话详情
- [API 参考](api-reference.md) — timeline API 端点
- [技术架构](architecture.md) — 新增前端模块

## 修改指南

### 修改颜色分级

修改 `timeline.js` 中的 `COLORS` 数组和 `getColorLevel()` 函数。

### 修改时间范围

默认 3 个月，可修改 API 调用参数 `?months=N`（最大 12）。后端限制在 `GET /api/timeline` 路由中。

### 添加新的聚合维度

1. 在 `server.js` 的 timeline 路由中添加新字段到 dayMap
2. 在 `timeline.js` 的 tooltip 或 dayDetail 中展示

## 已知问题 / TODO

- [ ] 热力图颜色可基于 messageCount 或 totalTokens 切换
- [ ] 支持选择时间范围（1/3/6/12 个月）
- [ ] 暂不支持按项目筛选
