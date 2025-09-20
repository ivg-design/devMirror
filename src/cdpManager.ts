import * as puppeteer from 'puppeteer-core';
import { LogWriter } from './logWriter';
import { DevMirrorConfig } from './configHandler';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export class CDPManager {
    private browser: puppeteer.Browser | null = null;
    private page: puppeteer.Page | null = null;
    private logWriter: LogWriter;
    private messageCount = new Map<string, number>();
    private lastReset = Date.now();
    private client: puppeteer.CDPSession | null = null;

    constructor() {
        this.logWriter = new LogWriter('');
    }

    async start(config: DevMirrorConfig): Promise<void> {
        this.logWriter = new LogWriter(config.outputDir);
        await this.logWriter.initialize();

        console.log('🔴 DevMirror Active');
        console.log(`├─ Chrome launching (CDP connecting)...`);
        console.log(`├─ Logging to: ${config.outputDir}`);
        console.log(`└─ Dev server: ${config.url}`);

        try {
            const executablePath = config.chromePath || this.findChrome();

            // Create a persistent user data directory for DevMirror
            const userDataDir = path.join(os.homedir(), '.devmirror', 'chrome-profile');

            // Ensure the directory exists
            if (!fs.existsSync(userDataDir)) {
                fs.mkdirSync(userDataDir, { recursive: true });
            }

            this.browser = await puppeteer.launch({
                headless: false,
                devtools: true,
                executablePath: executablePath,
                userDataDir: userDataDir,  // Persistent profile that remembers DevTools settings
                args: [
                    '--auto-open-devtools-for-tabs',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });

            this.page = await this.browser.newPage();

            await this.setupListeners();

            await this.page.goto(config.url, { waitUntil: 'domcontentloaded' });

            console.log('\n✅ DevMirror capturing all console output');

        } catch (error) {
            console.error('Failed to start DevMirror:', error);
            throw error;
        }
    }

    private findChrome(): string {
        const platform = process.platform;

        if (platform === 'darwin') {
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else if (platform === 'win32') {
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        } else {
            return 'google-chrome';
        }
    }

    private async setupListeners(): Promise<void> {
        if (!this.page) return;

        this.client = await this.page.target().createCDPSession();

        await this.client.send('Runtime.enable');
        await this.client.send('Network.enable');
        await this.client.send('Log.enable');
        await this.client.send('Security.enable');
        await this.client.send('Page.enable');

        this.client.on('Runtime.consoleAPICalled', (event) => {
            this.handleConsoleMessage(event);
        });

        this.client.on('Runtime.exceptionThrown', (event) => {
            this.logWriter.write({
                type: 'error',
                message: event.exceptionDetails.text || 'Uncaught exception',
                stack: event.exceptionDetails.stackTrace,
                timestamp: Date.now()
            });
        });

        this.client.on('Network.loadingFailed', (event) => {
            const errorText = event.errorText || 'Unknown error';
            const blockedReason = event.blockedReason;

            let message = `Failed to load: ${errorText}`;
            if (blockedReason) {
                message += ` (Blocked: ${blockedReason})`;
            }

            this.logWriter.write({
                type: 'network',
                message: message,
                url: `Request ID: ${event.requestId}`,
                timestamp: Date.now()
            });
        });

        this.client.on('Network.responseReceived', (event) => {
            if (event.response.status >= 400) {
                this.logWriter.write({
                    type: 'network',
                    message: `HTTP ${event.response.status}: ${event.response.statusText}`,
                    url: event.response.url,
                    timestamp: Date.now()
                });
            }
        });

        this.client.on('Log.entryAdded', (event) => {
            this.logWriter.write({
                type: 'browser',
                level: event.entry.level,
                message: event.entry.text,
                source: event.entry.source,
                timestamp: event.entry.timestamp * 1000
            });
        });

        this.client.on('Security.securityStateChanged', (event) => {
            if (event.securityState === 'insecure') {
                const summary = event.summary || 'Security issue detected';
                this.logWriter.write({
                    type: 'browser',
                    level: 'warning',
                    message: `Security: ${summary}`,
                    timestamp: Date.now()
                });
            }
        });

        this.client.on('Page.loadEventFired', () => {
            this.logWriter.write({
                type: 'lifecycle',
                message: '════════════ Page Loaded ════════════',
                url: this.page?.url(),
                timestamp: Date.now()
            });
        });

        this.client.on('Page.frameNavigated', (event) => {
            if (event.frame.parentId === undefined) {
                this.logWriter.write({
                    type: 'lifecycle',
                    message: '════════════ Page Navigated ════════════',
                    url: event.frame.url,
                    timestamp: Date.now()
                });
            }
        });

        this.page.on('pageerror', (error) => {
            this.logWriter.write({
                type: 'error',
                message: error.message,
                stack: error.stack,
                timestamp: Date.now()
            });
        });

        this.page.on('error', (error) => {
            this.logWriter.write({
                type: 'error',
                message: `Page crashed: ${error.message}`,
                timestamp: Date.now()
            });
        });

        this.page.on('requestfailed', (request) => {
            const failure = request.failure();
            if (failure) {
                this.logWriter.write({
                    type: 'network',
                    message: `Request failed: ${failure.errorText}`,
                    url: request.url(),
                    timestamp: Date.now()
                });
            }
        });
    }

    private handleConsoleMessage(event: any): void {
        const message = this.formatConsoleArgs(event.args);
        const hash = this.hashMessage(message);

        if (Date.now() - this.lastReset > 1000) {
            this.messageCount.clear();
            this.lastReset = Date.now();
        }

        const count = (this.messageCount.get(hash) || 0) + 1;
        this.messageCount.set(hash, count);

        const config = { throttle: { maxPerSecond: 100, suppressAfter: 100 } };

        if (count <= config.throttle.suppressAfter) {
            this.logWriter.write({
                type: 'console',
                method: event.type,
                message: message,
                stack: event.stackTrace,
                timestamp: event.timestamp * 1000,
                count: count > 1 ? count : undefined
            });
        } else if (count === config.throttle.suppressAfter + 1) {
            this.logWriter.write({
                type: 'suppressed',
                message: `[SUPPRESSED] Message repeated ${config.throttle.suppressAfter}+ times: ${message.substring(0, 100)}...`,
                timestamp: Date.now()
            });
        }
    }

    private formatConsoleArgs(args: any[]): string {
        if (!args || args.length === 0) return '';

        return args.map(arg => {
            if (!arg) return 'undefined';

            switch (arg.type) {
                case 'undefined':
                    return 'undefined';
                case 'null':
                    return 'null';
                case 'string':
                    return arg.value || '';
                case 'number':
                case 'boolean':
                    return String(arg.value);
                case 'symbol':
                    return arg.description || 'Symbol()';
                case 'bigint':
                    return `${arg.unserializableValue || arg.value}n`;
                case 'function':
                    return arg.description || '[Function]';
                case 'object':
                    if (arg.subtype === 'array') {
                        return arg.description || '[Array]';
                    } else if (arg.subtype === 'null') {
                        return 'null';
                    } else if (arg.subtype === 'regexp') {
                        return arg.description || '/regex/';
                    } else if (arg.subtype === 'date') {
                        return arg.description || '[Date]';
                    } else if (arg.subtype === 'error') {
                        return arg.description || '[Error]';
                    }
                    return arg.description || '[Object]';
                default:
                    return arg.description || String(arg.value || '[Unknown]');
            }
        }).join(' ');
    }

    private hashMessage(message: string): string {
        return crypto
            .createHash('md5')
            .update(message)
            .digest('hex');
    }

    async stop(): Promise<void> {
        console.log('\nStopping DevMirror...');

        if (this.client) {
            await this.client.detach();
        }

        if (this.browser) {
            await this.browser.close();
        }

        await this.logWriter.close();

        console.log('DevMirror stopped');
    }
}