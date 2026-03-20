# 统计面板

## 概述

展示 Claude Code、Codex CLI 和 Gemini CLI 的 Token 使用统计数据，包括汇总卡片、每日用量柱状图、按项目和模型的分类明细。统计数据目前同时汇总三个数据源，其中 Gemini 仅接入统计链路。

## 关联功能

- [数据存储](data-storage.md) - Token 数据来源于 Claude/Codex 的 JSONL，以及 Gemini 的 session JSON
- [API 参考](api-reference.md) - 使用 `/api/stats` 端点
- [浏览与导航](browse-and-navigate.md) - 通过侧边栏按钮或 URL 路由进入统计页
- [技术架构](architecture.md) - Stats 模块在前端架构中的位置
- [Codex CLI 集成](codex-integration.md) - 统计数据包含 Codex 用量

## 功能细节

### 进入方式

- 侧边栏的 "Stats" 按钮
- 直接访问 URL `#/stats` 或 `#/stats/{projectId}`

### 项目筛选

页面头部的下拉框可选择查看特定 Claude/Codex 项目或全部项目的统计。Gemini 项目当前仅出现在汇总统计中，不出现在顶部筛选下拉框。

### 汇总卡片

显示 4 个指标卡片：

| 卡片 | 数据来源 |
|------|---------|
| Total Input Tokens | `totalTokens.input` |
| Total Output Tokens | `totalTokens.output` |
| Total Sessions | `totalSessions` |
| Total Messages | `totalMessages` |

普通数字格式化为带逗号的形式（如 1,234,567）；Token 数值大于等于 1,000,000 时按 `M` 单位显示（如 1.5M）。

### 每日 Token 用量图表

使用 Canvas 2D API 自绘的柱状图，展示近 30 天每日的 output tokens 用量。

**图表特性：**
- 仅显示 output tokens（蓝色柱子，颜色 `#58a6ff`）
- Y 轴自动缩放到"漂亮"的数值（1/2/5/10 的倍数）
- Y 轴标签使用 K/M 缩写（如 1.2K, 1.5M）
- X 轴显示日期（MM-DD 格式），避免拥挤时间隔显示
- 5 条水平网格线
- 支持高 DPI 屏幕（`devicePixelRatio` 缩放）
- 无数据时显示 "No token usage data available"

**Y 轴 "nice round up" 算法：**
1. 取最大值的数量级（10^n）
2. 归一化到 1-10 范围
3. 向上取到 1/2/5/10 中最近的值

### 分类明细

两个表格展示详细的分类统计：

**按项目 (By Project)：**

| 列 | 说明 |
|----|------|
| Project | 项目名（长路径截取最后两段） |
| Input Tokens | 该项目的输入 Token 总量 |
| Output Tokens | 该项目的输出 Token 总量 |

按总 Token 量降序排列。Claude/Codex 行支持点击跳转回项目；Gemini 行当前仅用于展示统计，不支持点击跳转。

**按模型 (By Model)：**

| 列 | 说明 |
|----|------|
| Model | 模型名称 |
| Messages | 使用该模型的助手消息数 |
| Output Tokens | 该模型的输出 Token 总量 |

按消息数降序排列。

### 返回导航

返回按钮的行为根据之前的视图状态决定：
- 有当前会话 → 回到对话详情
- 有当前项目 → 回到会话列表
- 都没有 → 回到欢迎页

## 涉及的代码

| 位置 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 前端 | public/modules/stats.js:20-54 | `init()` - 事件绑定 |
| 前端 | public/modules/stats.js:60-99 | `show()` - 加载并渲染统计数据 |
| 前端 | public/modules/stats.js:105-123 | `populateProjectFilter()` |
| 前端 | public/modules/stats.js:129-152 | `renderSummaryCards()` |
| 前端 | public/modules/stats.js:158-267 | `renderDailyChart()` - Canvas 柱状图 |
| 前端 | public/modules/stats.js:272-282 | `niceRoundUp()` - Y 轴刻度算法 |
| 前端 | public/modules/stats.js:288-341 | `renderBreakdown()` - 分类表格 |
| 前端 | public/modules/stats.js:383-393 | `formatShortNumber()` - K/M 格式化 |
| 前端 | public/modules/stats.js | `redrawChart()` - 暴露给主题切换用的 Canvas 重绘方法 |
| 后端 | server.js | `GET /api/stats` |

## API 接口

- `GET /api/stats?project=projectId` → [API 参考](api-reference.md#stats)

### 数据源说明

- **Claude Code**：从 `assistant.message.usage` 读取 input/output/cache tokens
- **Codex CLI**：从 `event_msg.payload.info.total_token_usage` 读取 tokens
- **Gemini CLI**：从 `~/.gemini/tmp/*/chats/session-*.json` 中 `message.tokens` 与 `message.model` 读取 tokens 和模型名

## 修改指南

### 如果要增加新的统计维度

1. 后端 `server.js` 的 `/api/stats` 路由中添加新的聚合逻辑
2. 在响应 JSON 中添加新字段
3. 前端 `stats.js` 中添加新的渲染函数（卡片 or 表格 or 图表）
4. 更新 [API 参考](api-reference.md#stats) 文档

### 如果要修改图表类型

1. `renderDailyChart()` 是纯 Canvas 2D 绘制
2. 如果要改为折线图：替换 `fillRect` 为 `lineTo` + `stroke`
3. 如果要引入图表库（如 Chart.js）：
   - 在 `index.html` 添加 CDN 引用
   - 替换 `renderDailyChart()` 的实现
   - 删除 `niceRoundUp()` 等辅助函数

### 如果要修改时间范围

1. 后端 `server.js:619-620` 修改 `thirtyDaysAgo` 的计算
2. 前端图表会自动适应数据量

### 如果要加 cache_creation / cache_read 的展示

1. 后端已经在 `totalTokens` 中包含了这两个字段
2. 在 `renderSummaryCards()` 中添加两个新卡片
3. 或在图表中添加堆叠柱子区分不同 token 类型

## 已知问题 / TODO

- [ ] 统计 API 没有缓存，每次请求全量扫描
- [ ] 图表只显示 output tokens，没有 input tokens 对比
- [ ] 没有 cache_creation 和 cache_read tokens 的可视化
- [ ] 图表没有 tooltip（悬停显示具体数值）
- [ ] 没有数据导出功能（导出统计数据为 CSV）
- [ ] 每日图表固定 30 天，不能自定义时间范围

### 最近优化记录 (Recent Updates)
- **看板交互穿越**：`By Project` 的报表行支持 hover 态与点击穿越，附带 `projectId` 触发 Router 单页无缝跳转回该项目的对话列表。
- **多模型财务饼图 (Model Analytics)**：
  - 弃用基础的模型文本表格，在右侧新增基于纯原生 Vanilla JS 实现的 Canvas 甜甜圈图（Doughnut Chart）及交互式 Hover 图例。
  - 首创 `Cost($) vs Tokens` 业务视图解耦。前端内置定价映射表，支持一键切换评估 "吃量模型" 与 "烧钱模型" 的占比落差，极大增强视觉冲击和洞察力。
