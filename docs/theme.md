# 深色/浅色主题切换

## 概述

支持深色（Dark）和浅色（Light）双主题切换，基于 CSS 变量方案实现，用户偏好通过 localStorage 持久化，默认暗色主题。

## 关联功能

- [技术架构](architecture.md) - 主题切换在架构文档中的概述及已知限制
- [统计面板](stats.md) - Canvas 图表中的硬编码颜色不随主题变化（已知问题）
- [时间线热力图](timeline.md) - 热力图格子颜色硬编码在 JS 中（已知问题）
- [对话详情](conversation-detail.md) - 消息气泡、thinking/tool 块使用主题变量着色
- [会话管理](session-management.md) - 标签样式在浅色主题下有专门覆盖

## 功能细节

### 实现方案

- **CSS 变量方案**：`:root` 定义暗色主题默认值（GitHub Dark 风格），`[data-theme="light"]` 选择器覆盖全部变量为浅色值（GitHub Light 风格）
- 通过 `document.documentElement.dataset.theme` 设置 `'dark'` 或 `'light'` 切换主题
- 全局样式中的颜色引用 `var(--xxx)` 变量，切换时自动生效，无需 JS 操作 DOM

### 切换按钮

- **位置**：sidebar-header 右上角（`position: absolute; top: 12px; right: 12px`）
- **元素**：`<button id="themeToggleBtn" class="btn-theme-toggle">`
- **图标**：暗色模式显示 &#9788;（太阳，HTML `&#9788;`），浅色模式显示 &#9790;（月亮，HTML `&#9790;`）
- **样式**：30x30px 圆形按钮，hover 时显示 accent 颜色边框和辉光

### 持久化

- **localStorage key**：`'theme'`
- **值**：`'light'` | `'dark'`
- **页面加载时**：`init()` → `initTheme()` 读取 localStorage，无值时默认 `'dark'`
- **切换时**：`toggleTheme()` 计算新主题 → `applyTheme()` 更新 DOM → `localStorage.setItem()` 保存

### 浅色主题变量对照表

| CSS 变量 | 暗色值（`:root` 默认） | 浅色值（`[data-theme="light"]`） |
|----------|----------------------|-------------------------------|
| `--bg` | `#0d1117` | `#ffffff` |
| `--bg-secondary` | `#161b22` | `#f6f8fa` |
| `--bg-tertiary` | `#1c2333` | `#f0f2f5` |
| `--bg-elevated` | `#1e2736` | `#ffffff` |
| `--border` | `#30363d` | `#d0d7de` |
| `--border-hover` | `#484f58` | `#8c959f` |
| `--text` | `#e6edf3` | `#1f2328` |
| `--text-secondary` | `#8b949e` | `#656d76` |
| `--text-muted` | `#6e7681` | `#8c959f` |
| `--accent` | `#58a6ff` | `#0969da` |
| `--accent-hover` | `#79c0ff` | `#0550ae` |
| `--accent-glow` | `rgba(88, 166, 255, 0.15)` | `rgba(9, 105, 218, 0.1)` |
| `--user-bg` | `#1a2332` | `#ddf4ff` |
| `--user-border` | `#1e3a5f` | `#54aeff` |
| `--assistant-bg` | `#131920` | `#f6f8fa` |
| `--thinking-bg` | `#1a1a2e` | `#f5f0ff` |
| `--thinking-border` | `#2d2654` | `#d8b9ff` |
| `--thinking-text` | `#a78bfa` | `#8250df` |
| `--tool-bg` | `#1a2318` | `#dafbe1` |
| `--tool-border` | `#2a3d1e` | `#4ac26b` |
| `--success` | `#3fb950` | `#1a7f37` |
| `--warning` | `#d29922` | `#9a6700` |
| `--danger` | `#f85149` | `#cf222e` |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.3)` | `0 1px 3px rgba(31,35,40,0.08)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | `0 4px 12px rgba(31,35,40,0.1)` |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.25)` | `0 2px 8px rgba(31,35,40,0.06)` |

### 需要特殊覆盖的样式

以下样式在 `[data-theme="light"]` 下使用硬编码颜色覆盖，因为它们无法仅通过 CSS 变量切换实现：

| 选择器 | 说明 | 浅色值 |
|--------|------|--------|
| `.message-role.user` | 用户消息角色标签渐变背景 | `linear-gradient(135deg, #ddf4ff, #b6e3ff)`，文字 `#0550ae` |
| `.message-role.assistant` | 助手消息角色标签渐变背景 | `linear-gradient(135deg, #f5f0ff, #e8d5ff)`，文字 `#6639a6` |
| `.thinking-toggle:hover` | 思考块折叠按钮 hover | 背景 `#ebe1ff` |
| `.tool-toggle:hover` | 工具块折叠按钮 hover | 背景 `#c8f5d0` |
| `.tag` | 标签基础样式 | 背景 `#ddf4ff`，文字 `#0550ae` |
| `.tag.branch` | 分支标签 | 背景 `#dafbe1`，文字 `#1a7f37` |
| `.tag.user-tag` | 用户自定义标签 | 背景 `#f5f0ff`，文字 `#8250df` |
| `.tag-item` | 标签管理弹窗中的标签项 | 背景 `#ddf4ff`，文字 `#0550ae` |
| `.tag-suggestions-list .tag:hover` | 标签建议 hover | 背景 `#b6e3ff` |
| `.search-match` | 搜索高亮 | 背景 `rgba(154, 103, 0, 0.15)`，文字 `#633c01` |
| `.modal-overlay` | 弹窗遮罩 | `rgba(31, 35, 40, 0.4)` |
| `.btn-primary` | 主要按钮文字颜色 | 文字 `#ffffff` |
| `.welcome h2` | 欢迎页标题渐变 | `linear-gradient(135deg, var(--accent), var(--thinking-text))` |
| `::-webkit-scrollbar-thumb` | 滚动条滑块 | `#c0c8d0`，hover `#8c959f` |
| `.diff-split-table .diff-code.del` | Diff 删除行 | 背景 `rgba(255, 129, 130, 0.2)`，文字 `#82071e` |
| `.diff-split-table .diff-code.add` | Diff 新增行 | 背景 `rgba(63, 185, 80, 0.18)`，文字 `#116329` |
| `.diff-split-table .diff-sign.del` | Diff 删除行符号列 | 背景 `rgba(255, 129, 130, 0.15)` |
| `.diff-split-table .diff-sign.add` | Diff 新增行符号列 | 背景 `rgba(63, 185, 80, 0.12)` |
| `.diff-split-table .diff-code.filler` 等 | Diff 填充行 | 背景 `#f0f2f5` |
| `.diff-modal-overlay` | Diff 弹窗遮罩 | `rgba(0, 0, 0, 0.5)` |

## 涉及的代码

| 文件 | 函数/区域 | 说明 |
|------|----------|------|
| `public/style.css` | `:root { ... }` | 暗色主题 CSS 变量定义（默认） |
| `public/style.css` | `[data-theme="light"] { ... }`（第 46 行） | 浅色主题 CSS 变量覆盖 |
| `public/style.css` | `.btn-theme-toggle`（第 1836 行） | 切换按钮样式 |
| `public/style.css` | `[data-theme="light"] .message-role.*` 等（第 1863 行起） | 浅色主题硬编码样式覆盖 |
| `public/style.css` | `[data-theme="light"] .diff-*`（第 2533 行起） | Diff 视图浅色主题覆盖 |
| `public/index.html` | `<button id="themeToggleBtn">`（第 18 行） | 切换按钮 HTML，位于 `.sidebar-header` 中 |
| `public/app.js` | `initTheme()`（第 910 行） | 页面加载时从 localStorage 读取主题并应用 |
| `public/app.js` | `applyTheme(theme)`（第 918 行） | 设置 `data-theme` 属性并更新按钮图标 |
| `public/app.js` | `toggleTheme()`（第 929 行） | 切换主题并持久化到 localStorage |
| `public/app.js` | `cacheDom()` → `dom.themeToggleBtn`（第 58 行） | 缓存切换按钮 DOM 引用 |
| `public/app.js` | `bindEvents()` → `themeToggleBtn`（第 888 行） | 绑定点击事件到 `toggleTheme()` |
| `public/app.js` | `window.App.toggleTheme`（第 988 行） | 暴露为全局 API |

## 修改指南

### 如何新增需要适配主题的组件

1. 在组件样式中使用 CSS 变量（如 `color: var(--text);`、`background: var(--bg-secondary);`），这样深色/浅色会自动切换
2. 如果新组件有渐变、阴影等无法用现有变量表达的样式，需要在 `style.css` 中添加 `[data-theme="light"] .your-component { ... }` 覆盖规则
3. 将新增的覆盖规则放在已有的 `[data-theme="light"]` 覆盖区域附近，保持代码组织一致

### 如何修改浅色主题颜色

1. 修改全局色调：编辑 `style.css` 第 46 行 `[data-theme="light"]` 块中的变量值
2. 修改特定组件浅色样式：找到对应的 `[data-theme="light"] .xxx` 规则，修改硬编码的颜色值
3. 修改暗色主题不受影响——暗色变量在 `:root` 中独立定义

### 如何让 Canvas 图表适配主题

目前 Canvas 图表颜色硬编码在 JS 中。若需适配：
1. 在绘制前通过 `getComputedStyle(document.documentElement).getPropertyValue('--variable-name')` 读取当前主题的 CSS 变量值
2. 用读取到的颜色值替换硬编码的颜色常量
3. 监听主题切换后需要重新绘制图表

## 已知问题 / TODO

- [ ] Canvas 图表（`public/modules/stats.js` 中的 tokenChart、modelPieChart）颜色硬编码在 JS 中（如 `#30363d` 网格线、`#8b949e` 文字、`#0d1117` 背景），不随主题切换变化
- [ ] 时间线热力图（`public/modules/timeline.js`）格子颜色硬编码在 JS 中，不随主题切换
- [ ] 浅色主题下部分覆盖样式使用硬编码值而非 CSS 变量，增加了维护成本；可考虑引入更多语义化变量来减少硬编码覆盖
