---
name: release
description: >
  发版流程：对比最新 git tag 与当前 HEAD 的差异，自动分析变更、更新 CHANGELOG.md、bump version、
  创建 commit + tag，可选推送远程并创建 GitHub Release / npm publish。
  触发：用户调用 /release 或 /release [版本号]。
  不触发：普通代码修改、commit、非发版场景。
---

# Release 发版流程

## 输入

- `版本号`（可选）：如 `1.2.0` 或 `v1.2.0`。未提供则自动推断。

## 流程

### Step 1: 前置检查

1. `git status` 确认工作区干净，有未提交变更则终止并提示用户
2. `git describe --tags --abbrev=0` 获取最新 tag
3. `git log <latest-tag>..HEAD --oneline` 获取待发布提交
4. 无新提交则告知用户并终止

输出：`1/6 前置检查通过，最新 tag: v1.1.0，待发布提交: N 条`

### Step 2: 分析变更

1. `git log <latest-tag>..HEAD --oneline --no-merges` 获取实际提交（跳过 merge commit）
2. `git log <latest-tag>..HEAD --oneline --merges` 检查 merge commit，提取外部贡献者用户名
3. 按 Conventional Commits 分类：
   - `feat` → **Added**
   - `fix` → **Fixed**
   - `style` / `refactor` / `perf` → **Changed**
   - `docs` → 记录但不影响版本号
   - `chore` → 视内容归类或忽略（纯 bump version 的 chore 忽略）
4. 版本推断（用户未指定时）：
   - 有 `feat` → bump minor
   - 仅 `fix` / `style` / `docs` 等 → bump patch
   - 用户声明 breaking change → bump major
5. 将分类结果和建议版本号展示给用户确认

输出：`2/6 变更分析：N feat, N fix, N style → 建议版本: vX.Y.Z`

### Step 3: 更新 CHANGELOG.md

1. 读取 `CHANGELOG.md`
2. 在第一个 `## [` 之前插入新 section：

```markdown
## [vX.Y.Z](https://github.com/nameIsNoPublic/cli-history-hub/releases/tag/vX.Y.Z) - YYYY-MM-DD

### Added
- 条目描述

### Fixed
- 条目描述

### Changed
- 条目描述
```

3. 只保留有内容的分类
4. 条目重写为可读描述，不直接复制 commit message
5. 外部贡献者的条目末尾加 `(thanks @username)`

输出：`3/6 CHANGELOG.md 已更新`

### Step 4: Bump version

1. 读取 `package.json`，更新 `version` 为新版本号（不带 `v` 前缀）

输出：`4/6 package.json version: X.Y.Z → X.Y.Z`

### Step 5: Commit + Tag

1. `git add CHANGELOG.md package.json`
2. `git commit -m "chore: bump version to X.Y.Z"`
3. `git tag vX.Y.Z`

输出：`5/6 已提交并打 tag vX.Y.Z`

### Step 6: 推送（需用户确认）

展示即将执行的操作，等待用户明确确认：

1. `git push origin main`
2. `git push origin vX.Y.Z`
3. 询问是否创建 GitHub Release → `gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog 内容>"`
4. 询问是否发布 npm → `npm publish`

输出：`6/6 已推送并创建 release`（或用户跳过的部分）

## 规则

- Tag 统一 `v` 前缀（`v1.2.0`），package.json version 不带（`1.2.0`）
- Changelog 条目重写为可读描述，不直接复制 commit message 原文
- Merge commit 跳过，分析其中的实际提交
- 外部贡献者条目加 `(thanks @username)`
- Step 6 的所有推送/发布操作必须经用户确认，不可自动执行
- 每步完成后输出简要状态行
