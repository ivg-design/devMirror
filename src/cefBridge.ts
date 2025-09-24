import { LogWriter } from './logWriter';
import { DevMirrorConfig } from './configHandler';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class CEFBridge {
    private browser: any = null;
    private page: any = null;
    private logWriter: LogWriter;
    private puppeteer: any;
    private config!: DevMirrorConfig;

    constructor() {
        this.logWriter = new LogWriter('');
    }

    async start(config: DevMirrorConfig): Promise<void> {
        // Store config for later use
        this.config = config;

        // Try to load puppeteer-core from multiple locations
        let puppeteerLoaded = false;

        // Try project's node_modules first
        try {
            const projectPath = path.join(process.cwd(), 'node_modules', 'puppeteer-core');
            this.puppeteer = require(projectPath);
            puppeteerLoaded = true;
        } catch (error) {
            // Try global or direct require
            try {
                this.puppeteer = require('puppeteer-core');
                puppeteerLoaded = true;
            } catch (error2) {
                // Not found
            }
        }

        if (!puppeteerLoaded) {
            console.error('❌ puppeteer-core not found.');
            console.log('🔧 Auto-installing puppeteer-core...');

            try {
                const { execSync } = require('child_process');

                // Try to install in the current project first
                if (require('fs').existsSync('package.json')) {
                    console.log('📦 Installing puppeteer-core as project dependency...');
                    execSync('npm install puppeteer-core', { stdio: 'inherit' });

                    // Try loading again after installation
                    const projectPath = path.join(process.cwd(), 'node_modules', 'puppeteer-core');
                    this.puppeteer = require(projectPath);
                    puppeteerLoaded = true;
                    console.log('✅ puppeteer-core installed and loaded successfully!');
                } else {
                    console.error('⚠️  No package.json found. Please install puppeteer-core manually:');
                    console.error('   npm install puppeteer-core');
                    console.error('   or globally: npm install -g puppeteer-core');
                    process.exit(1);
                }
            } catch (installError) {
                console.error('❌ Failed to auto-install puppeteer-core:', installError);
                console.error('💡 Please install manually:');
                console.error('   npm install puppeteer-core');
                console.error('   or globally: npm install -g puppeteer-core');
                process.exit(1);
            }
        }
        if (config.mode !== 'cef') {
            throw new Error('CEFBridge requires mode: "cef" in configuration');
        }

        this.logWriter = new LogWriter(config.outputDir);
        await this.logWriter.initialize();

        const debugPort = config.cefPort || await this.detectCEFDebugPort();

        console.log('🔴 DevMirror Active (CEF Mode)');
        console.log(`├─ Connecting to CEF debugger on port ${debugPort}`);
        console.log(`├─ Logging to: ${config.outputDir}`);
        console.log(`└─ Adobe CEP Extension`);

        try {
            this.browser = await this.puppeteer.connect({
                browserURL: `http://localhost:${debugPort}`,
                defaultViewport: null
            });

            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();

            await this.setupCEFListeners();

            console.log('\n✅ DevMirror capturing Adobe CEP console output');

        } catch (error) {
            console.error('Failed to connect to CEF debugger:', error);
            console.error('Make sure your Adobe application is running with debugging enabled');
            throw error;
        }
    }

    private async detectCEFDebugPort(): Promise<number> {
        const defaultPorts = [8088, 9222, 9223, 9224, 9225];

        const debugFilePath = this.getDebugFilePath();
        if (debugFilePath) {
            try {
                const content = await fs.readFile(debugFilePath, 'utf8');
                const portMatch = content.match(/<host.*port="(\d+)"/);
                if (portMatch) {
                    return parseInt(portMatch[1], 10);
                }
            } catch (error) {
                console.log('Could not read .debug file');
            }
        }

        for (const port of defaultPorts) {
            try {
                const response = await fetch(`http://localhost:${port}/json/version`);
                if (response.ok) {
                    return port;
                }
            } catch {}
        }

        throw new Error('Could not detect CEF debug port. Please specify cefPort in config.');
    }

    private getDebugFilePath(): string | null {
        const platform = process.platform;
        let extensionPath = '';

        if (platform === 'darwin') {
            extensionPath = path.join(
                os.homedir(),
                'Library/Application Support/Adobe/CEP/extensions'
            );
        } else if (platform === 'win32') {
            extensionPath = path.join(
                process.env.APPDATA || '',
                'Adobe/CEP/extensions'
            );
        }

        try {
            const files = require('fs').readdirSync(extensionPath);
            for (const file of files) {
                const debugFile = path.join(extensionPath, file, '.debug');
                if (require('fs').existsSync(debugFile)) {
                    return debugFile;
                }
            }
        } catch {}

        return null;
    }

    private async setupCEFListeners(): Promise<void> {
        if (!this.page) return;

        const client = await this.page.target().createCDPSession();

        await client.send('Runtime.enable');
        await client.send('Console.enable');
        await client.send('Log.enable');

        client.on('Runtime.consoleAPICalled', (event: any) => {
            const args = event.args || [];
            const message = args
                .map((arg: any) => this.formatCEFArg(arg))
                .join(' ');

            this.logWriter.write({
                type: 'console',
                method: event.type,
                message: message,
                timestamp: Date.now()
            });
        });

        client.on('Runtime.exceptionThrown', (event: any) => {
            this.logWriter.write({
                type: 'error',
                message: event.exceptionDetails.text || 'CEF Exception',
                stack: event.exceptionDetails.stackTrace,
                timestamp: Date.now()
            });
        });

        client.on('Log.entryAdded', (event: any) => {
            const entry = event.entry;
            const source = entry.source || 'cef';

            // Skip deprecation warnings unless explicitly enabled
            if (source === 'deprecation' && !this.config?.captureDeprecationWarnings) {
                return;
            }

            // Skip security warnings to avoid noise
            if (source === 'security') {
                return;
            }

            this.logWriter.write({
                type: 'browser',
                level: entry.level,
                message: `[${source.toUpperCase()}] ${entry.text}`,
                source: 'CEF',
                timestamp: entry.timestamp * 1000
            });
        });

        this.page.on('console', (msg: any) => {
            const type = msg.type();
            const text = msg.text();

            if (text.includes('CSInterface') || text.includes('CEP')) {
                this.logWriter.write({
                    type: 'console',
                    method: type,
                    message: `[CEP] ${text}`,
                    timestamp: Date.now()
                });
            }
        });

        console.log('CEF listeners configured for Adobe CEP debugging');
    }

    private formatCEFArg(arg: any): string {
        if (!arg) return 'undefined';

        if (arg.type === 'string') {
            return arg.value;
        } else if (arg.type === 'number' || arg.type === 'boolean') {
            return String(arg.value);
        } else if (arg.type === 'undefined') {
            return 'undefined';
        } else if (arg.type === 'null') {
            return 'null';
        } else if (arg.type === 'object') {
            return arg.description || '[Object]';
        } else if (arg.type === 'function') {
            return arg.description || '[Function]';
        }

        return String(arg.value || arg.description || '[Unknown]');
    }

    async stop(): Promise<void> {
        console.log('\nStopping CEF Bridge...');

        if (this.browser) {
            await this.browser.disconnect();
        }

        await this.logWriter.close();

        console.log('CEF Bridge stopped');
    }
}