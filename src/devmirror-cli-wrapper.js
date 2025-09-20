#!/usr/bin/env node

// This is a wrapper script that will be copied to the project
const path = require('path');
const { spawn } = require('child_process');

// Find the VS Code extension directory
const extensionPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.vscode',
    'extensions'
);

const fs = require('fs');
const extensions = fs.readdirSync(extensionPath);
const devMirrorExt = extensions.find(ext => ext.startsWith('devmirror-'));

if (!devMirrorExt) {
    console.error('DevMirror extension not found. Please install the DevMirror VS Code extension.');
    process.exit(1);
}

const cliPath = path.join(extensionPath, devMirrorExt, 'out', 'cli.js');

// Run the actual CLI
const child = spawn('node', [cliPath], {
    stdio: 'inherit',
    cwd: process.cwd()
});

child.on('exit', (code) => {
    process.exit(code);
});