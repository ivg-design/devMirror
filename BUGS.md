# Critical Bugs in DevMirror v0.4.51

## 1. Missing Background Script Generation
**Severity:** HIGH
**Component:** wizardViewProvider.ts
**Issue:** The wizard generates scripts that reference `scripts/devmirror-background.js` but never creates this file.
**Impact:** Scripts fail with "file not found" error when using interactive CLI mode.
**Line:** src/wizardViewProvider.ts:219

## 2. Companion Script Not Exposed
**Severity:** MEDIUM
**Component:** package.json
**Issue:** `devmirror-companion.js` exists but is not registered as a bin command.
**Impact:** `npx devmirror-companion` doesn't work as documented.
**Fix Required:** Add to package.json bin section.

## 3. Non-Existent CLI Options Referenced
**Severity:** MEDIUM
**Component:** wizardViewProvider.ts
**Issue:** Generated scripts use `--wait` and `--companion` flags that don't exist in CLI.
**Impact:** Scripts fail with "unknown option" errors.
**Lines:** src/wizardViewProvider.ts:221-223

## 4. Environment Variables Not Implemented
**Severity:** LOW
**Component:** cli.ts
**Issue:** Main CLI doesn't read environment variables as documented.
**Impact:** Environment-based configuration doesn't work.
**Note:** Only the companion script supports env vars.

## To Fix Immediately:

1. Either remove interactive CLI mode from wizard OR implement background script generation
2. Remove references to `--wait` and `--companion` flags
3. Either expose devmirror-companion as bin command OR remove references
4. Update all documentation to reflect actual functionality

## Workaround for Users:

For interactive CLIs, manually create the background script or use the standard concurrent approach and deal with menu interference.