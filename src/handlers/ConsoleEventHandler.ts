import { LogWriter } from '../logWriter';
import { DevMirrorConfig } from '../configHandler';

export class ConsoleEventHandler {
    private logWriter: LogWriter;
    private config: DevMirrorConfig;

    constructor(logWriter: LogWriter, config: DevMirrorConfig) {
        this.logWriter = logWriter;
        this.config = config;
    }

    /**
     * Process console events from Runtime.consoleAPICalled
     */
    handleConsoleAPI(params: any): void {
        if (!this.logWriter) {
            console.log('   ⚠️ LogWriter not ready for console event');
            return;
        }

        try {
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

            // Convert all arguments to strings
            const message = this.formatArguments(args);

            // Add full stack trace if available - capture for ALL messages to match browser behavior
            let fullMessage = source + message;
            if (params.stackTrace?.callFrames?.length > 1) {
                // Skip first frame as it's already in source
                const stackTrace = this.formatStackTrace(params.stackTrace, true);
                if (stackTrace) {
                    fullMessage += '\n' + stackTrace;
                }
            }

            // Only write if we have a message
            if (fullMessage.trim()) {
                // Map console types to LogWriter types
                const logType = type === 'log' || type === 'info' || type === 'warn' ? 'console' :
                               type === 'error' ? 'error' :
                               type === 'debug' ? 'debug' : 'console';

                this.logWriter.write({
                    type: logType,
                    method: type, // Pass the original console method (log, warn, error, etc.)
                    message: source + message, // Just the core message without stack trace
                    stack: params.stackTrace?.callFrames?.length > 1 ? this.formatStackTrace(params.stackTrace, true) : undefined,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.log('   Error capturing console event:', error);
        }
    }

    /**
     * Process runtime exceptions
     */
    handleExceptionThrown(details: any): void {
        if (!this.logWriter) return;

        const exception = details.exception;
        let message = 'Uncaught exception';

        if (exception) {
            if (exception.description) {
                message = exception.description;
            } else if (exception.value) {
                message = String(exception.value);
            }
        }

        // Add stack trace if available
        if (details.stackTrace?.callFrames?.length > 0) {
            const frames = details.stackTrace.callFrames
                .slice(0, 5)
                .map((frame: any) => {
                    const fileName = frame.url ? frame.url.split('/').pop() : 'unknown';
                    return `    at ${frame.functionName || '<anonymous>'} (${fileName}:${frame.lineNumber}:${frame.columnNumber})`;
                })
                .join('\n');
            message += '\n' + frames;
        }

        this.logWriter.write({
            type: 'error',
            message: message,
            timestamp: Date.now()
        });
    }

    /**
     * Process Log.entryAdded events
     */
    handleLogEntry(params: any): void {
        if (!this.logWriter) return;

        const entry = params.entry;
        const level = entry.level || 'verbose';
        const source = entry.source || 'other';


        // Skip certain log sources to avoid noise
        if (source === 'security') {
            return;
        }

        // Skip deprecation warnings unless explicitly enabled
        // Note: Shadow DOM warnings come as source="other", not source="deprecation"
        const isDeprecationWarning = (source === 'deprecation') ||
                                    (source === 'other' && entry.text?.toLowerCase().includes('declarative shadowrootmode'));

        if (isDeprecationWarning && !this.config.captureDeprecationWarnings) {
            return;
        }

        const typeMap: { [key: string]: any } = {
            'verbose': 'debug',
            'info': 'console',
            'warning': 'console',
            'error': 'error'
        };

        const type = typeMap[level] || 'console';

        // Build message with stack trace if available
        let fullMessage = `[${source.toUpperCase()}] ${entry.text}`;

        // Add stack trace for Log.entryAdded events (similar to Runtime.consoleAPICalled)
        if (entry.stackTrace?.callFrames?.length > 0) {
            const stackTrace = this.formatStackTrace(entry.stackTrace, false);
            if (stackTrace) {
                fullMessage += '\n' + stackTrace;
            }
        }

        this.logWriter.write({
            type: type,
            source: source,
            message: entry.text, // Just the core message text
            stack: entry.stackTrace?.callFrames?.length > 0 ? this.formatStackTrace(entry.stackTrace, false) : undefined,
            timestamp: Date.now()
        });
    }

    /**
     * Format console arguments into a string
     */
    private formatArguments(args: any[]): string {
        return args.map((arg: any) => {
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
                        const formatted = JSON.stringify(obj, null, 2);
                        const lines = formatted.split('\n');
                        // Add 2 spaces to ALL lines except first for proper indentation
                        const indented = lines.map((line, i) => {
                            return i === 0 ? line : '  ' + line;
                        }).join('\n');
                        return indented;
                    } catch {
                        // If parsing fails, return as-is
                        return arg.description;
                    }
                }
                return arg.description;
            }

            // Handle functions
            if (arg.type === 'function') {
                return '[Function' + (arg.className ? `: ${arg.className}` : '') + ']';
            }

            // Handle undefined
            if (arg.type === 'undefined') {
                return 'undefined';
            }

            // Handle symbols
            if (arg.type === 'symbol') {
                return arg.description || 'Symbol()';
            }

            // Fallback to type
            return `[${arg.type}]`;
        }).join(' ');
    }

    /**
     * Format a stack trace from CDP format
     */
    private formatStackTrace(stackTrace: any, skipFirst: boolean = false): string {
        if (!stackTrace?.callFrames || stackTrace.callFrames.length === 0) {
            return '';
        }

        const frames = skipFirst ? stackTrace.callFrames.slice(1) : stackTrace.callFrames;

        return frames
            .map((frame: any) => {
                const functionName = frame.functionName || '<anonymous>';
                const fileName = frame.url ? frame.url.split('/').pop() : 'unknown';
                const lineNumber = frame.lineNumber !== undefined ? frame.lineNumber : '?';
                const columnNumber = frame.columnNumber !== undefined ? frame.columnNumber : '?';

                // Format similar to browser console
                return `    at ${functionName} (${fileName}:${lineNumber}:${columnNumber})`;
            })
            .join('\n');
    }
}