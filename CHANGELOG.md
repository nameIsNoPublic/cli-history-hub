# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v1.1.0](https://github.com/nameIsNoPublic/cli-history-hub/releases/tag/v1.1.0) - 2026-03-20

### Added

- Display session ID in session cards with click-to-copy functionality
- CLI commands: `start`, `stop`, `status`, `open` + pkg binary build support
- Codex Gemini model stats support and token unit formatting (thanks @114ccc)

### Fixed

- Codex sidecar support and `readCodexSessionHead` performance
- Light theme visual issues

### Changed

- Improve session card title/subtitle spacing and readability
- Add npm version and downloads badges to README

## [1.0.1](https://github.com/nameIsNoPublic/cli-history-hub/releases/tag/1.0.1) - 2026-03-20

### Changed

- Consolidate project into single initial release package

## [1.0.0](https://github.com/nameIsNoPublic/cli-history-hub/releases/tag/1.0.0) - 2026-03-20

### Added

- Initial release
- Browse and manage Claude Code CLI conversation history
- Project list and session list views
- Conversation detail view with message pagination
- Global full-text search
- Token usage statistics with canvas charts
- Timeline heatmap
- Session management: rename, tags, favorites, export
- Prompt Library
- Dark/Light theme support
- Sidecar metadata storage (read-only JSONL policy)
- Express backend with 9 API endpoints and JSONL caching
