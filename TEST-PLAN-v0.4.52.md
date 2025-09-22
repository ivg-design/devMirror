# DevMirror v0.4.52 Comprehensive Test Plan

## Test Environments

### 1. **exlib** - Adobe CEF Extension with CLI Pre-flight
- **Type**: Adobe CEF Extension
- **Mode**: CEF mode with pre-flight CLI
- **Port**: 8555
- **Features to test**: CEF mode, --wait flag, background script

### 2. **rivePreview** - Regular Web Application
- **Type**: Standard web app
- **Mode**: CDP mode
- **Port**: Auto-detect or 9222
- **Features to test**: Standard CDP capture, auto-port detection

### 3. **JSX** - Monorepo with CEF
- **Type**: Monorepo with Adobe CEF components
- **Mode**: CEF mode
- **Port**: 8555
- **Features to test**: Monorepo support, companion mode

## Feature Test Checklist

### ✅ Core Installation & Setup

#### Test 1: Extension Installation
```bash
# Verify extension installed
code --list-extensions | grep devmirror
# Should show: IVGDesign.devmirror@0.4.52
```

#### Test 2: DevMirror Scripts Panel
- [ ] Open VS Code Explorer
- [ ] Verify "DevMirror Scripts" panel appears
- [ ] Verify all package.json scripts are listed
- [ ] Check icons display correctly (⚙️ and +)

### ✅ Setup Wizard Features

#### Test 3: Quick Add (+) Button
**Project**: rivePreview
```bash
1. Click + button next to "dev" script
2. Verify creates "dev:mirror" script
3. Check devmirror.config.json created with:
   - mode: "cdp"
   - outputDir: "./devmirror-logs"
```

#### Test 4: Setup Wizard (⚙️) Button
**Project**: exlib
```bash
1. Click ⚙️ next to script
2. Verify wizard opens with:
   - Script dropdown (shows all scripts)
   - Mode dropdown (CDP/CEF)
   - Port input (for CEF)
   - Auto-open browser checkbox
3. Select CEF mode, port 8555
4. Enable auto-open browser
5. Submit and verify config created
```

#### Test 5: Undo Feature (↩)
**Project**: Any with modified script
```bash
1. Modify a script with mirror
2. Click ↩ icon (should appear for modified scripts)
3. Verify restores original package.json
```

### ✅ CLI Features

#### Test 6: Basic CDP Mode
**Project**: rivePreview
```bash
npm run dev:mirror
# Verify:
- Shows version banner "DevMirror CLI v0.4.52"
- Creates devmirror-logs folder
- Captures console output to timestamped files
- Shows "Press Ctrl+C to stop"
```

#### Test 7: CEF Mode with Auto-open
**Project**: exlib
```json
// devmirror.config.json
{
  "mode": "cef",
  "cefPort": 8555,
  "autoOpenBrowser": true,
  "outputDir": "./devmirror-logs"
}
```
```bash
npm run dev:mirror
# Verify:
- Detects CEF mode
- Opens browser automatically
- Connects to port 8555
- Captures Adobe extension console
```

#### Test 8: Wait Mode (--wait flag)
**Project**: exlib
```bash
# First, create background script via wizard
# Then run:
npm run dev:mirror
# Verify:
- Background script waits for port
- Main process starts after port available
- Console shows "⏳ Wait mode: Waiting..."
- Shows "✅ Port detected! Starting capture..."
```

#### Test 9: Companion Mode
**Project**: JSX monorepo
```bash
npx devmirror-companion
# Or via script with --companion flag
npm run dev:mirror
# Verify:
- Runs in companion mode
- Shows "🤝 Running in companion mode..."
- Non-invasive parallel logging
```

### ✅ Version Management

#### Test 10: Dynamic Version Display
```bash
# Run any mirror script
npm run dev:mirror
# Verify banner shows current version from package.json
```

#### Test 11: Wrapper Script
```bash
# In any project with devmirror-cli installed
npx devmirror-cli
# Verify:
- Shows "🔍 Using DevMirror 0.4.52"
- Finds correct extension version
- Launches CLI from extension
```

### ✅ Reconnection & Stability

#### Test 12: Reconnect Throttling (CEF)
**Project**: exlib
```bash
1. Start capture with CEF mode
2. Close Adobe Extension
3. Verify:
   - Max 10 reconnect attempts
   - 5-second delay between attempts
   - No aggressive reconnect loop
```

#### Test 13: VS Code Integration
```bash
# While capture is running
# Verify in VS Code:
- Status bar shows capture status
- Log count updates
- Duration timer works
- Click status bar opens logs
```

### ✅ Auto-detection Features

#### Test 14: Port Auto-detection
**Project**: rivePreview
```json
{
  "autoDetectPort": true,
  "mode": "cdp"
}
```
```bash
npm run dev:mirror
# Verify:
- Automatically finds running dev server port
- Connects without manual URL
```

### ✅ Log Management

#### Test 15: Log Output
```bash
# After capturing, verify logs contain:
- Timestamp for each message
- Message type (log, error, warn, info, debug)
- Actual console content
- Proper formatting
```

#### Test 16: Auto-refresh
```bash
# Open log file in VS Code while capturing
# Verify:
- File auto-refreshes with new content
- No need to manually reload
```

## Test Execution Order

### Phase 1: Basic Setup (rivePreview)
1. Install extension
2. Test DevMirror Scripts panel
3. Quick add CDP mirror script
4. Run basic capture
5. Verify logs

### Phase 2: CEF Mode (exlib)
1. Setup wizard with CEF configuration
2. Test auto-open browser
3. Test --wait mode with background script
4. Test reconnect throttling
5. Verify Adobe console capture

### Phase 3: Advanced Features (JSX)
1. Test companion mode
2. Test monorepo support
3. Test wrapper script functionality
4. Test undo feature

## Success Criteria

- [ ] All test cases pass without errors
- [ ] No TypeScript compilation errors
- [ ] Wrapper script works in all projects
- [ ] CEF mode properly throttles reconnects
- [ ] Background scripts generate correctly
- [ ] Companion mode runs independently
- [ ] Version displays correctly everywhere
- [ ] Documentation matches actual behavior

## Known Test Points

### Critical Functions to Verify:
1. **cdpManager.ts:reconnect()** - No aggressive loops
2. **wizardViewProvider.ts:createBackgroundScript()** - Generates valid ES module
3. **cli.ts:main()** - Shows correct version, handles flags
4. **devmirror-cli-wrapper.js** - Finds correct extension
5. **devmirror-companion.js** - Runs in parallel mode

## Reporting Issues

If any test fails:
1. Note the project and test number
2. Capture error messages
3. Check devmirror-logs for details
4. Report at: https://github.com/ivg-design/devMirror/issues

---

**Test Plan Version**: v0.4.52
**Last Updated**: September 22, 2025
**Extension Version**: 0.4.52