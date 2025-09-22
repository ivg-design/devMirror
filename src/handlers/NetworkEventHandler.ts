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
            this.logWriter.write({
                type: 'network',
                message: `HTTP ${event.response.status}: ${event.response.statusText}`,
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

        this.logWriter.write({
            type: 'network',
            message: `Request failed: ${errorText}`,
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
}