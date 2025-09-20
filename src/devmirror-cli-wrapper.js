#!/usr/bin/env node

/**
 * DevMirror CLI Wrapper
 * Dynamically finds and runs the correct version of DevMirror extension
 * This wrapper is installed in the project and will always find the latest version
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Find VS Code extensions directory
function getExtensionsDir() {
    const homeDir = os.homedir();
    const possiblePaths = [
        path.join(homeDir, '.vscode', 'extensions'),
        path.join(homeDir, '.vscode-insiders', 'extensions'),
        path.join(homeDir, '.vscode-server', 'extensions'),
        path.join(homeDir, '.vscode-oss', 'extensions'),
        path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'extensions'),
    ];

    for (const dir of possiblePaths) {
        if (fs.existsSync(dir)) {
            return dir;
        }
    }
    return null;
}

// Find the latest DevMirror extension
function findLatestDevMirror() {
    const extensionsDir = getExtensionsDir();
    if (!extensionsDir) {
        console.error('❌ Could not find VS Code extensions directory');
        process.exit(1);
    }

    try {
        const extensions = fs.readdirSync(extensionsDir);
        const devMirrorExtensions = extensions
            .filter(dir => dir.toLowerCase().startsWith('ivgdesign.devmirror-'))
            .sort((a, b) => {
                // Extract version numbers and compare
                const versionA = a.split('-').pop();
                const versionB = b.split('-').pop();
                return versionB.localeCompare(versionA, undefined, { numeric: true });
            });

        if (devMirrorExtensions.length === 0) {
            console.error('❌ DevMirror extension not found. Please install it from VS Code marketplace.');
            console.error('   Run: code --install-extension IVGDesign.devmirror');
            process.exit(1);
        }

        const latestVersion = devMirrorExtensions[0];
        console.log(`🔍 Using DevMirror ${latestVersion.split('-').pop()}`);
        return path.join(extensionsDir, latestVersion);
    } catch (error) {
        console.error('❌ Error finding DevMirror extension:', error.message);
        process.exit(1);
    }
}

// Main execution
function main() {
    const extensionPath = findLatestDevMirror();
    const cliPath = path.join(extensionPath, 'out', 'cli.js');

    if (!fs.existsSync(cliPath)) {
        console.error(`❌ CLI not found at: ${cliPath}`);
        console.error('   The extension may be corrupted. Try reinstalling.');
        process.exit(1);
    }

    // Pass through all arguments to the actual CLI
    const child = spawn('node', [cliPath, ...process.argv.slice(2)], {
        stdio: 'inherit',
        cwd: process.cwd()
    });

    child.on('exit', (code) => {
        process.exit(code || 0);
    });

    // Handle signals
    process.on('SIGINT', () => {
        child.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
        child.kill('SIGTERM');
    });
}

main();