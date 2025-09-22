# DevMirror Setup Wizard Guide

This guide explains every option in the DevMirror Setup Wizard and provides configuration templates for common development scenarios.

## Table of Contents
- [Wizard Options Explained](#wizard-options-explained)
- [Common Setup Configurations](#common-setup-configurations)
- [Troubleshooting](#troubleshooting)

---

## Wizard Options Explained

### Execution Mode
Determines when DevMirror starts capturing logs.

| Option | Description | Use When |
|--------|-------------|----------|
| **Run immediately** | DevMirror starts as soon as the script runs | Standard web apps, build tools |
| **Wait for process/port** | DevMirror waits for a specific condition before starting | Interactive CLIs, delayed starts |
| **Smart detection** | DevMirror analyzes your setup and decides automatically | Not sure which to choose |

### Start Trigger
Specifies what condition triggers DevMirror to begin capturing.

| Option | Description | Use When |
|--------|-------------|----------|
| **Immediately** | Starts capturing right away | Simple scripts, build processes |
| **When port opens** | Waits for a specific port (like 8555) to become available | CEF/Chrome extensions, dev servers |
| **When process starts** | Waits for a specific process to launch | Electron apps, specific tools |
| **After user interaction** | Waits for user to interact with a menu/prompt | Interactive CLIs, setup wizards |

### Target Mode
Defines what type of application DevMirror will connect to.

| Option | Description | Port | Use When |
|--------|-------------|------|----------|
| **Auto-detect** | DevMirror figures out the target automatically | Auto | Not sure about your setup |
| **CEF/Chrome Extension** | Chrome Embedded Framework or Extensions | 8555 | Adobe CEP panels, Chrome extensions |
| **Standard Browser (CDP)** | Chrome DevTools Protocol | 9222 | React, Vue, Angular apps |
| **Node.js Application** | Node.js debugging protocol | 9229 | Backend servers, Node scripts |

### Watch Port
The port number DevMirror monitors (only visible when Target Mode is CEF or CDP).

| Common Ports | Used For |
|--------------|----------|
| **8555** | Adobe CEP panels (default) |
| **9222** | Chrome DevTools Protocol (default) |
| **9229** | Node.js debugging (default) |
| **3000** | React dev server |
| **8080** | Vue/Webpack dev server |
| **4200** | Angular dev server |

### Integration Strategy
How DevMirror integrates with existing logging tools.

| Option | Description | Use When |
|--------|-------------|----------|
| **Replace existing logger** | DevMirror becomes the primary logger | No existing logging setup |
| **Companion mode (preserve existing)** | Runs alongside existing loggers | Already have CEF logger or similar |
| **User choice at runtime** | Prompts user each time | Multiple team members with different preferences |

### Advanced Options

#### Wait for user interaction
- **Checked**: DevMirror waits for user to interact with menus/prompts before starting
- **Unchecked**: DevMirror starts based on other triggers
- **Use when**: Interactive CLIs, menu-driven tools

#### Monitor for restart
- **Checked**: DevMirror reconnects automatically if the target restarts
- **Unchecked**: DevMirror stops when target stops
- **Use when**: Hot-reloading dev servers, watch modes

#### Capture pre-launch output
- **Checked**: Captures console output before the main process starts
- **Unchecked**: Only captures after connection established
- **Use when**: Build processes, initialization logs

#### Timeout (seconds)
- **Default**: 60 seconds
- **Range**: 10-600 seconds
- **Purpose**: How long DevMirror waits for the target before giving up
- **Increase for**: Slow-starting applications, complex builds
- **Decrease for**: Quick scripts, fast feedback loops

---

## Common Setup Configurations

### 1. Adobe CEP Panel with Interactive CLI
Perfect for Adobe extension development with menu-driven tools.

```
Execution Mode: Wait for process/port
Start Trigger: After user interaction
Target Mode: CEF/Chrome Extension
Watch Port: 8555
Integration Strategy: Companion mode
✓ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 60
```

**Generated script**: `node scripts/devmirror-background.js & npm run dev`

### 2. React Development Server
Standard React app with hot-reloading.

```
Execution Mode: Run immediately
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 3000
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 30
```

**Generated script**: `concurrently "npx devmirror-cli" "npm start"`

### 3. Vue.js with Vite
Vue 3 application using Vite dev server.

```
Execution Mode: Run immediately
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 5173
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
☐ Capture pre-launch output
Timeout: 30
```

**Generated script**: `concurrently "npx devmirror-cli" "npm run dev"`

### 4. Node.js Express Server
Backend API with nodemon watching.

```
Execution Mode: Run immediately
Start Trigger: When process starts
Target Mode: Node.js Application
Watch Port: 9229
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 45
```

**Generated script**: `concurrently "npx devmirror-cli --node" "npm run dev"`

### 5. Electron Application
Desktop app with both main and renderer processes.

```
Execution Mode: Smart detection
Start Trigger: When process starts
Target Mode: Standard Browser (CDP)
Watch Port: 9222
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 60
```

**Generated script**: `concurrently "npx devmirror-cli" "npm run electron:dev"`

### 6. Next.js Full-Stack App
Next.js with API routes and SSR.

```
Execution Mode: Run immediately
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 3000
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 45
```

**Generated script**: `concurrently "npx devmirror-cli" "npm run dev"`

### 7. Angular with Multiple Builds
Angular app with multiple build configurations.

```
Execution Mode: Wait for process/port
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 4200
Integration Strategy: User choice at runtime
☐ Wait for user interaction
✓ Monitor for restart
✓ Capture pre-launch output
Timeout: 90
```

**Generated script**: `npm run build && npx devmirror-cli --wait`

### 8. Webpack Dev Server
Custom Webpack configuration.

```
Execution Mode: Run immediately
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 8080
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
☐ Capture pre-launch output
Timeout: 45
```

**Generated script**: `concurrently "npx devmirror-cli" "webpack serve"`

### 9. Test Runner with Browser
Jest/Vitest with browser testing.

```
Execution Mode: Smart detection
Start Trigger: When process starts
Target Mode: Standard Browser (CDP)
Watch Port: 9222
Integration Strategy: Replace existing logger
☐ Wait for user interaction
☐ Monitor for restart
✓ Capture pre-launch output
Timeout: 120
```

**Generated script**: `npx devmirror-cli --companion & npm test`

### 10. Storybook Development
Component development with Storybook.

```
Execution Mode: Run immediately
Start Trigger: When port opens
Target Mode: Standard Browser (CDP)
Watch Port: 6006
Integration Strategy: Replace existing logger
☐ Wait for user interaction
✓ Monitor for restart
☐ Capture pre-launch output
Timeout: 60
```

**Generated script**: `concurrently "npx devmirror-cli" "npm run storybook"`

---

## Troubleshooting

### Common Issues and Solutions

#### "Cannot read properties of undefined"
- **Cause**: Script command is missing or undefined
- **Solution**: Ensure your package.json script exists and has a valid command

#### Wizard panel won't close
- **Cause**: VS Code WebviewView limitation
- **Solution**: Panel should auto-hide in v0.4.50+. If not, right-click and uncheck "Setup Wizard"

#### DevMirror not capturing logs
- **Check**:
  1. Port number matches your application
  2. Target mode is correct for your app type
  3. Application is actually outputting to console
  4. Check `devmirror-logs/` directory for files

#### Interactive CLI menu interference
- **Cause**: DevMirror output mixing with menu
- **Solution**: Use "Companion mode" with background script

#### Port already in use
- **Cause**: Another process using the debug port
- **Solution**:
  1. Change port in your app configuration
  2. Update port in wizard
  3. Or kill the process using the port

### Configuration Files

After running the wizard, these files are created/modified:

1. **package.json** - Adds `:mirror` script
2. **devmirror.config.json** - DevMirror configuration
3. **scripts/devmirror-background.js** - Background runner (if needed)

### Manual Configuration

If the wizard doesn't cover your needs, manually create `devmirror.config.json`:

```json
{
  "mode": "cdp|cef|node|auto",
  "outputDir": "./devmirror-logs",
  "port": 9222,
  "host": "localhost",
  "waitMode": true,
  "companion": true,
  "preserveLogger": true,
  "autoDetectPort": true,
  "reconnect": true,
  "capturePreLaunch": true,
  "timeout": 60000
}
```

### Getting Help

- **Documentation**: [DevMirror README](README.md)
- **Issues**: [GitHub Issues](https://github.com/your-repo/devmirror/issues)
- **VS Code Settings**: Run command "DevMirror: Open Settings"

---

## Quick Reference Card

| Your Setup | Recommended Configuration |
|------------|--------------------------|
| Adobe CEP Panel | Wait mode + CEF + Port 8555 + Companion |
| React/Vue/Angular | Immediate + CDP + Dev server port + Replace |
| Node.js Backend | Immediate + Node + Port 9229 + Replace |
| Electron App | Smart + CDP + Port 9222 + Replace |
| Interactive CLI | Wait + User interaction + Companion |
| Test Suite | Smart + CDP + Auto port + Replace |
| Multiple Projects | User choice + Auto-detect + Monitor restart |

---

*Last updated for DevMirror v0.4.50*