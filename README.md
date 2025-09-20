# DevMirror - Browser Console Capture Extension

**Capture 100% of browser console output using Chrome DevTools Protocol with Puppeteer**

[![Version](https://img.shields.io/badge/version-0.4.6-blue.svg)](CHANGELOG.md)
[![Publisher](https://img.shields.io/badge/publisher-IVGDesign-green.svg)](https://marketplace.visualstudio.com/publishers/IVGDesign)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](LICENSE.txt)

DevMirror is a production-ready VS Code extension that captures ALL browser console output, network errors, security warnings, and browser events to timestamped log files. Perfect for debugging web applications and Adobe CEP extensions.

## 🚀 Latest Release: v0.4.6

**Auto Port Detection**: DevMirror now automatically detects your running dev server! No need to manually configure ports - it scans common ports (3000, 5173, 8080) and checks your package.json scripts. Perfect for CEP/CEF debugging with dynamic ports. The URL is now optional in config. See [CHANGELOG.md](CHANGELOG.md) for complete version history.

## Features

- **100% Console Capture** - Uses Chrome DevTools Protocol for complete coverage
- **Zero Configuration** - Auto-detects your dev server settings
- **Live Monitoring** - Status bar shows log count and session duration
- **Auto-Folding Logs** - Opens logs with all entries collapsed for easier navigation
- **Message Deduplication** - Smart throttling prevents log flooding
- **Network Error Tracking** - Captures failed requests and HTTP errors
- **Security Monitoring** - Logs CSP violations and security warnings
- **Page Lifecycle Events** - Tracks page loads and navigations
- **Adobe CEP Support** - Debug After Effects and other Adobe extensions
- **Timestamped Logs** - Human-readable format with millisecond precision
- **Automatic File Rotation** - New log files at 50MB to prevent huge files

## Installation

1. Install the DevMirror extension from VS Code Marketplace
2. Open your web project in VS Code
3. Run the command: `DevMirror: Setup Project` (Cmd/Ctrl+Shift+P)
4. The extension will:
   - Create `devmirror.config.json`
   - Add mirror scripts to your `package.json`

## Usage

### Initial Setup (One-Time)

```bash
# In VS Code, run command palette (Cmd/Ctrl+Shift+P)
> DevMirror: Setup Project
```

This creates:
- `devmirror.config.json` - Configuration file
- Modified `package.json` - Adds `:mirror` scripts

### Monorepo Support

DevMirror now includes a **DevMirror Scripts** panel in the Explorer sidebar:

1. **View All package.json Files** - Automatically discovers all package.json files in your workspace
2. **One-Click Mirror Scripts** - Click the + button next to any dev/start script to add a :mirror version
3. **Auto-Detection** - Only shows scripts that don't already have mirror versions
4. **Dependency Check** - Automatically prompts to install `concurrently` if missing

To use:
- Look for "DevMirror Scripts" in your Explorer sidebar
- Expand any package.json to see available scripts
- Click the + button to add a mirror script
- Use the refresh button to update the list

### Daily Development

Instead of your normal dev command:
```bash
# Replace this:
npm run dev

# With this:
npm run dev:mirror
```

**What happens:**
1. Chromium browser launches with DevTools open
2. Your dev server starts normally
3. ALL console output is captured to `./devmirror-logs/`
4. VS Code shows capture status in status bar

### Log Output Format

```
[2025-01-20T14:30:22.123Z] [CONSOLE:LOG] Application started
[2025-01-20T14:30:22.456Z] [NETWORK:ERROR] Failed to load: ERR_CONNECTION_REFUSED
    URL: http://api.example.com/users
[2025-01-20T14:30:22.789Z] [ERROR] TypeError: Cannot read property 'name' of undefined
    at UserList.render (UserList.js:45:23)
    at performWork (react-dom.js:2345:12)
[2025-01-20T14:30:23.123Z] [BROWSER:WARNING] Security: Content Security Policy violation
[2025-01-20T14:30:25.000Z] [LIFECYCLE] ════════════ Page Reloaded ════════════
[2025-01-20T14:30:26.789Z] [SUPPRESSED] Message repeated 100+ times: "Polling update..."
```

## Configuration

### Minimal Config (Auto-Detected)
```json
{
    "outputDir": "./devmirror-logs"
}
```
DevMirror will auto-detect your dev server port!

### Auto Port Detection
```json
{
    "autoDetectPort": true,
    "outputDir": "./devmirror-logs"
}
```

### Manual URL Config
```json
{
    "url": "http://localhost:3000",
    "outputDir": "./devmirror-logs"
}
```

### Full Config Options
```json
{
    "url": "http://localhost:3000",
    "outputDir": "./devmirror-logs",
    "chromePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "mode": "cdp",
    "autoDetectPort": false,
    "throttle": {
        "maxPerSecond": 100,
        "suppressAfter": 100
    }
}
```

### Adobe CEP/CEF Debug Config
```json
{
    "mode": "cef",
    "cefPort": 8860,  // Your CEF debug port from .debug file
    "outputDir": "./devmirror-logs"
}
```

**CEF Mode Features:**
- Opens Chrome to CEF debug interface (`http://localhost:cefPort`)
- Captures ALL console output to log files
- Auto-reconnects when Adobe app/extension restarts
- Monitors CEF availability and refreshes automatically

## What Gets Captured

### Console Methods
- `console.log()`, `console.error()`, `console.warn()`, `console.info()`
- `console.debug()`, `console.trace()`, `console.assert()`
- `console.group()`, `console.table()`, `console.time()`

### Errors & Exceptions
- Uncaught exceptions
- Promise rejections
- Runtime errors
- Syntax errors

### Network Events
- Failed requests (404, 500, etc.)
- CORS errors
- Connection failures
- Timeout errors

### Browser Events
- CSP violations
- Mixed content warnings
- Security certificate issues
- Page crashes

### Lifecycle Events
- Page loads
- Page navigations
- Page reloads
- Frame navigations

## Commands

- `DevMirror: Setup Project` - Initial setup for your project (creates config, modifies package.json)
- `DevMirror: Start Capture` - Start capturing console output directly from VS Code
- `DevMirror: Stop Capture` - Stop the active capture session
- `DevMirror: Show Logs` - Open the current log file with auto-folding enabled

## Status Bar

Live monitoring display:
- 🔴 **DevMirror** - Click to run setup (when idle)
- 🔴 **DevMirror | 234 logs | 5m 32s** - Shows log count and duration during capture
- Click status bar to open log file with auto-folding

## File Management

- Logs written to: `./devmirror-logs/`
- Current log symlinked to: `./devmirror-logs/current.log`
- Auto-rotates at 50MB
- Timestamped filenames: `2025-01-20-143022.log`

## Requirements

- VS Code 1.104.0 or higher
- Node.js 16 or higher
- Chromium browser (automatically managed by Puppeteer)
- **puppeteer-core** npm package (auto-installed on first setup)

### Important: Puppeteer Requirement

DevMirror uses `puppeteer-core` to control Chromium browser via DevTools Protocol. The extension will:
1. Check if puppeteer-core is installed in your project
2. Prompt to install it automatically if missing
3. Add it to your project's dependencies

```bash
# Manual installation if needed:
npm install puppeteer-core
```

## Troubleshooting

### Chromium browser not found
Specify path to Chrome or Chromium in `devmirror.config.json`:
```json
{
    "chromePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
}
```

### Port conflicts
Change your dev server port in `devmirror.config.json`:
```json
{
    "url": "http://localhost:8080"
}
```

### Adobe CEP not connecting
1. Enable debugging in your Adobe app
2. Check `.debug` file for port number
3. Specify in config:
```json
{
    "mode": "cef",
    "cefPort": 8088
}
```

## Technical Architecture

- **HTTP IPC Communication** - Extension runs local server on port 37240 for CLI messaging
- **PID-Based Monitoring** - Direct process tracking ensures accurate status detection
- **No Status Files** - Clean architecture with no temporary files to manage
- **Direct Activation** - CLI sends path/PID data via HTTP POST for instant activation

## Performance

- **Minimal overhead** - Async log writing
- **Smart throttling** - Prevents infinite loops from flooding
- **Automatic deduplication** - Repeated messages consolidated
- **File rotation** - Prevents huge log files
- **Zero file polling** - HTTP-based activation eliminates constant file I/O

## Privacy & Security

- All logs stored locally
- No data sent to external servers
- No analytics or telemetry
- Open source codebase

## License

MIT

## Repository

- **GitHub**: https://github.com/ivg-design/devMirror
- **Issues**: https://github.com/ivg-design/devMirror/issues
- **License**: MIT

## Support

Report issues at: https://github.com/ivg-design/devMirror/issues

---

**Made with ❤️ for developers who need to see EVERYTHING**

© 2025 IVG Design