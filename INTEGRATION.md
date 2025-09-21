# DevMirror Universal Integration Guide

DevMirror can be integrated into ANY project without breaking existing logger setups. This guide shows how to add DevMirror as a companion tool that works alongside your current development workflow.

## 🎯 Core Principles

1. **Non-Invasive**: DevMirror runs parallel to existing loggers
2. **Zero Breaking Changes**: Your current setup continues to work
3. **Optional**: Can be enabled/disabled via environment variables
4. **Universal**: Works with any framework or build tool

## 🚀 Quick Start

### Method 1: Zero Configuration (Recommended)

Simply run DevMirror alongside your existing dev server:

```bash
# In one terminal:
yarn dev  # Your existing dev command

# In another terminal:
npx devmirror-cli
```

DevMirror will auto-detect your environment and start capturing.

### Method 2: Integrated Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "your-existing-dev-command",
    "dev:mirror": "concurrently \"yarn dev\" \"npx devmirror-cli\"",
    "dev:mirror:only": "PRESERVE_LOGGER=false npx devmirror-cli"
  }
}
```

## 📦 Integration Patterns

### Pattern 1: Side-by-Side (Preserve Everything)

Your existing logger and DevMirror run together:

```javascript
// devmirror-integrate.js
import { spawn } from 'child_process';

// Start your existing dev process
const devProcess = spawn('yarn', ['dev'], { stdio: 'inherit' });

// Start DevMirror in parallel
const mirrorProcess = spawn('npx', ['devmirror-cli'], {
  env: { ...process.env, DEVMIRROR_SILENT: 'true' }
});
```

### Pattern 2: Conditional Integration

Enable DevMirror based on environment:

```javascript
const DEVMIRROR_ENABLED = process.env.DEVMIRROR !== 'false';

if (DEVMIRROR_ENABLED) {
  spawn('npx', ['devmirror-cli'], { detached: true });
}
```

### Pattern 3: Project-Specific Config

Create `devmirror.config.json` in your project root:

```json
{
  "mode": "cef",        // or "cdp" for regular Chrome
  "cefPort": 8555,      // CEF debug port
  "outputDir": "./devmirror-logs",
  "companion": true,    // Run alongside other loggers
  "silent": false       // Quiet mode
}
```

## 🎨 Real-World Examples

### Adobe CEP/CEF Extension

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "dev:cef": "yarn log:cef",
    "dev:mirror": "concurrently \"yarn dev\" \"yarn dev:cef\" \"npx devmirror-cli\""
  }
}

// devmirror.config.json
{
  "mode": "cef",
  "cefPort": 8555
}
```

### React/Vite Application

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "dev:mirror": "concurrently \"yarn dev\" \"npx devmirror-cli\""
  }
}

// devmirror.config.json
{
  "mode": "cdp",
  "url": "http://localhost:5173"
}
```

### Next.js Application

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "dev:mirror": "concurrently \"yarn dev\" \"npx devmirror-cli\""
  }
}

// devmirror.config.json
{
  "mode": "cdp",
  "url": "http://localhost:3000"
}
```

## 🔧 Environment Variables

Control DevMirror behavior without changing code:

```bash
DEVMIRROR_ENABLE=true      # Enable/disable DevMirror
DEVMIRROR_MODE=cef         # Set mode (cef or cdp)
DEVMIRROR_CEF_PORT=8555    # CEF debug port
DEVMIRROR_URL=http://...   # Dev server URL
DEVMIRROR_OUTPUT=./logs    # Output directory
DEVMIRROR_SILENT=true      # Quiet mode
PRESERVE_LOGGER=true       # Keep existing loggers
```

## 🔄 Migration Path

### Step 1: Test Alongside
Run DevMirror parallel to your existing setup:
```bash
yarn dev & npx devmirror-cli
```

### Step 2: Add Convenience Script
```json
"dev:mirror": "concurrently \"yarn dev\" \"npx devmirror-cli\""
```

### Step 3: Make it Default (Optional)
```json
"dev:old": "your-original-dev-command",
"dev": "yarn dev:mirror"
```

## 🤝 Working with Other Loggers

DevMirror is designed to work alongside:
- Custom console loggers
- Chrome Remote Interface implementations
- File-based loggers
- Terminal output loggers

### Example: CEF Logger + DevMirror

```javascript
// Both can run simultaneously
spawn('node', ['cef-console-logger.js']);  // Your existing logger
spawn('npx', ['devmirror-cli']);           // DevMirror companion
```

Both loggers will capture to their respective outputs without interference.

## 🛡️ Zero Risk Integration

DevMirror guarantees:
- ✅ No modifications to your existing code
- ✅ No changes to your build process
- ✅ No dependency conflicts
- ✅ Can be removed instantly
- ✅ Existing workflows continue unchanged

## 📊 Comparison with Existing Logger

| Feature | Your Logger | DevMirror | Both Together |
|---------|------------|-----------|---------------|
| Console Capture | ✅ | ✅ | ✅✅ |
| Custom Format | ✅ | ✅ | ✅✅ |
| File Output | ✅ | ✅ | ✅✅ |
| VS Code Integration | ❌ | ✅ | ✅ |
| Auto-Refresh | ❌ | ✅ | ✅ |
| Log Folding | ❌ | ✅ | ✅ |

## 🚦 Decision Matrix

Use DevMirror when you want:
- VS Code integration with status bar
- Auto-refresh and log folding
- Capture from multiple sources
- Browserless console capture

Keep your existing logger when you need:
- Specific custom formatting
- Specialized filtering logic
- Team-specific requirements
- Legacy compatibility

Use both when you want:
- Maximum coverage
- Redundant logging
- A/B comparison
- Migration testing

## 💡 Best Practices

1. **Start with companion mode** - Run alongside existing loggers
2. **Use environment variables** - Easy toggling without code changes
3. **Keep both initially** - Ensure nothing breaks
4. **Gradual migration** - Move when comfortable
5. **Document your choice** - Help your team understand the setup

## 🔗 Integration Support

- GitHub Issues: [Report problems](https://github.com/ivg-design/devMirror/issues)
- Documentation: [Full docs](https://github.com/ivg-design/devMirror)
- Examples: Check the `/examples` folder for more integration patterns