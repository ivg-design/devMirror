# DevMirror - Browser Console Capture Extension

**Capture browser console output using Chrome DevTools Protocol**

[![Version](https://img.shields.io/badge/version-0.4.65-blue.svg)](CHANGELOG.md)
[![Publisher](https://img.shields.io/badge/publisher-IVGDesign-green.svg)](https://marketplace.visualstudio.com/publishers/IVGDesign)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](LICENSE)

DevMirror is a VS Code extension that captures browser console output to timestamped log files using Chrome DevTools Protocol (CDP) via Puppeteer-core.

## Current Features (v0.4.65)

- **Console Capture** - Logs console.log, error, warn, info, debug messages with full stack traces
- **CDP & CEF Modes** - Support for regular browsers (port 9222) and Adobe CEF (port 8555)
- **DevMirror Scripts Panel** - Visual tree view in Explorer sidebar showing all package.json scripts
- **Quick Add (+)** - One-click to add mirror script with default settings
- **Setup Wizard (⚙️)** - Advanced configuration interface with dropdowns
- **Undo Changes (↩)** - Restore original package.json
- **Auto Port Detection** - Automatically finds running dev server port
- **Reconnect Throttling** - Max 10 attempts with 5-second delays (CEF mode)
- **Status Bar** - Shows active capture with log count and duration
- **Auto-fold Logs** - Automatically folds log entries in editor for better readability
- **Auto-refresh** - Updates open log files in real-time as new content arrives
- **Stack Traces** - Captures full JavaScript stack traces for errors and console messages
- **Network Errors** - Shows initiator stack traces for failed network requests
- **Auto Open Browser** - Optional auto-launch of CEF debug interface

## Installation

1. Install DevMirror from VS Code Marketplace
2. Open your project in VS Code
3. Puppeteer-core will be installed automatically when needed

## Quick Start

### Option 1: Visual Setup (Recommended)

1. Look for **DevMirror Scripts** panel in Explorer sidebar
2. Click **+** button next to any script for instant setup
3. Or click **⚙️** for Setup Wizard with advanced options
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

Logs are written to `./devmirror-logs/` folder.

## Configuration

### Basic Configuration (devmirror.config.json)

```json
{
  "outputDir": "./devmirror-logs",
  "mode": "cdp"
}
```

### CEF Mode (Adobe Extensions)

```json
{
  "mode": "cef",
  "cefPort": 8555,
  "outputDir": "./devmirror-logs",
  "autoOpenBrowser": true
}
```

### Available Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| outputDir | string | Log output directory | "./devmirror-logs" |
| mode | "cdp" \| "cef" | Connection mode | "cdp" |
| url | string | Target URL (CDP mode) | Auto-detected |
| cefPort | number | CEF debug port | None (required for CEF) |
| chromePath | string | Path to Chrome executable | Auto-detected |
| autoDetectPort | boolean | Auto-detect running dev server | false |
| autoOpenBrowser | boolean | Open browser in CEF mode | false |
| throttle | object | Message throttling settings | See below |

Throttle options:
- `maxPerSecond`: Maximum messages per second (default: 100)
- `suppressAfter`: Suppress after this many repeats (default: 100)

## Log Output Format

```
[250922T14:30:52.12] [LOG] Application started
[250922T14:30:52.13] [ERROR] Failed to load resource
[250922T14:30:52.14] [WARN] Deprecation warning
[250922T14:30:52.15] [INFO] User logged in
[250922T14:30:52.16] [NETWORK:ERROR] ERR_CONNECTION_REFUSED
    URL: http://api.example.com/users
[250922T14:30:52.17] [BROWSER:WARNING] Security warning
[250922T14:30:52.18] [LIFECYCLE] Page loaded
```

Format: `[yymmddThh:mm:ss.ms] [TYPE] message`
- Timestamp: YYMMDDThhmmss.ms (2-digit milliseconds)
- Types: LOG, ERROR, WARN, INFO, DEBUG, NETWORK:ERROR, BROWSER:level, LIFECYCLE

## VS Code Commands

| Command | Description |
|---------|-------------|
| `DevMirror: Setup Project` | Create initial configuration |
| `DevMirror: Start Capture` | Start capturing manually |
| `DevMirror: Stop Capture` | Stop active capture |
| `DevMirror: Show Logs` | Open logs directory |
| `DevMirror: Open Settings` | Open VS Code settings |
| `DevMirror: Refresh Scripts` | Refresh scripts tree |

## Status Bar

- **Idle**: `DevMirror` (hidden by default, shows on hover)
- **Active**: `🟢 DevMirror | package-name | 234 logs | 5m 32s`

Click to open logs directory.

## Setup Wizard Options

When using the gear icon (⚙️):

- **Execution Mode**: Run immediately or wait for port
- **Start Trigger**: When port opens or on user input
- **Target Mode**: CDP, CEF, or auto-detect
- **Integration Mode**: Replace logger or companion mode

## Script Modifications

DevMirror adds `:mirror` versions of your scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:mirror": "concurrently \"npx devmirror-cli\" \"npm run dev\""
  }
}
```

For interactive CLIs, it creates a background script:
```json
{
  "scripts": {
    "dev:mirror": "node scripts/devmirror-background.js & npm run dev"
  }
}
```

## File Structure

```
./devmirror-logs/
  ├── 2025-09-22-143052.log  # Timestamped log files
  ├── current.log             # Symlink to active log
  └── .devmirror.lock        # Lock file
```

## Requirements

- VS Code 1.104.0+
- Node.js 16+
- Chrome or Chromium browser
- puppeteer-core (auto-installed)

## Troubleshooting

### Port Not Found
Ensure your dev server is running or specify port manually in config.

### CEF Not Connecting
1. Enable debugging in Adobe application
2. Check `.debug` file for port number
3. Update `cefPort` in config

### No Logs Appearing
Check that Chrome/Chromium is installed and accessible.

## Documentation

- [Integration Guide](docs/INTEGRATION.md) - Working with existing tools
- [Setup Wizard Guide](docs/WIZARD-GUIDE.md) - Wizard options explained
- [Wiki](https://github.com/ivg-design/devMirror/wiki) - Complete documentation

## Support

Report issues: https://github.com/ivg-design/devMirror/issues

## License

MIT

---

© 2025 IVG Design