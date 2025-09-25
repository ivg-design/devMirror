# DevMirror - Browser Console Capture Extension

**Capture browser console output using Chrome DevTools Protocol**

[![Version](https://img.shields.io/badge/version-0.4.79-blue.svg)](CHANGELOG.md) [![Publisher](https://img.shields.io/badge/publisher-IVGDesign-green.svg)](https://marketplace.visualstudio.com/publishers/IVGDesign) [![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](LICENSE)

DevMirror is a VS Code extension that captures browser console output to timestamped log files using Chrome DevTools Protocol (CDP) or Adobe CEF debugging.

## Current Features (v0.4.79)

- **Complete Console Capture** - Logs all console messages with formatted arrays/objects as foldable JSON
- **Enhanced Formatting** - Arrays and objects display as multi-line, indented JSON for better readability
- **Console.table() Support** - Displays as formatted ASCII tables with all object properties as columns
- **Dual Mode Support** - Works with regular Chrome (CDP) and Adobe CEF extensions
- **Smart Dynamic Paths** - Shim-based CLI resolution survives extension updates
- **DevMirror Scripts Panel** - Visual tree view in Explorer sidebar showing all package.json scripts
- **One-Click Setup** - Add mirror scripts instantly with the (+) button
- **Startup Wizard** - Advanced configuration interface with magic wand icon
- **Auto Port Detection** - Automatically finds running dev server ports
- **Live Status Bar** - Shows active capture with log count and duration
- **Real-time Updates** - Log files update as new content arrives
- **Stack Traces** - Full JavaScript stack traces for errors and console messages
- **Network Error Tracking** - Captures failed network requests with details
- **Intelligent Filtering** - Excludes cache directories and temporary files

## Installation

1. Install DevMirror from VS Code Marketplace
2. Open your project in VS Code
3. Use the DevMirror Scripts panel or Command Palette to set up

## Quick Start

### Option 1: Visual Setup (Recommended)

1. Look for **DevMirror Scripts** panel in Explorer sidebar
2. Click **+** button next to any script for instant setup
3. Or click the magic wand icon for the Startup Wizard
4. Run your new `:mirror` script

### Option 2: Command Palette

```bash
# Run in VS Code (Cmd/Ctrl+Shift+P)
DevMirror: Setup Project
```

This creates `devmirror.config.json` in your project root.

## Running DevMirror

After setup, use the generated mirror scripts:

```bash
# Instead of:
npm run dev

# Use:
npm run dev:mirror
```

Logs are written to `./devmirror-logs/` folder with timestamps.

## Configuration

### Basic Configuration (devmirror.config.json)

```json
{
  "outputDir": "./devmirror-logs",
  "mode": "cdp",
  "url": "http://localhost:3000"
}
```

### Adobe CEF Mode

```json
{
  "mode": "cef",
  "cefPort": 8860,
  "outputDir": "./devmirror-logs",
  "autoOpenBrowser": true
}
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| outputDir | string | Log output directory | "./devmirror-logs" |
| mode | "cdp" \| "cef" | Connection mode | "cdp" |
| url | string | Target URL (CDP mode) | Auto-detected |
| cefPort | number | CEF debug port | None (required for CEF) |
| chromePath | string | Path to Chrome executable | Auto-detected |
| autoDetectPort | boolean | Auto-detect running dev server | false |
| autoOpenBrowser | boolean | Open browser in CEF mode | false |
| captureDeprecationWarnings | boolean | Capture browser warnings | true |
| cliPath | string | Path to CLI (auto-managed) | Auto-updated |

## Log Output Format

```
[250924T14:30:52.12] [LOG] Application started
[250924T14:30:52.13] [ERROR] Failed to load resource
    at fetchData (app.js:45:12)
    at initialize (app.js:23:8)
[250924T14:30:52.14] [WARN] Using deprecated API
[250924T14:30:52.15] [INFO] User logged in successfully
[250924T14:30:52.16] [LIFECYCLE] ════════════ Page Navigated ════════════
[250924T14:30:52.17] [LIFECYCLE] ════════════ Page Loaded ════════════
```

Format: `[yymmddThh:mm:ss.ms] [TYPE] message`
- Timestamp: YYMMDDThhmmss.ms (2-digit milliseconds)
- Types: LOG, ERROR, WARN, INFO, DEBUG, LIFECYCLE, etc.

## VS Code Commands

| Command | Description |
|---------|-------------|
| `DevMirror: Setup Project` | Create initial configuration |
| `DevMirror: Start Capture` | Start capturing manually |
| `DevMirror: Stop Capture` | Stop active capture |
| `DevMirror: Show Logs` | Open logs directory |
| `DevMirror: Open Settings` | Open VS Code settings |

## Status Bar

- **Idle**: `DevMirror` (click to activate)
- **Active**: `DevMirror Active | projectName.root | 234 logs | 5m 32s`

Click status bar to open logs directory.

## DevMirror Scripts Panel

The Scripts panel in Explorer shows:
- Root package.json as `projectName.root`
- All npm scripts with mirror capability
- Quick add (+) button for instant setup
- Magic wand icon for Startup Wizard

Scripts are automatically updated with dynamic CLI paths that survive extension updates.

## File Structure

```
./devmirror-logs/
  ├── 2025-09-24-143052.log  # Timestamped log files
  └── current.log             # Symlink to active log

devmirror.config.json         # Project configuration
```

## Dynamic Path Resolution

DevMirror uses a stable shim pattern that ensures scripts continue working after extension updates:
- Creates `.vscode/devmirror/cli.js` (or `.cjs` for ESM packages) in your workspace
- Shim reads the current extension path from a config file
- Package.json scripts use relative paths to the shim
- Supports both single-repo and monorepo setups

## Requirements

- VS Code 1.104.0+
- Node.js 16+
- Chrome or Chromium browser

## Troubleshooting

### Scripts Break After Extension Update
The extension now auto-updates paths. If you have old scripts, remove and re-add them using the Scripts panel.

### Multiple Dev Servers
For projects with multiple servers (e.g., app + docs), explicitly set the `url` in devmirror.config.json to target the correct one.

### CEF Not Connecting
1. Enable debugging in your Adobe application
2. Check the `.debug` file for the port number
3. Set `cefPort` in devmirror.config.json

### No Logs Appearing
Ensure Chrome/Chromium is installed and the target URL is accessible.

## Support

Report issues: https://github.com/ivg-design/devMirror/issues

## License

MIT

---

© 2025 IVG Design