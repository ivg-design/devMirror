# DevMirror Changelog

All notable changes to the DevMirror VS Code extension will be documented in this file.

## [0.3.8] - 2025-09-20

### Added
- Configuration settings for auto-refresh and auto-fold
- DevMirror: Open Settings command
- Settings open when clicking status bar with no active monitoring

### Fixed
- Auto-refresh now properly detects active editor
- Faster status bar response (1 second check interval, 3 second timeout)
- Better workspace detection for multi-project setups

## [0.3.7] - 2025-09-20

### Fixed
- Status bar now always visible (was being hidden incorrectly)
- Added auto-refresh for open log files when new content arrives
- Auto-refresh debounced to 1.5 seconds to prevent spamming
- Maintains scroll position or follows tail if at bottom
- Applies folding after each refresh

## [0.3.6] - 2025-09-20

### Fixed
- Folding now applies to new log entries with better preservation of cursor position
- Status bar shows green emoji when running, hidden when inactive
- Status bar displays log count and uptime correctly
- Status bar click opens the correct workspace log file
- Log viewer opens at bottom (tail) with auto-scroll ready
- Improved folding debounce to 1 second for better stability

## [0.3.5] - 2025-09-20

### Fixed
- DevMirror Scripts panel now uses dynamic npx devmirror-cli wrapper
- Status bar monitoring now properly shows log count and session timer
- Log viewer opens in active tab instead of beside panel
- Word wrap automatically disabled when viewing logs
- Improved log folding with better detection on file open
- Status monitor more reliably detects running CLI instances

## [0.3.4] - 2025-01-20

### Fixed
- Status bar now shows immediately when extension activates
- Fixed log folding by watching all .log files in devmirror-logs
- Added multiple file watchers for better folding detection
- Folding now applies to any open log file in devmirror-logs directory

## [0.3.3] - 2025-01-20

### Added
- Dynamic CLI wrapper that automatically finds the latest DevMirror extension version
- Scripts now use `npx devmirror-cli` instead of hard-coded paths
- No more manual updates needed when extension is upgraded

### Fixed
- Extension will now work correctly after updates without modifying package.json

## [0.3.2] - 2025-01-20

### Fixed
- Fixed puppeteer-core loading to check project directory first before failing
- CEFBridge now uses dynamic puppeteer loading like CDPManager

## [0.3.1] - 2025-01-20

### Fixed
- Timestamp format now uses local time correctly without microseconds
- Fixed Chrome DevTools timestamp multiplication bug causing invalid dates
- README accuracy: clarified use of Puppeteer/Chromium instead of Chrome

## [0.3.0] - 2025-01-20

### Added
- Production-ready stable release
- Optimized package size (reduced to 2.72 MB)
- Proper .vscodeignore file for clean packaging
- Clean codebase with removed unnecessary folders

### Changed
- Optimized extension icon (reduced from 332 KB to 66 KB)
- Improved build process

## [0.2.9] - 2025-01-20

### Added
- Status Bar Auto-Detection for running CLI instances
- Debounced log folding (waits 500ms after last write)
- Local time timestamps (format: YYYY-MM-DD HH:MM:SS.m)
- CLI status file for VS Code detection

### Fixed
- Status bar now appears when running :mirror scripts
- Log folding no longer spams during heavy logging

## [0.2.8] - 2025-01-20

### Fixed
- Chrome viewport now uses full window size (defaultViewport: null)
- Improved log folding with foldAll command
- Better editor timing for fold operations

## [0.2.7] - 2025-01-20

### Added
- Auto config creation for nested packages in monorepos
- Smart port detection from scripts, .env files, or framework defaults
- Config validation and auto-update for missing fields

### Changed
- Supports Vite (5173) and Next.js (3000) default ports

## [0.2.6] - 2025-01-20

### Added
- Monorepo support with tree view in Explorer
- Script Manager for one-click :mirror script addition
- Fixed log folding to properly collapse entries
- Chrome launches maximized to prevent viewport constraints

## [0.2.5] - 2025-01-20

### Added
- Flexible puppeteer-core loading (supports global and project-local)
- Better error messages when puppeteer-core is missing

## [0.2.4] - 2025-01-20

### Fixed
- Extension ID detection for all publisher ID variations

## [0.2.3] - 2025-01-20

### Added
- Persistent Chrome profile for DevTools settings
- Official IVGDesign publisher ID
- Repository links to GitHub

## [0.2.2] - 2025-01-20

### Added
- Live status bar showing log count and capture duration
- Auto-folding logs when viewing
- Beautiful DevMirror icon
- Direct VS Code commands (no terminal needed)

### Changed
- No longer creates .devmirror folder
- Runs directly from extension directory

## [0.2.0] - 2025-01-20

### Added
- Initial beta release
- Chrome DevTools Protocol integration
- Console output capture
- Network error tracking
- Security monitoring
- Page lifecycle events
- Adobe CEP support
- Timestamped logs
- Automatic file rotation at 50MB
- Message deduplication