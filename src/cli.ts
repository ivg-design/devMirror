#!/usr/bin/env node

import { CDPManager } from './cdpManager';
import { CEFBridge } from './cefBridge';
import { ConfigHandler, DevMirrorConfig } from './configHandler';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║         🔴 DevMirror CLI v0.0.1        ║');
    console.log('╚════════════════════════════════════════╝\n');

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
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        process.exit(1);
    }

    let manager: CDPManager | CEFBridge;

    if (config.mode === 'cef') {
        console.log('🎨 Running in Adobe CEF mode');
        manager = new CEFBridge();
    } else {
        console.log('🌐 Running in Chrome CDP mode');
        manager = new CDPManager();
    }

    // Write a status file so VS Code extension can detect we're running
    const statusFile = path.join(config.outputDir, '.devmirror-status.json');
    const writeStatus = () => {
        try {
            fs.writeFileSync(statusFile, JSON.stringify({
                pid: process.pid,
                startTime: Date.now(),
                url: config.url
            }));
        } catch {}
    };

    // Create output dir if needed
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
    }

    writeStatus();

    // Update status file periodically
    const statusInterval = setInterval(writeStatus, 1000);

    try {
        await manager.start(config);
    } catch (error) {
        console.error('❌ Failed to start DevMirror:', error);
        clearInterval(statusInterval);
        // Clean up status file on error
        try { fs.unlinkSync(statusFile); } catch {}
        process.exit(1);
    }

    process.on('SIGINT', async () => {
        console.log('\n\n🛑 Shutting down DevMirror...');
        clearInterval(statusInterval);
        try { fs.unlinkSync(statusFile); } catch {}
        await manager.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        clearInterval(statusInterval);
        try { fs.unlinkSync(statusFile); } catch {}
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