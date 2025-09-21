#!/usr/bin/env node

/**
 * DevMirror Companion - Universal Integration Helper
 *
 * This wrapper allows DevMirror to work alongside ANY existing logger setup
 * without breaking or interfering with current workflows.
 *
 * Features:
 * - Non-invasive: Runs parallel to existing loggers
 * - Auto-detection: Finds CEF/Chrome debug ports automatically
 * - Flexible: Works via environment variables or config files
 * - Universal: Works with any project structure
 *
 * Usage:
 * 1. Add to package.json: "dev:mirror": "devmirror-companion"
 * 2. Run alongside existing dev: "dev": "concurrently \"yarn dev:original\" \"yarn dev:mirror\""
 * 3. Or run separately: npx devmirror-companion
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DevMirrorCompanion {
    constructor() {
        this.config = this.loadConfig();
        this.processes = [];
    }

    loadConfig() {
        // Priority order for configuration:
        // 1. Environment variables (highest priority)
        // 2. Local devmirror.config.json
        // 3. Auto-detection (lowest priority)

        let config = {
            enabled: process.env.DEVMIRROR_ENABLE !== 'false', // Default enabled
            mode: process.env.DEVMIRROR_MODE || 'auto',
            outputDir: process.env.DEVMIRROR_OUTPUT || './devmirror-logs',
            cefPort: process.env.DEVMIRROR_CEF_PORT || null,
            url: process.env.DEVMIRROR_URL || null,
            parallel: process.env.DEVMIRROR_PARALLEL !== 'false', // Run parallel by default
            silent: process.env.DEVMIRROR_SILENT === 'true', // Quiet mode
            companion: true // Always run in companion mode
        };

        // Try to load project-specific config
        const configPath = path.join(process.cwd(), 'devmirror.config.json');
        if (fs.existsSync(configPath)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config = { ...config, ...fileConfig };
                if (!config.silent) {
                    console.log('📋 Loaded devmirror.config.json');
                }
            } catch (e) {
                console.warn('⚠️ Failed to parse devmirror.config.json:', e.message);
            }
        }

        // Auto-detect mode if not specified
        if (config.mode === 'auto') {
            config.mode = this.detectMode();
        }

        return config;
    }

    detectMode() {
        // Check for CEF/CEP indicators
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

            // Check for CEP/CEF indicators
            if (pkg.name?.includes('cep') ||
                pkg.name?.includes('CEP') ||
                pkg.dependencies?.['chrome-remote-interface'] ||
                fs.existsSync(path.join(process.cwd(), '.debug'))) {

                // It's likely a CEF/CEP project
                if (!this.config.silent) {
                    console.log('🎯 Auto-detected: CEF/CEP project');
                }
                return 'cef';
            }
        }

        // Check for common dev server indicators
        if (fs.existsSync(path.join(process.cwd(), 'vite.config.js')) ||
            fs.existsSync(path.join(process.cwd(), 'vite.config.ts'))) {
            if (!this.config.silent) {
                console.log('🎯 Auto-detected: Vite project');
            }
            return 'cdp';
        }

        return 'cdp'; // Default to regular Chrome DevTools Protocol
    }

    async detectPorts() {
        // Auto-detect CEF port if in CEF mode
        if (this.config.mode === 'cef' && !this.config.cefPort) {
            // Common CEF debug ports
            const cefPorts = [8555, 9222, 9223, 9229];
            for (const port of cefPorts) {
                if (await this.isPortOpen(port)) {
                    this.config.cefPort = port;
                    if (!this.config.silent) {
                        console.log(`🔍 Found CEF debug port: ${port}`);
                    }
                    break;
                }
            }
        }

        // Auto-detect dev server URL if in CDP mode
        if (this.config.mode === 'cdp' && !this.config.url) {
            const devPorts = [3000, 5173, 8080, 4200, 5000];
            for (const port of devPorts) {
                if (await this.isPortOpen(port)) {
                    this.config.url = `http://localhost:${port}`;
                    if (!this.config.silent) {
                        console.log(`🔍 Found dev server: ${this.config.url}`);
                    }
                    break;
                }
            }
        }
    }

    async isPortOpen(port) {
        return new Promise(resolve => {
            const net = require('net');
            const socket = net.createConnection(port, 'localhost');

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                resolve(false);
            });

            socket.setTimeout(100, () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    async waitForPort(port, maxAttempts = 30) {
        if (!this.config.silent) {
            console.log(`⏳ Waiting for port ${port}...`);
        }

        for (let i = 0; i < maxAttempts; i++) {
            if (await this.isPortOpen(port)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
    }

    async start() {
        if (!this.config.enabled) {
            console.log('🚫 DevMirror disabled (set DEVMIRROR_ENABLE=true to enable)');
            return;
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log('🪞 DevMirror Companion - Universal Console Capture');
        console.log(`${'='.repeat(60)}\n`);

        // Auto-detect ports if needed
        await this.detectPorts();

        // Wait for the appropriate port if needed
        if (this.config.mode === 'cef' && this.config.cefPort) {
            await this.waitForPort(this.config.cefPort);
        }

        // Build the DevMirror command
        const devmirrorArgs = [];

        // Use npx to run DevMirror CLI
        const command = 'npx';
        const args = ['devmirror-cli'];

        // Start DevMirror
        console.log(`🚀 Starting DevMirror in ${this.config.mode.toUpperCase()} mode...`);
        console.log(`📁 Logs will be saved to: ${this.config.outputDir}\n`);

        const devmirrorProcess = spawn(command, args, {
            stdio: this.config.silent ? 'ignore' : 'inherit',
            env: {
                ...process.env,
                DEVMIRROR_MODE: this.config.mode,
                DEVMIRROR_OUTPUT: this.config.outputDir,
                DEVMIRROR_CEF_PORT: this.config.cefPort,
                DEVMIRROR_URL: this.config.url,
                DEVMIRROR_PKG_PATH: process.cwd()
            },
            cwd: process.cwd()
        });

        this.processes.push(devmirrorProcess);

        devmirrorProcess.on('error', (err) => {
            console.error('❌ Failed to start DevMirror:', err.message);
        });

        devmirrorProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.log(`⚠️ DevMirror exited with code ${code}`);
            }
        });

        // Graceful cleanup
        const cleanup = () => {
            console.log('\n🛑 Stopping DevMirror Companion...');
            this.processes.forEach(p => {
                if (!p.killed) {
                    p.kill();
                }
            });
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Keep the process running
        if (!this.config.parallel) {
            // If not running in parallel, keep alive
            await new Promise(() => {});
        }
    }
}

// Check if running as a standalone script or being imported
if (process.argv[1] === __filename) {
    const companion = new DevMirrorCompanion();
    companion.start().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

export default DevMirrorCompanion;