import * as fs from 'fs/promises';
import * as path from 'path';

export interface DevMirrorConfig {
    url?: string;  // Optional - can be auto-detected
    outputDir: string;
    chromePath?: string;
    mode: 'cdp' | 'cef';
    cefPort?: number;
    autoDetectPort?: boolean;  // Auto-detect running dev server
    autoOpenBrowser?: boolean;  // Auto-open browser in CEF mode
    captureDeprecationWarnings?: boolean;  // Capture browser deprecation warnings (Shadow DOM, etc.)
    throttle?: {
        maxPerSecond: number;
        suppressAfter: number;
    };
    debug?: {
        enabled: boolean;
        logRawCDP?: boolean;  // Log raw CDP data for debugging
        logExceptions?: boolean;  // Log detailed exception data
        logConsoleAPI?: boolean;  // Log raw console API calls
        logLogEntries?: boolean;  // Log raw Log.entryAdded events
        logToFile?: boolean;  // Save debug logs to current.log
        logToConsole?: boolean;  // Output debug logs to VS Code Developer Tools console (default: true)
    };
}

export class ConfigHandler {
    private configPath: string;
    private defaultConfig: DevMirrorConfig = {
        url: 'http://localhost:3000',
        outputDir: './devmirror-logs',
        mode: 'cdp',
        // For CEF mode, uncomment and set your debug port:
        // mode: 'cef',
        // cefPort: 8860,  // Your CEF debug port from .debug file
        captureDeprecationWarnings: true,
        throttle: {
            maxPerSecond: 100,
            suppressAfter: 100
        },
        debug: {
            enabled: false,  // Set to true to enable debug logging
            logRawCDP: false,  // Log all raw CDP data
            logExceptions: false,  // Log detailed exception data
            logConsoleAPI: false,  // Log raw console API calls
            logLogEntries: false,  // Log raw Log.entryAdded events
            logToFile: false  // Save debug logs to debug.log
        }
    };

    constructor(private rootPath: string) {
        this.configPath = path.join(rootPath, 'devmirror.config.json');
    }

    async initialize(): Promise<void> {
        try {
            await fs.access(this.configPath);
            console.log('Config file already exists');
        } catch {
            await this.createDefaultConfig();
        }
    }

    private async createDefaultConfig(): Promise<void> {
        const config = await this.detectConfiguration();
        await fs.writeFile(
            this.configPath,
            JSON.stringify(config, null, 2),
            'utf8'
        );
    }

    private async detectConfiguration(): Promise<DevMirrorConfig> {
        const config = { ...this.defaultConfig };

        try {
            const packageJsonPath = path.join(this.rootPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

            const scripts = packageJson.scripts || {};
            const devScript = scripts.dev || scripts.start || '';

            const portMatch = devScript.match(/--port[= ](\d+)/);
            if (portMatch) {
                const port = portMatch[1];
                config.url = `http://localhost:${port}`;
            } else {
                if (devScript.includes('vite')) {
                    config.url = 'http://localhost:5173';
                } else if (devScript.includes('webpack')) {
                    config.url = 'http://localhost:8080';
                } else if (devScript.includes('next')) {
                    config.url = 'http://localhost:3000';
                }
            }
        } catch (error) {
            console.log('Could not detect configuration from package.json');
        }

        return config;
    }

    async load(): Promise<DevMirrorConfig> {
        try {
            const content = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(content);
        } catch {
            await this.initialize();
            return this.load();
        }
    }

    static async load(configPath: string): Promise<DevMirrorConfig> {
        const rootPath = path.dirname(configPath);
        const handler = new ConfigHandler(rootPath);
        return handler.load();
    }

    /**
     * Merge VS Code settings with config file settings
     */
    static mergeWithVSCodeSettings(config: DevMirrorConfig, vscodeConfig: any): DevMirrorConfig {
        return {
            ...config,
            captureDeprecationWarnings: vscodeConfig.get('devmirror.captureDeprecationWarnings', config.captureDeprecationWarnings)
        };
    }
}