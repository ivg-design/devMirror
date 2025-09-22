import { LogWriter } from '../logWriter';

export class PageEventHandler {
    private logWriter: LogWriter;

    constructor(logWriter: LogWriter) {
        this.logWriter = logWriter;
    }

    /**
     * Handle page navigation
     */
    handleFrameNavigated(event: any): void {
        const frame = event.frame;
        if (frame.parentId) return; // Only log main frame navigations

        const url = frame.url;
        if (!url || url === 'about:blank') return;

        this.logWriter.write({
            type: 'lifecycle',
            message: '════════════ Page Navigated ════════════',
            url: url,
            timestamp: Date.now()
        });
    }

    /**
     * Handle DOM content loaded
     */
    handleDomContentEventFired(): void {
        this.logWriter.write({
            type: 'lifecycle',
            message: '════════════ DOM Content Loaded ════════════',
            timestamp: Date.now()
        });
    }

    /**
     * Handle page fully loaded
     */
    handleLoadEventFired(): void {
        this.logWriter.write({
            type: 'lifecycle',
            message: '════════════ Page Loaded ════════════',
            url: '',
            timestamp: Date.now()
        });
    }

    /**
     * Handle page lifecycle state changes
     */
    handleLifecycleEvent(event: any): void {
        const name = event.name;
        const timestamp = event.timestamp;

        // Only log significant lifecycle events
        if (name === 'init' || name === 'firstPaint' || name === 'firstContentfulPaint') {
            this.logWriter.write({
                type: 'lifecycle',
                message: `Page Event: ${name}`,
                timestamp: Math.round(timestamp * 1000)
            });
        }
    }

    /**
     * Handle JavaScript dialogs (alert, confirm, prompt)
     */
    handleJavaScriptDialogOpening(event: any): void {
        const type = event.type;
        const message = event.message;

        this.logWriter.write({
            type: 'lifecycle',
            message: `JavaScript ${type} dialog: ${message}`,
            timestamp: Date.now()
        });
    }

    /**
     * Handle window open requests
     */
    handleWindowOpen(event: any): void {
        const url = event.url;
        const windowName = event.windowName || 'unnamed';

        this.logWriter.write({
            type: 'lifecycle',
            message: `Window opened: ${windowName}`,
            url: url,
            timestamp: Date.now()
        });
    }

    /**
     * Handle frame attached
     */
    handleFrameAttached(event: any): void {
        // Only log iframe attachments, not the main frame
        if (event.parentFrameId) {
            const stack = event.stack;
            if (stack && stack.callFrames && stack.callFrames.length > 0) {
                const frame = stack.callFrames[0];
                const location = `${frame.url}:${frame.lineNumber}`;
                this.logWriter.write({
                    type: 'lifecycle',
                    message: `Iframe attached`,
                    url: location,
                    timestamp: Date.now()
                });
            }
        }
    }

    /**
     * Handle frame detached
     */
    handleFrameDetached(event: any): void {
        // Could be useful for tracking iframe removals
        // Currently not logging to avoid noise
    }

    /**
     * Handle page crash
     */
    handleTargetCrashed(): void {
        this.logWriter.write({
            type: 'error',
            message: '💥 Page crashed!',
            timestamp: Date.now()
        });
    }
}