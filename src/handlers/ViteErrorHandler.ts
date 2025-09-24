import { LogWriter } from '../logWriter';
import { DevMirrorConfig } from '../configHandler';

export class ViteErrorHandler {
    private logWriter: LogWriter;
    private config: DevMirrorConfig;

    constructor(logWriter: LogWriter, config: DevMirrorConfig) {
        this.logWriter = logWriter;
        this.config = config;
    }

    /**
     * Process console errors that may be Vite-related
     */
    handleConsoleError(message: string, source?: string): void {
        if (!this.config.captureViteErrors) return;

        // Check if this looks like a Vite error
        if (this.isViteError(message)) {
            this.logWriter.write({
                type: 'error',
                source: 'vite',
                message: `🔥 VITE ERROR: ${message}`,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Process network errors that may be Vite module loading failures
     */
    handleNetworkError(url: string, status: number, statusText: string): void {
        if (!this.config.captureViteErrors) return;

        // Check if this is a module loading failure
        if (this.isViteModuleError(url, status)) {
            this.logWriter.write({
                type: 'error',
                source: 'vite',
                message: `🔥 VITE MODULE ERROR: Failed to load ${url} (${status} ${statusText})`,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Process log entries for Vite build errors
     */
    handleLogEntry(level: string, source: string, text: string): void {
        if (!this.config.captureViteErrors) return;

        // Check if this is a Vite build error from browser
        if (this.isViteBuildError(text)) {
            this.logWriter.write({
                type: 'error',
                source: 'vite',
                message: `🔥 VITE BUILD ERROR: ${text}`,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Detect if a console message is a Vite error
     */
    private isViteError(message: string): boolean {
        const viteErrorPatterns = [
            /Failed to resolve import/i,
            /\[vite\].*error/i,
            /Cannot resolve dependency/i,
            /Transform failed with \d+ errors?/i,
            /Build failed with \d+ errors?/i,
            /Internal server error/i,
            /Failed to parse source for import analysis/i,
            /The requested module.*does not provide an export/i
        ];

        return viteErrorPatterns.some(pattern => pattern.test(message));
    }

    /**
     * Detect if a network error is a Vite module loading failure
     */
    private isViteModuleError(url: string, status: number): boolean {
        // Common Vite module loading patterns
        const isModule = url.includes('/@modules/') ||
                        url.includes('/@fs/') ||
                        url.includes('/@id/') ||
                        url.endsWith('.js?v=') ||
                        url.endsWith('.ts?v=') ||
                        url.endsWith('.vue?v=');

        // 404s and 500s on module requests are likely Vite errors
        return isModule && (status === 404 || status === 500);
    }

    /**
     * Detect if a log entry is a Vite build error
     */
    private isViteBuildError(text: string): boolean {
        const viteBuildErrorPatterns = [
            /vite.*build.*failed/i,
            /rollup.*error/i,
            /esbuild.*error/i,
            /syntax error.*in.*\.(js|ts|vue|jsx|tsx)/i,
            /module not found/i,
            /cannot resolve module/i
        ];

        return viteBuildErrorPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check if DevMirror is running against a Vite development server
     */
    isViteDevServer(url?: string): boolean {
        if (!url) return false;

        // Check for common Vite dev server ports and patterns
        const vitePatterns = [
            /:5173\b/,  // Default Vite port
            /:3000\b/,  // Common alt port
            /:8080\b/,  // Another common port
            /localhost.*vite/i,
            /127\.0\.0\.1.*vite/i
        ];

        return vitePatterns.some(pattern => pattern.test(url));
    }
}