import { LogWriter } from './logWriter';
import { DevMirrorConfig } from './configHandler';
import { ConsoleEventHandler } from './handlers/ConsoleEventHandler';
import { NetworkEventHandler } from './handlers/NetworkEventHandler';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

export class CDPManager {
    private browser: any = null;
    private page: any = null;
    private logWriter!: LogWriter;  // Will be initialized before use
    private messageCount = new Map<string, number>();
    private lastReset = Date.now();
    private client: any = null;
    private puppeteer: any;
    private static connectionCount: number = 0;

    // Execution context tracking
    private currentContextId: number | null = null;
    private contextCount: number = 0;
    private sessionStartTime: Date = new Date();
    private waitingForFreshContext: boolean = true;  // Ignore existing contexts on startup
    private initialContextsSeen: Set<number> = new Set();  // Track initial contexts to ignore
    private connectionAttempts: number = 0;  // Track how many times we tried to connect
    private activeWebSocket: any = null;  // Track active WebSocket for cleanup
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isReconnecting: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 5000; // 5 seconds between attempts

    // Configuration
    private config!: DevMirrorConfig;

    // Event handlers
    private consoleHandler!: ConsoleEventHandler;
    private networkHandler!: NetworkEventHandler;

    constructor() {
        // Don't initialize LogWriter here - wait for config
        // this.logWriter will be initialized when we have the outputDir
    }

    async start(config: DevMirrorConfig): Promise<void> {
        // Store config for later use
        this.config = config;

        // Handle CEF mode differently - open browser to debug interface
        if (config.mode === 'cef' && config.cefPort) {
            return this.startCEFMode(config);
        }
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

        this.logWriter = new LogWriter(config.outputDir, config);
        await this.logWriter.initialize();

        // Initialize event handlers
        this.consoleHandler = new ConsoleEventHandler(this.logWriter, config);
        this.networkHandler = new NetworkEventHandler(this.logWriter);

        // Auto-detect port if URL not provided or autoDetectPort is true
        let targetUrl = config.url;
        if (!targetUrl || config.autoDetectPort) {
            console.log('🔍 Auto-detecting dev server port...');
            const detectedPort = await this.detectDevServerPort();
            if (detectedPort) {
                targetUrl = `http://localhost:${detectedPort}`;
                console.log(`├─ Found dev server on port ${detectedPort}`);
            } else if (!targetUrl) {
                console.error('❌ No dev server detected and no URL configured');
                console.error('   Please specify "url" in devmirror.config.json');
                console.error('   or ensure your dev server is running');
                process.exit(1);
            }
        }

        console.log('🟢 DevMirror Active');
        console.log(`├─ Chrome launching (CDP connecting)...`);
        console.log(`├─ Logging to: ${config.outputDir}`);
        console.log(`└─ Dev server: ${targetUrl}`);

        try {
            const executablePath = config.chromePath || this.findChrome();

            // Create a persistent user data directory for DevMirror
            const userDataDir = path.join(os.homedir(), '.devmirror', 'chrome-profile');

            // Ensure the directory exists
            if (!fs.existsSync(userDataDir)) {
                fs.mkdirSync(userDataDir, { recursive: true });
            }

            this.browser = await this.puppeteer.launch({
                headless: false,
                devtools: true,
                executablePath: executablePath,
                userDataDir: userDataDir,  // Persistent profile that remembers DevTools settings
                defaultViewport: null,  // Use full browser window instead of fixed viewport
                args: [
                    '--auto-open-devtools-for-tabs',
                    '--start-maximized',  // Start Chrome maximized
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });

            // Wait a bit for browser to fully initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the first page (avoid creating extra blank tab)
            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();

            // Wait for page to be ready
            await this.page.evaluateHandle('document');

            await this.setupListeners();

            // Try to connect with retries (server might be starting)
            const maxRetries = 10;
            let retries = 0;
            let connected = false;

            while (retries < maxRetries && !connected) {
                try {
                    await this.page.goto(targetUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 5000
                    });
                    connected = true;
                } catch (error: any) {
                    retries++;
                    const errorMessage = error.message || '';

                    // Handle various connection errors
                    if ((errorMessage.includes('ERR_CONNECTION_REFUSED') ||
                         errorMessage.includes('Requesting main frame too early')) &&
                        retries < maxRetries) {
                        console.log(`├─ Waiting for dev server... (attempt ${retries}/${maxRetries})`);
                        // Exponential backoff: 1s, 2s, 4s, etc.
                        const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
                        await new Promise(resolve => setTimeout(resolve, delay));

                        // If main frame error, try to recreate the page
                        if (errorMessage.includes('Requesting main frame too early')) {
                            const pages = await this.browser.pages();
                            this.page = pages[0] || await this.browser.newPage();
                            await this.page.evaluateHandle('document');
                            await this.setupListeners();
                        }
                    } else {
                        throw error;
                    }
                }
            }

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

        // Enable both Log and Console domains to capture all possible warning sources
        await this.client.send('Log.enable');
        await this.client.send('Console.enable');

        await this.client.send('Security.enable');
        await this.client.send('Page.enable');

        // Set up console capture for CDP mode
        this.client.on('Runtime.consoleAPICalled', (event: any) => {
            this.consoleHandler.handleConsoleAPI(event);

            // Check for Vite errors in console messages
            if (event.type === 'error' || event.type === 'warn') {
                const message = event.args?.map((arg: any) => arg.value || arg.description || '').join(' ');
                }
        });

        this.client.on('Runtime.exceptionThrown', (event: any) => {
            // Debug log the raw CDP event if debug is enabled
            if (this.config.debug?.enabled && this.config.debug?.logExceptions) {
                const logToConsole = this.config.debug.logToConsole !== false;
                if (logToConsole) {
                    console.log('[DevMirror Debug] Raw Runtime.exceptionThrown event:', JSON.stringify(event, null, 2));
                }
            }
            this.consoleHandler.handleExceptionThrown(event.exceptionDetails);
        });

        // Store request initiators for stack trace tracking
        const requestInitiators = new Map<string, any>();

        this.client.on('Network.requestWillBeSent', (event: any) => {
            // Store the initiator for this request ID
            if (event.initiator) {
                requestInitiators.set(event.requestId, event.initiator);
            }
        });

        this.client.on('Network.loadingFailed', (event: any) => {
            // Add initiator if available
            const initiator = requestInitiators.get(event.requestId);
            if (initiator) {
                event.initiator = initiator;
                requestInitiators.delete(event.requestId);
            }
            this.networkHandler.handleLoadingFailed(event);

            // Check for Vite module loading errors
        });

        this.client.on('Network.responseReceived', (event: any) => {
            // Add initiator if available
            const initiator = requestInitiators.get(event.requestId);
            if (initiator) {
                event.initiator = initiator;
                // Keep for potential loadingFailed event
            }
            this.networkHandler.handleResponseReceived(event);
        });

        this.client.on('Log.entryAdded', (event: any) => {
            // Debug log the raw CDP event if debug is enabled
            if (this.config.debug?.enabled && this.config.debug?.logLogEntries) {
                const logToConsole = this.config.debug.logToConsole !== false;
                if (logToConsole) {
                    console.log('[DevMirror Debug] Raw Log.entryAdded event:', JSON.stringify(event, null, 2));
                }
            }
            this.consoleHandler.handleLogEntry(event);
        });


        this.client.on('Security.securityStateChanged', (event: any) => {
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

        this.client.on('Page.frameNavigated', (event: any) => {
            if (event.frame.parentId === undefined) {
                this.logWriter.write({
                    type: 'lifecycle',
                    message: '════════════ Page Navigated ════════════',
                    url: event.frame.url,
                    timestamp: Date.now()
                });
            }
        });

        this.page.on('pageerror', (error: any) => {
            this.logWriter.write({
                type: 'error',
                message: error.message,
                stack: error.stack,
                timestamp: Date.now()
            });
        });

        this.page.on('error', (error: any) => {
            this.logWriter.write({
                type: 'error',
                message: `Page crashed: ${error.message}`,
                timestamp: Date.now()
            });
        });

        this.page.on('requestfailed', (request: any) => {
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
                timestamp: Date.now(),
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

    private async detectDevServerPort(): Promise<number | null> {
        const execAsync = promisify(exec);

        // Common dev server ports to check
        const commonPorts = [3000, 3001, 5173, 5174, 8080, 8081, 4200, 9000, 1234, 8000];

        // Check which ports are in use
        for (const port of commonPorts) {
            if (await this.isPortInUse(port)) {
                // Try to verify it's a web server by checking if it responds to HTTP
                try {
                    const http = require('http');
                    const response = await new Promise<boolean>((resolve) => {
                        const req = http.get(`http://localhost:${port}/`, (res: any) => {
                            resolve(res.statusCode < 500);
                        });
                        req.on('error', () => resolve(false));
                        req.setTimeout(1000, () => {
                            req.destroy();
                            resolve(false);
                        });
                    });

                    if (response) {
                        return port;
                    }
                } catch {}
            }
        }

        // Also check for ports mentioned in package.json scripts
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(packagePath)) {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                const scripts = Object.values(packageJson.scripts || {}).join(' ');

                // Look for port patterns in scripts
                const portMatches = scripts.match(/(?:--port[= ]|PORT=|:)(\d{4,5})/g);
                if (portMatches) {
                    for (const match of portMatches) {
                        const port = parseInt(match.replace(/\D/g, ''));
                        if (port && await this.isPortInUse(port)) {
                            return port;
                        }
                    }
                }
            }
        } catch {}

        return null;
    }

    private async isPortInUse(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });

            server.once('listening', () => {
                server.close();
                resolve(false);
            });

            server.listen(port);
        });
    }

    async stop(): Promise<void> {
        console.log('\n🛑 Shutting down DevMirror...');

        // Clear any pending reconnect timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;

        // Close WebSocket immediately to stop receiving messages
        if (this.activeWebSocket) {
            try {
                this.activeWebSocket.removeAllListeners?.();
                this.activeWebSocket.close();
            } catch (e) {
                // Ignore errors on close
            }
            this.activeWebSocket = null;
        }

        // Clear client
        if (this.client) {
            try {
                if (this.client.detach) {
                    await this.client.detach();
                }
            } catch (e) {
                // Ignore errors
            }
            this.client = null;
        }

        // Close browser if in browser mode
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                // Ignore errors on close
            }
            this.browser = null;
        }

        // Close log writer to prevent empty file creation
        if (this.logWriter) {
            await this.logWriter.close();
        }

        console.log('   ✅ DevMirror shutdown complete');

        // Exit the process cleanly
        process.exit(0);
    }

    private async startCEFMode(config: DevMirrorConfig): Promise<void> {
        // Initialize LogWriter ONCE at the beginning
        if (!this.logWriter) {
            const outputDir = config.outputDir || './devmirror-logs';
            this.logWriter = new LogWriter(outputDir, config);
            await this.logWriter.initialize();

            // Initialize event handlers
            this.consoleHandler = new ConsoleEventHandler(this.logWriter, config);
            this.networkHandler = new NetworkEventHandler(this.logWriter);
                }

        console.log('🎨 DevMirror Active (CEF Debug Mode - Direct Connection)');
        console.log(`├─ CEF Debug Port: ${config.cefPort}`);
        console.log(`├─ Logging to: ${this.logWriter ? config.outputDir || './devmirror-logs' : 'not initialized'}`);
        console.log(`└─ NO BROWSER REQUIRED - Connecting directly to CDP`);

        // First, wait for CEF port to be available (without creating connections)
        let cefReady = false;
        let retryCount = 0;
        const maxRetries = 10;

        console.log(`\n🔍 Monitoring CEF port ${config.cefPort}...`);

        while (!cefReady && retryCount < maxRetries) {
            retryCount++;
            this.connectionAttempts = retryCount;  // Track attempts
            console.log(`   Check ${retryCount}/${maxRetries}: Testing port ${config.cefPort}...`);
            cefReady = await this.isCEFReady(config.cefPort!);

            if (!cefReady) {
                if (retryCount === 1) {
                    console.log('   ⚠️  CEF not ready yet');
                    console.log('   Make sure:');
                    console.log('   1. Your Adobe application is running');
                    console.log('   2. The extension is loaded');
                    console.log('   3. Debug mode is enabled (.debug file exists)');
                }
                console.log(`   Waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log(`   ✅ CEF is ready after ${retryCount} attempt${retryCount === 1 ? '' : 's'}`);
            }
        }

        if (!cefReady) {
            console.log('   ❌ CEF not available after maximum retries');
            return;
        }

        // Now make ONE connection
        console.log(`\n🔌 Creating single CDP connection...`);
        const connected = await this.connectToCEFDebugger(config.cefPort!, config);

        if (connected) {
            console.log('\n✅ DevMirror connected directly to CEF via CDP');
            console.log('   ✅ Console capture active - no browser needed!');
            console.log('   ✅ Capturing ALL console output to log files');

            // Auto-open browser if configured
            if (config.autoOpenBrowser) {
                console.log('\n🌐 Opening browser to CEF DevTools...');
                await this.openCEFDevTools(config.cefPort!, config);
            } else {
                console.log('\n📝 To view the console in a browser (optional):');
                console.log(`   Open Chrome and navigate to http://localhost:${config.cefPort}`);
                console.log('   Then click on your extension target');
            }
        } else {
            console.log('\n❌ Could not connect to CEF after ${maxRetries} attempts');
            console.log('   DevMirror will keep trying in the background...');

            // Set up periodic retry with backoff
            let retryInterval = 2000;
            const maxRetryInterval = 30000;
            const retryConnect = async () => {
                if (!this.client) {
                    const connected = await this.connectToCEFDebugger(config.cefPort!, config);
                    if (connected) {
                        console.log('\n✅ Successfully connected to CEF!');
                        console.log('   Console capture is now active');
                        retryInterval = 2000; // Reset on success
                    } else {
                        // Exponential backoff
                        retryInterval = Math.min(retryInterval * 1.5, maxRetryInterval);
                        setTimeout(retryConnect, retryInterval);
                    }
                } else {
                    // Already connected, reset interval
                    retryInterval = 2000;
                }
            };
            setTimeout(retryConnect, retryInterval);
        }
    }

    private async openCEFDevTools(cefPort: number, config?: DevMirrorConfig): Promise<void> {
        try {
            // Get the list of debug targets
            const targetsUrl = `http://localhost:${cefPort}/json`;
            const fetch = (await import('node-fetch')).default;
            const targetsResponse = await fetch(targetsUrl);

            if (targetsResponse.ok) {
                const targets = await targetsResponse.json() as any[];

                // Find the first page target (or any target)
                const pageTarget = targets.find((t: any) => t.type === 'page') || targets[0];

                if (pageTarget && pageTarget.devtoolsFrontendUrl) {
                    // Open DevTools directly
                    const devtoolsUrl = `http://localhost:${cefPort}${pageTarget.devtoolsFrontendUrl}`;
                    console.log('   Opening DevTools for:', pageTarget.title || pageTarget.url);

                    try {
                        // Try to use the open package
                        const openModule = await import('open');
                        const open = openModule.default;
                        await open(devtoolsUrl);
                        console.log('   ✅ DevTools opened/refreshed');
                    } catch (openError: any) {
                        // Fallback to child_process
                        const { exec } = require('child_process');
                        const platform = process.platform;

                        let command;
                        if (platform === 'darwin') {
                            command = `open "${devtoolsUrl}"`;
                        } else if (platform === 'win32') {
                            command = `start "${devtoolsUrl}"`;
                        } else {
                            command = `xdg-open "${devtoolsUrl}"`;
                        }

                        exec(command, (err: any) => {
                            if (err) {
                                console.log('   ⚠️ Could not auto-open DevTools:', err.message);
                                console.log(`   Manually navigate to: ${devtoolsUrl}`);
                            } else {
                                console.log('   ✅ DevTools opened/refreshed');
                            }
                        });
                    }
                } else {
                    // Fallback to target URL if no devtools URL found
                    console.log('   ⚠️ No DevTools URL found, opening target page');
                    const targetUrl = config?.url || this.config?.url || `http://localhost:${cefPort}`;
                    await this.openBrowserFallback(targetUrl);
                }
            } else {
                // Can't fetch targets, open target URL
                const targetUrl = this.config?.url || `http://localhost:${cefPort}`;
                await this.openBrowserFallback(targetUrl);
            }
        } catch (error: any) {
            console.log('   ⚠️ Error fetching debug targets:', error.message);
            const targetUrl = this.config?.url || `http://localhost:${cefPort}`;
            await this.openBrowserFallback(targetUrl);
        }
    }

    private async openBrowserFallback(url: string): Promise<void> {
        try {
            const openModule = await import('open');
            const open = openModule.default;
            await open(url);
        } catch {
            const { exec } = require('child_process');
            const platform = process.platform;
            let command;
            if (platform === 'darwin') {
                command = `open "${url}"`;
            } else if (platform === 'win32') {
                command = `start "${url}"`;
            } else {
                command = `xdg-open "${url}"`;
            }
            exec(command, () => {});
        }
    }

    private async navigateToCEF(debugUrl: string): Promise<void> {
        try {
            await this.page.goto(debugUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 5000
            });

            // Check if we're on the index page with "Inspectable WebContents"
            const pageContent = await this.page.content();
            if (pageContent.includes('Inspectable WebContents')) {
                console.log('   CEF index page detected - auto-navigating to debug target...');

                // Get list of debug targets
                const targetsResponse = await fetch(`${debugUrl}/json`);
                if (targetsResponse.ok) {
                    const targets = await targetsResponse.json();

                    // Find the first page target
                    const pageTarget = targets.find((t: any) => t.type === 'page') || targets[0];

                    if (pageTarget && pageTarget.devtoolsFrontendUrl) {
                        // Navigate directly to the DevTools frontend URL
                        const devtoolsUrl = `${debugUrl}${pageTarget.devtoolsFrontendUrl}`;
                        console.log('   Opening DevTools interface...');
                        await this.page.goto(devtoolsUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        });
                        console.log('   ✅ DevTools interface opened');
                        return; // Exit after successful navigation
                    } else {
                        // Fallback: try to click the first link on the page
                        const links = await this.page.$$('a');
                        if (links.length > 0) {
                            console.log('   Clicking on debug target link...');
                            await links[0].click();
                            await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
                            console.log('   ✅ Navigated to debug target');
                            return; // Exit after successful navigation
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.message.includes('ERR_CONNECTION_REFUSED')) {
                console.log('\n⚠️  CEF debugger not available at port ' + debugUrl.split(':').pop());
                console.log('   Make sure:');
                console.log('   1. Your Adobe application is running');
                console.log('   2. The extension is loaded');
                console.log('   3. Debug mode is enabled in .debug file');
                console.log('\n   Chrome will auto-refresh when CEF becomes available...');
            }
        }
    }

    private setupCEFReconnect(debugUrl: string): void {
        return; // DISABLED FOR TESTING
        if (!this.page) return;

        // Monitor the page for disconnection/errors
        let reconnectInterval: NodeJS.Timeout;
        let isConnected = false;
        let isNavigating = false;

        const checkConnection = async () => {
            try {
                // Try to fetch the CEF debug endpoint
                const response = await fetch(debugUrl + '/json');
                const wasConnected = isConnected;
                isConnected = response.ok;

                if (!wasConnected && isConnected && !isNavigating) {
                    // CEF just became available
                    console.log('\n🔄 CEF debugger detected - reconnecting...');
                    isNavigating = true;
                    await this.navigateToCEF(debugUrl);
                    isNavigating = false;
                } else if (wasConnected && !isConnected) {
                    // CEF just disconnected
                    console.log('\n⚠️  CEF debugger disconnected - monitoring for reconnection...');
                }
            } catch {
                if (isConnected) {
                    isConnected = false;
                    console.log('\n⚠️  CEF debugger disconnected - monitoring for reconnection...');
                }
            }
        };

        // Check every 2 seconds
        reconnectInterval = setInterval(async () => {
            await checkConnection();

            // Also check if we need to re-navigate from index page
            try {
                const currentUrl = this.page.url();
                const pageContent = await this.page.content();

                // If we're back on the index page or error page, re-navigate
                if ((pageContent.includes('Inspectable WebContents') ||
                     pageContent.includes('This site can\'t be reached') ||
                     pageContent.includes('ERR_CONNECTION_REFUSED')) &&
                    !currentUrl.includes('devtools://') &&
                    !currentUrl.includes('/devtools/') &&
                    !isNavigating) {
                    console.log('   Auto-navigating from index/error page...');
                    isNavigating = true;
                    await this.navigateToCEF(debugUrl);
                    isNavigating = false;
                }
            } catch {
                // Page might be navigating, ignore errors
            }
        }, 2000);

        // Also monitor page navigation to detect when user clicks on a debug target
        this.page.on('framenavigated', (frame: any) => {
            if (frame === this.page.mainFrame()) {
                const url = frame.url();
                if (url.includes('devtools://')) {
                    console.log('\n✅ Connected to CEF DevTools');
                    // Stop the reconnect monitoring once we're in DevTools
                    clearInterval(reconnectInterval);
                }
            }
        });

        // Clean up on stop
        this.page.once('close', () => {
            clearInterval(reconnectInterval);
        });
    }

    private captureConsoleEvent(method: string, params: any): void {
        // Universal CDP event capture for comprehensive logging
        if (!this.logWriter) {
            console.log('   ⚠️ LogWriter not ready for event:', method);
            return;
        }

        try {
            // Handle different event types universally
            if (method === 'Runtime.consoleAPICalled') {
                // Process console.log, console.error, etc.
                const args = params.args || [];
                const type = params.type || 'log';

                // Extract source location if available
                let source = '';
                if (params.stackTrace?.callFrames?.[0]) {
                    const frame = params.stackTrace.callFrames[0];
                    const fileName = frame.url ? frame.url.split('/').pop() : '';
                    if (fileName && frame.lineNumber) {
                        source = `[${fileName}:${frame.lineNumber}] `;
                    }
                }

                // Convert all arguments to strings - synchronously
                const message = args.map((arg: any) => {
                    // Handle primitive values
                    if (arg.value !== undefined) {
                        return String(arg.value);
                    }

                    // Handle objects with preview (synchronous)
                    if (arg.type === 'object' && arg.preview?.properties) {
                        const props = arg.preview.properties
                            .map((p: any) => `${p.name}: ${p.value || p.type}`)
                            .join(', ');
                        const overflow = arg.preview.overflow ? ', ...' : '';
                        return `${arg.className || 'Object'} {${props}${overflow}}`;
                    }

                    // Handle description (including JSON objects and arrays)
                    if (arg.description) {
                        // Check if it's a JSON object or array and format it properly
                        if ((arg.description.startsWith('{') && arg.description.endsWith('}')) ||
                            (arg.description.startsWith('[') && arg.description.endsWith(']'))) {
                            try {
                                // Parse and re-stringify with proper indentation
                                const obj = JSON.parse(arg.description);

                                // Format JSON with proper indentation for clean folding
                                const formatted = JSON.stringify(obj, null, 2);

                                // Split into lines
                                const lines = formatted.split('\n');

                                // Process each line - add 2 spaces to ALL lines except first
                                const indented = lines.map((line, i) => {
                                    if (i === 0) {
                                        return line;  // First line stays inline
                                    }
                                    return '  ' + line;  // All other lines get 2 spaces
                                }).join('\n');

                                return indented;
                            } catch (e) {
                                // Not valid JSON, return as-is
                                return arg.description;
                            }
                        }
                        return arg.description;
                    }

                    // Handle other object types
                    if (arg.type === 'object' && arg.className) {
                        return `[${arg.className}]`;
                    }

                    return arg.type || 'undefined';
                }).join(' ');

                this.logWriter.write({
                    type: 'console',
                    method: type,
                    message: source + message,
                    timestamp: Date.now()
                });


            } else if (method === 'Runtime.exceptionThrown') {
                // Handle exceptions
                const details = params.exceptionDetails;
                this.logWriter.write({
                    type: 'error',
                    message: details.text || details.exception?.description || 'JavaScript Error',
                    stack: details.stackTrace,
                    timestamp: Date.now()
                });

            } else {
                // Capture any other console-related events generically
                const message = JSON.stringify(params).substring(0, 500);
                this.logWriter.write({
                    type: 'console',
                    method: method.split('.').pop() || 'unknown',
                    message: message,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.log('   Error capturing console event:', error);
        }
    }

    private async isCEFReady(cefPort: number): Promise<boolean> {
        try {
            // Just check if CEF port is responding - don't create connections
            const targetsResponse = await fetch(`http://localhost:${cefPort}/json`);
            return targetsResponse.ok;
        } catch (error) {
            return false;
        }
    }

    private async connectToCEFDebugger(cefPort: number, config?: DevMirrorConfig): Promise<boolean> {
        try {
            // Get list of debug targets from CEF
            const targetsResponse = await fetch(`http://localhost:${cefPort}/json`);
            if (!targetsResponse.ok) {
                console.log('   CEF debugger not ready yet - console capture pending...');
                return false;
            }

            const targets = await targetsResponse.json();
            console.log(`   Found ${targets.length} debug target(s)`);

            // Log all available targets for debugging
            targets.forEach((target: any, index: number) => {
                console.log(`   [${index}] ${target.type}: ${target.title} - ${target.url}`);
            });

            // Log reconnection event if this is a reconnection
            if (this.isReconnecting && this.reconnectAttempts > 0 && this.logWriter) {
                this.logWriter.write({
                    type: 'lifecycle',
                    message: '════════════ CEF RECONNECTED ════════════',
                    timestamp: Date.now()
                });
            }

            // Find the CEP extension target - be more flexible in matching
            let extensionTarget = targets.find((target: any) =>
                target.type === 'page' &&
                (target.url.includes('index.html') ||
                 target.url.includes('.html') ||
                 target.title.includes('CEP') ||
                 target.title.includes('Extension') ||
                 target.url.includes('file://'))
            );

            // If no specific extension found, try to use the first page target
            if (!extensionTarget && targets.length > 0) {
                extensionTarget = targets.find((target: any) => target.type === 'page');
                if (!extensionTarget) {
                    // Use the first available target
                    extensionTarget = targets[0];
                }
            }

            if (!extensionTarget) {
                console.log('   No debug target found');
                return false;
            }

            console.log(`   Connecting to target: ${extensionTarget.title || extensionTarget.url}`);

            // Connect directly to the WebSocket debugger URL
            const browserWSEndpoint = extensionTarget.webSocketDebuggerUrl;
            if (!browserWSEndpoint) {
                console.log('   WebSocket debugger URL not available');
                return false;
            }

            console.log(`   WebSocket URL: ${browserWSEndpoint}`);

            CDPManager.connectionCount++;
            console.log(`   🔗 Creating CDP connection #${CDPManager.connectionCount}`);

            // Clean up any existing WebSocket connection
            if (this.activeWebSocket) {
                console.log('   🧹 Cleaning up existing WebSocket connection');
                try {
                    this.activeWebSocket.removeAllListeners?.();
                    this.activeWebSocket.close();
                } catch (e) {
                    // Ignore errors during cleanup
                }
                this.activeWebSocket = null;
            }

            // Clear any pending reconnect
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.isReconnecting = false;

            // For CEF, we need a direct WebSocket connection without browser-level abstractions
            try {
                // Import WebSocket for direct connection
                const WebSocket = require('ws');

                // Create direct WebSocket connection to CEF
                const ws = new WebSocket(browserWSEndpoint);
                // Note: activeWebSocket is set later after all setup

                let messageId = 1;
                const pendingCallbacks = new Map();

                // Create a minimal CDP client for CEF
                this.client = {
                    send: (method: string, params?: any) => {
                        return new Promise((resolve, reject) => {
                            const id = messageId++;
                            const message = JSON.stringify({ id, method, params: params || {} });

                            pendingCallbacks.set(id, { resolve, reject });

                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(message);
                            } else {
                                ws.once('open', () => ws.send(message));
                            }

                            // Timeout for commands
                            setTimeout(() => {
                                if (pendingCallbacks.has(id)) {
                                    pendingCallbacks.delete(id);
                                    reject(new Error(`Command ${method} timed out`));
                                }
                            }, 5000);
                        });
                    },
                    on: (event: string, handler: Function) => {
                        // Store event handlers
                        if (!this.client._eventHandlers) {
                            this.client._eventHandlers = {};
                        }
                        if (!this.client._eventHandlers[event]) {
                            this.client._eventHandlers[event] = [];
                        }
                        this.client._eventHandlers[event].push(handler);
                    },
                    _eventHandlers: {}
                };

                // LogWriter should already be initialized - don't create new one!

                // Handle WebSocket messages with execution context filtering
                ws.on('message', (data: string) => {
                    try {
                        const message = JSON.parse(data);

                        // Handle responses to commands
                        if (message.id !== undefined) {
                            const callback = pendingCallbacks.get(message.id);
                            if (callback) {
                                pendingCallbacks.delete(message.id);
                                if (message.error) {
                                    callback.reject(new Error(message.error.message));
                                } else {
                                    callback.resolve(message.result);
                                }
                            }
                        }

                        // Handle execution context lifecycle events
                        if (message.method === 'Runtime.executionContextCreated') {
                            const context = message.params.context;
                            const newContextId = context.id;
                            const contextName = context.name || 'Main';

                            if (this.waitingForFreshContext) {
                                // Check if this is a fresh start based on connection attempts
                                if (this.connectionAttempts > 2) {
                                    // Had to retry multiple times = CEF just started = fresh context!
                                    console.log(`   🚀 Fresh start detected (${this.connectionAttempts} connection attempts)`);
                                    this.waitingForFreshContext = false;
                                    this.currentContextId = newContextId;
                                    this.sessionStartTime = new Date();

                                    const now = new Date();
                                    const localTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${Math.floor(now.getMilliseconds() / 100)}`;
                                    this.logWriter.write({
                                        type: 'lifecycle',
                                        message: `\n${'═'.repeat(80)}\n` +
                                                `║ 🚀 FRESH CEF START DETECTED\n` +
                                                `║ Context ID: ${newContextId} (${contextName})\n` +
                                                `║ Connection attempts: ${this.connectionAttempts}\n` +
                                                `║ Local Time: ${localTime}\n` +
                                                `${'═'.repeat(80)}\n`,
                                        timestamp: Date.now()
                                    });
                                } else {
                                    // Connected quickly = CEF was already running = ignore initial context
                                    this.initialContextsSeen.add(newContextId);
                                    console.log(`   📝 Pre-existing context: ${newContextId} (${contextName}) - ignoring (connected in ${this.connectionAttempts} attempt${this.connectionAttempts === 1 ? '' : 's'})`);
                                }
                            } else if (!this.initialContextsSeen.has(newContextId) && this.currentContextId === null) {
                                // This is a fresh context created after we connected
                                this.currentContextId = newContextId;
                                this.sessionStartTime = new Date();

                                const now = new Date();
                                const localTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${Math.floor(now.getMilliseconds() / 100)}`;
                                this.logWriter.write({
                                    type: 'lifecycle',
                                    message: `\n${'═'.repeat(80)}\n` +
                                            `║ 🚀 FRESH CONTEXT DETECTED - Starting capture\n` +
                                            `║ Context ID: ${newContextId} (${contextName})\n` +
                                            `║ Local Time: ${localTime}\n` +
                                            `║ Ignored initial contexts: ${Array.from(this.initialContextsSeen).join(', ')}\n` +
                                            `${'═'.repeat(80)}\n`,
                                    timestamp: Date.now()
                                });

                                console.log(`   🚀 Fresh context detected: ${newContextId} - Starting capture`);
                            } else if (this.currentContextId !== null && this.currentContextId !== newContextId && !this.initialContextsSeen.has(newContextId)) {
                                // Subsequent context change (reload/refresh)
                                this.contextCount++;
                                const elapsed = ((Date.now() - this.sessionStartTime.getTime()) / 1000).toFixed(1);

                                // Write prominent reload marker to log
                                const now = new Date();
                                const localTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${Math.floor(now.getMilliseconds() / 100)}`;
                                this.logWriter.write({
                                    type: 'lifecycle',
                                    message: `\n${'═'.repeat(80)}\n` +
                                            `║ 🔄 RELOAD/REFRESH DETECTED (#${this.contextCount})\n` +
                                            `║ Previous Context ID: ${this.currentContextId}\n` +
                                            `║ New Context ID: ${newContextId} (${contextName})\n` +
                                            `║ Session Time: ${elapsed}s\n` +
                                            `║ Local Time: ${localTime}\n` +
                                            `${'═'.repeat(80)}\n`,
                                    timestamp: Date.now()
                                });

                                console.log(`   🔄 Context reload detected: ${this.currentContextId} → ${newContextId}`);

                                // Update current context
                                this.currentContextId = newContextId;
                            }
                        }

                        // Handle execution context destroyed
                        if (message.method === 'Runtime.executionContextDestroyed') {
                            const destroyedId = message.params.executionContextId;
                            if (destroyedId === this.currentContextId) {
                                console.log(`   ⚠️ Current context ${destroyedId} destroyed`);
                            }
                        }

                        // Handle execution contexts cleared (happens on navigation)
                        if (message.method === 'Runtime.executionContextsCleared') {
                            console.log('   🧹 All execution contexts cleared');
                            if (this.waitingForFreshContext) {
                                // This is our signal that we're about to get fresh contexts
                                this.waitingForFreshContext = false;
                                console.log('   ✅ Ready for fresh contexts after clear');
                            }
                            // Reset current context since all are cleared
                            this.currentContextId = null;
                        }

                        // Handle console events WITH context filtering
                        if (message.method === 'Runtime.consoleAPICalled') {
                            const contextId = message.params.executionContextId;

                            // If still waiting for fresh context, ignore
                            if (this.waitingForFreshContext) {
                                console.log(`   ⏭️ Ignoring message (waiting for fresh context): context=${contextId}`);
                                return;
                            }

                            // If message is from initial context that we determined was stale, ignore it
                            if (this.initialContextsSeen.has(contextId)) {
                                console.log(`   ⏭️ Ignoring stale context message: context=${contextId}`);
                                return;
                            }

                            // ONLY capture if from current context
                            if (contextId !== undefined && contextId === this.currentContextId) {
                                // Matching context
                                this.captureConsoleEvent(message.method, message.params);
                            } else if (contextId !== undefined && contextId !== this.currentContextId) {
                                console.log(`   🚫 Ignoring message from context ${contextId} (current: ${this.currentContextId})`);
                            } else {
                                // No context ID - this shouldn't happen but log it
                                console.log(`   ⚠️ Console event without executionContextId - ignoring`);
                            }
                        } else if (message.method === 'Runtime.exceptionThrown') {
                            // Check context for exceptions too
                            if (this.waitingForFreshContext) {
                                return; // Ignore exceptions from pre-existing contexts
                            }

                            const contextId = message.params.exceptionDetails?.executionContextId;
                            if (contextId !== undefined && contextId === this.currentContextId) {
                                this.captureConsoleEvent(message.method, message.params);
                            }
                        }

                        // Track page lifecycle events for additional context
                        if (message.method === 'Page.loadEventFired') {
                            this.logWriter.write({
                                type: 'lifecycle',
                                message: '📄 Page load event fired',
                                timestamp: Date.now()
                            });
                        }

                        if (message.method === 'Page.frameNavigated' && message.params.frame.parentId === undefined) {
                            // Main frame navigation
                            this.logWriter.write({
                                type: 'lifecycle',
                                message: `🧭 Main frame navigated to: ${message.params.frame.url}`,
                                timestamp: Date.now()
                            });
                        }

                    } catch (e) {
                        console.log('   Error parsing CDP message:', e);
                    }
                });

                // Wait for WebSocket to open
                console.log('   🔌 Opening WebSocket connection...');
                await new Promise((resolve, reject) => {
                    ws.once('open', () => {
                        console.log('   ✅ WebSocket connected');
                        resolve(undefined);
                    });
                    ws.once('error', reject);
                    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
                });

                console.log('   ✅ WebSocket connected to CEF');

                // LogWriter should already be initialized at the start of startCEFMode
                if (!this.logWriter) {
                    console.log('   ⚠️ LogWriter not initialized! This should not happen.');
                    return false;
                }

                // We don't need to register specific handlers anymore
                // The universal capture in the WebSocket message handler will catch everything
                // Universal console capture enabled - all events will be captured silently

                // Optional: You can still add specific handlers here if needed for special processing
                // But the universal capture ensures we never miss anything

                // Skip the old handler registration - moving directly to enabling domains
                /* Commented out - using universal capture instead
                this.client.on('Runtime.consoleAPICalled', async (event: any) => {
                    console.log('   📝 [Console API Called]', event.type);
                    const args = event.args || [];

                    // Process each argument to extract its value
                    const processedArgs = await Promise.all(args.map(async (arg: any) => {
                        // Handle primitive values
                        if (arg.value !== undefined) {
                            return String(arg.value);
                        }

                        // Handle objects and arrays - try to get full value
                        if (arg.type === 'object' && arg.objectId) {
                            try {
                                // Try to get the full object properties
                                const properties = await this.client.send('Runtime.getProperties', {
                                    objectId: arg.objectId,
                                    ownProperties: true,
                                    generatePreview: true
                                });

                                if (properties && properties.result) {
                                    // Build a JSON-like representation
                                    const isArray = arg.subtype === 'array';
                                    const items = properties.result
                                        .filter((prop: any) => prop.name !== 'length' || !isArray)
                                        .map((prop: any) => {
                                            const value = prop.value ?
                                                (prop.value.value !== undefined ? JSON.stringify(prop.value.value) : prop.value.description) :
                                                'undefined';
                                            return isArray ? value : `${prop.name}: ${value}`;
                                        });

                                    if (isArray) {
                                        return `[${items.join(', ')}]`;
                                    } else {
                                        const className = arg.className || 'Object';
                                        return `${className} {${items.join(', ')}}`;
                                    }
                                }
                            } catch (e) {
                                console.log('   Could not fetch object properties:', e);
                            }
                        }

                        // Fallback to preview-based serialization
                        if (arg.type === 'object') {
                            let result = arg.className || arg.subtype || 'Object';

                            if (arg.preview && arg.preview.properties) {
                                const props = arg.preview.properties.map((prop: any) => {
                                    const value = prop.value !== undefined ? prop.value : prop.type;
                                    return `${prop.name}: ${value}`;
                                }).join(', ');
                                result += ` {${props}}`;
                                if (arg.preview.overflow) {
                                    result += ', ...';
                                }
                            } else if (arg.description && arg.description !== 'Object') {
                                result = arg.description;
                            } else if (arg.preview && arg.preview.description) {
                                result = arg.preview.description;
                            }

                            return result;
                        }

                        // Handle functions
                        if (arg.type === 'function') {
                            return arg.description || 'function()';
                        }

                        // Handle undefined, null, etc
                        if (arg.type) {
                            return arg.type;
                        }

                        // Fallback to description
                        return arg.description || 'undefined';
                    }));

                    const message = processedArgs.join(' ');
                    console.log('   📝 Message:', message.substring(0, 200));

                    this.logWriter.write({
                        type: 'console',
                        method: event.type,
                        message: message,
                        timestamp: Date.now()
                    });
                });
                handlerCount++;

                // Runtime.exceptionThrown - captures JavaScript errors
                this.client.on('Runtime.exceptionThrown', (event: any) => {
                    const details = event.exceptionDetails;
                    this.logWriter.write({
                        type: 'error',
                        message: details.text || details.exception?.description || 'JavaScript Error',
                        stack: details.stackTrace,
                        timestamp: Date.now()
                    });
                });
                handlerCount++;


                console.log(`   ✅ Registered ${handlerCount} event handlers`);
                console.log('   Event handlers:', Object.keys(this.client._eventHandlers));
                */

                // NOW enable the CDP domains
                console.log('   Enabling CDP domains...');

                // Enable only necessary domains to prevent duplicates
                await this.client.send('Runtime.enable');  // For console events and execution contexts
                await this.client.send('Page.enable');      // For page lifecycle events (load, navigation)
                // DON'T enable Console, Log, Network - they cause duplicate console messages!

                console.log('   ✅ CDP domains enabled - handlers ready');
                console.log('   ✅ Connected to CEF console via CDP - capturing all output');

                // OPTIONAL: Reload the page to capture from the beginning
                // Uncomment the next lines if you want to force a reload to capture all startup logs
                // console.log('   🔄 Reloading extension to capture from start...');
                // await this.client.send('Page.reload', { ignoreCache: false });

                // Store WebSocket for cleanup
                this.activeWebSocket = ws;

                // Monitor for disconnection and auto-reconnect
                const setupReconnect = () => {
                    // Prevent multiple reconnect attempts
                    if (this.isReconnecting || this.reconnectTimer) {
                        return;
                    }

                    // Check if we've exceeded max attempts
                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        console.log(`   ❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
                        return;
                    }

                    this.reconnectTimer = setTimeout(async () => {
                        // Double-check we're not already reconnecting
                        if (this.isReconnecting) {
                            return;
                        }

                        // Don't reconnect if we've been stopped
                        if (this.activeWebSocket === null) {
                            return;
                        }

                        this.isReconnecting = true;
                        this.reconnectAttempts++;
                        console.log(`   🔄 Auto-reconnecting to CEF debugger... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

                        // On reconnection during the same DevMirror session:
                        // Accept ALL contexts since this is a continuation of the same session.
                        // The extension may have reloaded and gotten a new context ID.
                        console.log('   📌 Reconnecting - will accept all contexts (same DevMirror session)');
                        this.waitingForFreshContext = false;
                        // Clear the stale context list - all contexts are now valid
                        this.initialContextsSeen.clear();
                        // Reset current context to accept the next one we see
                        this.currentContextId = null;

                        try {
                            const reconnected = await this.connectToCEFDebugger(cefPort, config);
                            if (reconnected) {
                                // Reset attempts on successful reconnection
                                this.reconnectAttempts = 0;
                                console.log('   ✅ Successfully reconnected to CEF');

                                // Log reconnection event to file
                                const localTime = new Date().toLocaleTimeString('en-US', {
                                    hour12: false,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    fractionalSecondDigits: 1
                                });
                                this.logWriter.write({
                                    type: 'lifecycle',
                                    message: `${'═'.repeat(80)}\n` +
                                            `║ 🔄 CEF RECONNECTED - Resuming capture\n` +
                                            `║ Local Time: ${localTime}\n` +
                                            `║ All contexts now accepted\n` +
                                            `${'═'.repeat(80)}\n`,
                                    timestamp: Date.now()
                                });

                                // Auto-refresh browser if it was opened
                                if (config?.autoOpenBrowser && config?.cefPort) {
                                    console.log('   🔄 Refreshing browser DevTools...');
                                    await this.openCEFDevTools(config.cefPort, config);
                                }

                                this.isReconnecting = false;
                            } else {
                                // Schedule next attempt
                                this.reconnectTimer = null;
                                this.isReconnecting = false;
                                setupReconnect();
                            }
                        } catch (error) {
                            console.log('   ❌ Reconnection failed:', error);
                            this.reconnectTimer = null;
                            this.isReconnecting = false;
                            setupReconnect();
                        }
                    }, this.reconnectDelay);
                };

                // Monitor WebSocket close
                ws.on('close', () => {
                    // Don't reconnect if we're shutting down or this isn't our active socket
                    if (this.activeWebSocket === null || this.activeWebSocket !== ws) {
                        console.log('   WebSocket closed (shutdown or replaced)');
                        return;
                    }
                    console.log('\n⚠️  CEF WebSocket closed - will auto-reconnect');

                    // Log disconnect event to file
                    if (this.logWriter) {
                        const localTime = new Date().toLocaleTimeString('en-US', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            fractionalSecondDigits: 1
                        });
                        this.logWriter.write({
                            type: 'lifecycle',
                            message: `${'═'.repeat(80)}\n` +
                                    `║ ⚠️  CEF DISCONNECTED\n` +
                                    `║ Local Time: ${localTime}\n` +
                                    `${'═'.repeat(80)}\n`,
                            timestamp: Date.now()
                        });
                    }

                    // Clean up current connection
                    if (this.client) {
                        this.client.removeAllListeners?.();
                        this.client = null;
                    }

                    setupReconnect();
                });

                ws.on('error', (error: any) => {
                    // Don't reconnect if we're shutting down or this isn't our active socket
                    if (this.activeWebSocket === null || this.activeWebSocket !== ws) {
                        return;
                    }
                    console.log('\n⚠️  CEF WebSocket error:', error.message);

                    // Clean up current connection
                    if (this.client) {
                        this.client.removeAllListeners?.();
                        this.client = null;
                    }

                    setupReconnect();
                });

                // Keep essential monitoring handlers (not for console capture)
                /* These would need special handling since they're not console events
                this.client.on('sessionDetached', () => {
                    console.log('\n⚠️  CEF CDP session detached - reconnecting...');
                    this.client = null;
                    setupReconnect();
                });
                */

                console.log('   ✅ Auto-reconnect configured');

                return true;

            } catch (cdpError: any) {
                console.log('   CDP connection error:', cdpError.message);
                return false;
            }

        } catch (error: any) {
            console.log('   Could not connect to CEF debugger:', error.message);

            // Don't auto-retry here if we're already in a reconnect loop
            if (!this.isReconnecting) {
                // Only retry if this is the initial connection attempt
                setTimeout(() => {
                    this.connectToCEFDebugger(cefPort, config);
                }, 5000);
            }

            return false;
        }
    }
}