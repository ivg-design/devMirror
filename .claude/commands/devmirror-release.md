# DevMirror Release Process

Complete release process for DevMirror VS Code extension.

## Checklist

### 1. Update Version
- [ ] Update version in `package.json`

### 2. Document Changes
- [ ] Update `CHANGELOG.md` with new version section including:
  - ### Fixed
  - ### Changed
  - ### Added
- [ ] Update `README.md`:
  - Version badge: `[![Version](https://img.shields.io/badge/version-X.X.XX-blue.svg)](CHANGELOG.md)`
  - Current Features section: `## Current Features (vX.X.XX)`
  - Add any new features to feature list

### 3. Update Wiki
- [ ] Update `wiki/_Sidebar.md` - change version at bottom
- [ ] Update `wiki/_Footer.md` - change version number
- [ ] Update `wiki/Home.md`:
  - Latest Version section with release date
  - List main changes/fixes
  - Update feature list if needed

### 4. Build & Test
```bash
# Compile TypeScript
npm run compile

# Build VSIX package with dependencies
npx vsce package

# Install locally
code --install-extension devmirror-X.X.XX.vsix --force
```

### 5. Commit & Push with Release Flag
```bash
# Stage all changes
git add -A

# Commit with :release flag to trigger GitHub Actions
git commit -m "vX.X.XX: Brief description :release

- Main change/fix 1
- Main change/fix 2
- Main change/fix 3

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to main
git push origin main
```

### 6. Verify Automation
- Check GitHub Actions tab for release workflow
- Verify release created at https://github.com/ivg-design/devMirror/releases
- Confirm VSIX file attached to release

## Important Notes

1. **Version Numbering**:
   - Patch: 0.4.XX for bug fixes
   - Minor: 0.X.0 for new features
   - Major: X.0.0 for breaking changes

2. **Changelog File**: Must be named `CHANGELOG.md` (uppercase)

3. **Release Flag**: Commit message MUST contain `:release` to trigger automation

4. **Wiki Updates**: Don't forget wiki has separate git repo - changes need separate commit

5. **Testing**: Always test locally before pushing

## Common Issues

- **Release workflow fails**: Check `CHANGELOG.md` exists (uppercase)
- **Tag already exists**: Delete with `git push origin --delete vX.X.XX`
- **Wiki not updating**: Remember wiki is separate repo, needs manual push