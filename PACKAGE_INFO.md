# DevMirror NPM Package Information

This file is automatically updated with the latest NPM package information.

**Latest Version:** 0.4.66
**Package URL:** https://www.npmjs.com/package/devmirror
**Downloads:** ![NPM Downloads](https://img.shields.io/npm/dm/devmirror)

## Installation

### Global Installation
```bash
npm install -g devmirror
devmirror
```

### Project Installation
```bash
npm install --save-dev devmirror
npx devmirror
```

### Usage with Package Managers
```bash
# NPX (no installation required)
npx devmirror

# Yarn
yarn add --dev devmirror
yarn devmirror

# PNPM
pnpm add --save-dev devmirror
pnpm devmirror
```

## Configuration
Create a `devmirror.config.json` in your project root:

```json
{
  "mode": "cdp",
  "outputDir": "./devmirror-logs",
  "url": "http://localhost:3000",
  "captureDeprecationWarnings": true
}
```

---
*Last updated: Wed Sep 24 10:55:38 UTC 2025*
