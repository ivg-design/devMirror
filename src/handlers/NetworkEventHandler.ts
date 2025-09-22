import { LogWriter } from '../logWriter';

export class NetworkEventHandler {
    private logWriter: LogWriter;

    constructor(logWriter: LogWriter) {
        this.logWriter = logWriter;
    }

    /**
     * Handle network loading failures
     */
    handleLoadingFailed(event: any): void {
        const errorText = event.errorText || 'Unknown error';
        const blockedReason = event.blockedReason;

        let message = `Failed to load: ${errorText}`;
        if (blockedReason) {
            message += ` (Blocked: ${blockedReason})`;
        }

        // Add initiator stack trace if available
        const stackTrace = this.formatInitiatorStackTrace(event.initiator);
        if (stackTrace) {
            message += '\n' + stackTrace;
        }

        this.logWriter.write({
            type: 'network',
            message: message,
            url: `Request ID: ${event.requestId}`,
            timestamp: Date.now()
        });
    }

    /**
     * Handle network responses (for errors)
     */
    handleResponseReceived(event: any): void {
        if (event.response.status >= 400) {
            let message = `HTTP ${event.response.status}: ${event.response.statusText}`;

            // Add initiator stack trace if available
            const stackTrace = this.formatInitiatorStackTrace(event.initiator);
            if (stackTrace) {
                message += '\n' + stackTrace;
            }

            this.logWriter.write({
                type: 'network',
                message: message,
                url: event.response.url,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Handle request failures
     */
    handleRequestFailed(event: any): void {
        const errorText = event.errorText || 'Unknown error';
        const url = event.request?.url || 'Unknown URL';
        let message = `Request failed: ${errorText}`;

        // Add initiator stack trace if available
        const stackTrace = this.formatInitiatorStackTrace(event.initiator);
        if (stackTrace) {
            message += '\n' + stackTrace;
        }

        this.logWriter.write({
            type: 'network',
            message: message,
            url: url,
            timestamp: Date.now()
        });
    }

    /**
     * Handle certificate errors
     */
    handleCertificateError(event: any): void {
        this.logWriter.write({
            type: 'network',
            message: `Certificate error: ${event.errorType}`,
            url: event.requestURL,
            timestamp: Date.now()
        });
    }

    /**
     * Handle security state changes
     */
    handleSecurityStateChanged(event: any): void {
        if (event.securityState === 'insecure') {
            const explanations = event.explanations || [];
            const messages = explanations.map((e: any) => e.summary).join(', ');
            if (messages) {
                this.logWriter.write({
                    type: 'network',
                    message: `Security warning: ${messages}`,
                    timestamp: Date.now()
                });
            }
        }
    }

    /**
     * Format the initiator stack trace from CDP format
     */
    private formatInitiatorStackTrace(initiator: any): string | null {
        if (!initiator) return null;

        // Check if initiator has a stack trace
        if (initiator.stack?.callFrames?.length > 0) {
            const frames = initiator.stack.callFrames;
            return frames.map((frame: any) => {
                const functionName = frame.functionName || '<anonymous>';
                const fileName = frame.url ? frame.url.split('/').pop() : 'unknown';
                const lineNumber = frame.lineNumber !== undefined ? frame.lineNumber + 1 : '?';  // CDP uses 0-based line numbers
                const columnNumber = frame.columnNumber !== undefined ? frame.columnNumber + 1 : '?';

                // Format to match browser console style
                return `    at ${functionName} (${fileName}:${lineNumber}:${columnNumber})`;
            }).join('\n');
        }

        // If no stack trace but has line/column info
        if (initiator.lineNumber !== undefined) {
            const fileName = initiator.url ? initiator.url.split('/').pop() : 'unknown';
            return `    at <anonymous> (${fileName}:${initiator.lineNumber + 1}:${(initiator.columnNumber || 0) + 1})`;
        }

        return null;
    }
}