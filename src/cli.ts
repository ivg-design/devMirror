#!/usr/bin/env node

import { CDPManager } from './cdpManager';
import { ConfigHandler, DevMirrorConfig } from './configHandler';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';

async function waitForPort(port: number, maxAttempts = 60): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        const isOpen = await checkPort(port);
        if (isOpen) return true;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}

async function checkPort(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = net.createConnection(port, 'localhost');
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.setTimeout(100, () => {
            socket.destroy();
            resolve(false);
        });
    });
}

async function main() {
    // Read version from package.json
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    const version = packageJson.version;
    const versionText = `🟢 DevMirror CLI v${version}`;
    const padding = Math.floor((40 - versionText.length) / 2);
    const paddedText = ' '.repeat(padding) + versionText + ' '.repeat(40 - padding - versionText.length);

    console.log('╔════════════════════════════════════════╗');
    console.log(`║${paddedText}║`);
    console.log('╚════════════════════════════════════════╝\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const waitMode = args.includes('--wait');
    const companionMode = args.includes('--companion');

    // Parse VS Code settings overrides
    const settingsOverrides = {
        captureDeprecationWarnings: !args.includes('--no-deprecation-warnings')
    };

    // If companion mode, delegate to companion script
    if (companionMode) {
        console.log('🤝 Running in companion mode...');
        const { spawn } = require('child_process');
        const companion = spawn('node', [path.join(__dirname, 'devmirror-companion.js')], {
            stdio: 'inherit',
            env: process.env
        });
        companion.on('exit', (code: number | null) => process.exit(code || 0));
        return;
    }

    let configPath = path.join(process.cwd(), 'devmirror.config.json');

    const configArg = process.argv.find(arg => arg.startsWith('--config='));
    if (configArg) {
        configPath = path.resolve(configArg.split('=')[1]);
    }

    if (!fs.existsSync(configPath)) {
        console.error('❌ Configuration file not found:', configPath);
        console.error('   Run "DevMirror: Setup" command in VS Code first');
        process.exit(1);
    }

    let config: DevMirrorConfig;
    try {
        config = await ConfigHandler.load(configPath);
        console.log('✅ Loaded configuration from:', configPath);

        // Apply VS Code settings overrides
        config = {
            ...config,
            ...settingsOverrides
        };

        console.log('✅ Applied VS Code settings overrides');
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        process.exit(1);
    }

    // Auto-detect CEF mode if cefPort is provided but mode is not set
    if (!config.mode && config.cefPort) {
        config.mode = 'cef';
    } else if (!config.mode) {
        config.mode = 'cdp';
    }

    // Handle wait mode
    if (waitMode) {
        console.log('⏳ Wait mode: Waiting for debug port to be available...');
        const port = config.cefPort || 9222;
        await waitForPort(port);
        console.log('✅ Port detected! Starting capture...');
    }

    // Use CDPManager for both modes - it handles CEF mode internally
    const manager = new CDPManager();

    // Handle process termination gracefully
    const handleShutdown = async (signal: string) => {
        console.log(`\n📍 Received ${signal}, shutting down gracefully...`);
        await manager.stop();
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGHUP', () => handleShutdown('SIGHUP'));

    if (config.mode === 'cef') {
        console.log('🎨 Running in Adobe CEF mode');
    } else {
        console.log('🌐 Running in Chrome CDP mode');
    }

    // Get the package path from environment variable
    const packagePath = process.env.DEVMIRROR_PKG_PATH || process.cwd();

    // Create output dir if needed
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // Send activation message to VS Code extension via HTTP and file-based IPC
    const activateVSCode = () => {
        const activationData = {
            path: packagePath,
            pid: process.pid,
            url: config.url,
            logDir: path.resolve(config.outputDir),
            timestamp: Date.now()
        };

        // Send activation via HTTP to VS Code extension
        const data = JSON.stringify(activationData);
        const options = {
            hostname: '127.0.0.1',
            port: 37240,
            path: '/activate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 200) {
                console.log('✅ VS Code extension activated (HTTP)');
            }
        });

        req.on('error', (error) => {
            // Silent fail for HTTP - we have the file-based IPC as backup
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(data);
        req.end();
    };

    activateVSCode();

    try {
        await manager.start(config);
    } catch (error) {
        console.error('❌ Failed to start DevMirror:', error);
        process.exit(1);
    }

    process.on('SIGINT', async () => {
        console.log('\n\n🛑 Shutting down DevMirror...');
        await manager.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await manager.stop();
        process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
        console.error('❌ Uncaught exception:', error);
        await manager.stop();
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
        console.error('❌ Unhandled rejection:', reason);
        await manager.stop();
        process.exit(1);
    });

    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Press Ctrl+C to stop capturing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});