import { LogWriter } from '../logWriter';
import { DevMirrorConfig } from '../configHandler';

export class ConsoleEventHandler {
    private logWriter: LogWriter;
    private config: DevMirrorConfig;
    private debugLog: (category: string, message: string, data?: any) => void;

    constructor(logWriter: LogWriter, config: DevMirrorConfig) {
        this.logWriter = logWriter;
        this.config = config;

        // Setup debug logging
        this.debugLog = (category: string, message: string, data?: any) => {
            if (!this.config.debug?.enabled) return;

            const debugConfig = this.config.debug;
            const shouldLog =
                (category === 'exception' && debugConfig.logExceptions) ||
                (category === 'console' && debugConfig.logConsoleAPI) ||
                (category === 'log' && debugConfig.logLogEntries) ||
                (category === 'cdp' && debugConfig.logRawCDP);

            if (shouldLog) {
                const timestamp = new Date().toISOString();
                const output = `[${timestamp}] [DEBUG:${category.toUpperCase()}] ${message}`;
                console.log(output);
                if (data) {
                    console.log(JSON.stringify(data, null, 2));
                }

                // Optionally write to debug file
                if (debugConfig.logToFile && this.logWriter) {
                    this.logWriter.write({
                        type: 'debug',
                        message: `[${category.toUpperCase()}] ${message}\n${data ? JSON.stringify(data, null, 2) : ''}`,
                        timestamp: Date.now()
                    });
                }
            }
        };
    }

    /**
     * Process console events from Runtime.consoleAPICalled
     */
    handleConsoleAPI(params: any): void {
        if (!this.logWriter) {
            console.log('   ⚠️ LogWriter not ready for console event');
            return;
        }

        // Debug logging for raw console API data
        this.debugLog('console', 'Raw Runtime.consoleAPICalled data', params);

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

            // Special handling for console.table()
            let message = '';
            if (type === 'table' && args.length > 0) {
                message = 'console.table() output\n' + this.formatTableData(args[0]);
            } else {
                message = this.formatArguments(args);
            }

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

        // Debug logging for raw exception data
        this.debugLog('exception', 'Raw Runtime.exceptionThrown data', details);

        const exception = details.exception;
        let message = 'Uncaught exception';

        if (exception) {
            if (exception.description) {
                message = exception.description;
            } else if (exception.value) {
                message = String(exception.value);
            }
        }

        // Try to extract file and line info from exception object
        let fileInfo = '';
        if (details.exceptionDetails) {
            const exDetails = details.exceptionDetails;
            if (exDetails.url && exDetails.lineNumber !== undefined) {
                const fileName = exDetails.url.split('/').pop();
                fileInfo = ` (${fileName}:${exDetails.lineNumber}:${exDetails.columnNumber || 0})`;
            } else if (exDetails.scriptId && exDetails.lineNumber !== undefined) {
                fileInfo = ` (script:${exDetails.scriptId}:${exDetails.lineNumber}:${exDetails.columnNumber || 0})`;
            }
        }

        if (fileInfo) {
            message += fileInfo;
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

        // Debug logging for raw Log.entryAdded events
        this.debugLog('logEntries', 'Log.entryAdded raw data:', JSON.stringify(params, null, 2));

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

        // Extract file and line information if available
        let fileInfo = '';
        if (entry.url && entry.lineNumber !== undefined) {
            const fileName = entry.url.split('/').pop() || 'unknown';
            fileInfo = ` (${fileName}:${entry.lineNumber}:${entry.columnNumber || 0})`;
        }

        // Build message with file info and stack trace if available
        let fullMessage = `[${source.toUpperCase()}] ${entry.text}${fileInfo}`;

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
                // Build a proper object structure from preview
                const obj = this.buildObjectFromPreview(arg.preview);

                // Format as indented JSON
                try {
                    const formatted = JSON.stringify(obj, null, 2);

                    // Add class name prefix if it's not a plain object or array
                    if (arg.className && arg.className !== 'Object' && arg.className !== 'Array') {
                        return `${arg.className} ${formatted}`;
                    }

                    return formatted;
                } catch {
                    // Fallback to single line if formatting fails
                    const props = arg.preview.properties
                        .map((p: any) => `${p.name}: ${p.value || p.type}`)
                        .join(', ');
                    const overflow = arg.preview.overflow ? ', ...' : '';
                    return `${arg.className || 'Object'} {${props}${overflow}}`;
                }
            }

            // Handle description (including JSON objects and arrays)
            if (arg.description) {
                // Check if it's a JSON object or array and format it properly
                if ((arg.description.startsWith('{') && arg.description.endsWith('}')) ||
                    (arg.description.startsWith('[') && arg.description.endsWith(']'))) {
                    try {
                        // Parse and re-stringify with proper indentation
                        const obj = JSON.parse(arg.description);
                        return JSON.stringify(obj, null, 2);
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

    /**
     * Format table data for console.table() calls
     */
    private formatTableData(arg: any): string {
        try {
            // Get the actual data from the argument
            let data: any;
            if (arg.preview?.properties) {
                // Build actual object from preview
                data = this.buildObjectFromPreview(arg.preview);
            } else if (arg.value !== undefined) {
                data = arg.value;
            } else if (arg.description) {
                try {
                    data = JSON.parse(arg.description);
                } catch {
                    return arg.description;
                }
            } else {
                return '[Table data not available]';
            }

            // Convert to array if it's an object with numeric keys
            if (!Array.isArray(data) && typeof data === 'object') {
                const keys = Object.keys(data);
                const isArrayLike = keys.every(k => /^\d+$/.test(k));
                if (isArrayLike) {
                    const arr = [];
                    for (const key of keys.sort((a, b) => parseInt(a) - parseInt(b))) {
                        arr.push(data[key]);
                    }
                    data = arr;
                }
            }

            // Format as ASCII table
            if (Array.isArray(data) && data.length > 0) {
                return this.formatAsASCIITable(data);
            } else if (typeof data === 'object' && data !== null) {
                // Single object - format as a simple table
                return this.formatAsASCIITable([data]);
            }

            return JSON.stringify(data, null, 2);
        } catch (error) {
            return `[Error formatting table: ${error}]`;
        }
    }

    /**
     * Build an object from CDP preview data
     */
    private buildObjectFromPreview(preview: any): any {
        const result: any = preview.subtype === 'array' ? [] : {};

        if (preview.properties) {
            for (const prop of preview.properties) {
                const key = /^\d+$/.test(prop.name) ? parseInt(prop.name) : prop.name;

                // IMPORTANT: Check for valuePreview FIRST, before using value
                // When value is "Object", it's just a placeholder - the real data is in valuePreview
                if (prop.valuePreview) {
                    result[key] = this.buildObjectFromPreview(prop.valuePreview);
                } else if (prop.value !== undefined && prop.value !== 'Object') {
                    result[key] = prop.value;
                } else if (prop.type === 'object') {
                    // For nested objects without valuePreview
                    if (prop.preview) {
                        // Try to build from the preview property directly
                        result[key] = this.buildObjectFromPreview(prop.preview);
                    } else {
                        // Build a partial representation from available info
                        const obj: any = {};
                        if (prop.className) obj._type = prop.className;
                        if (prop.description) obj._desc = prop.description;
                        result[key] = obj;
                    }
                } else {
                    // For primitive types without a value, use the type
                    result[key] = prop.type;
                }
            }
        }

        // If there's overflow, add a marker
        if (preview.overflow) {
            result['...'] = 'more items';
        }

        return result;
    }

    /**
     * Format data as an ASCII table
     */
    private formatAsASCIITable(data: any[]): string {
        if (!data || data.length === 0) return '(empty)';

        // Collect all unique keys from all objects
        const allKeys = new Set<string>(['(index)']);
        for (const item of data) {
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(key => allKeys.add(key));
            }
        }

        const columns = Array.from(allKeys);
        const rows: string[][] = [];

        // Build rows
        for (let i = 0; i < data.length; i++) {
            const row: string[] = [String(i)]; // Index column
            const item = data[i];

            for (let j = 1; j < columns.length; j++) {
                const key = columns[j];
                if (typeof item === 'object' && item !== null && key in item) {
                    const value = item[key];
                    if (value === null) {
                        row.push('null');
                    } else if (value === undefined) {
                        row.push('undefined');
                    } else if (typeof value === 'boolean') {
                        row.push(String(value));
                    } else if (typeof value === 'object') {
                        // For objects, try to get a meaningful representation
                        if (value.element) {
                            row.push(value.element);
                        } else {
                            row.push('[Object]');
                        }
                    } else {
                        row.push(String(value));
                    }
                } else {
                    row.push('');
                }
            }
            rows.push(row);
        }

        // Calculate column widths
        const widths = columns.map((col, i) => {
            let maxWidth = col.length;
            for (const row of rows) {
                if (row[i]) {
                    maxWidth = Math.max(maxWidth, String(row[i]).length);
                }
            }
            return Math.min(maxWidth, 30); // Cap at 30 chars
        });

        // Build the table
        let table = '';

        // Header separator
        table += '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';

        // Header
        table += '│';
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const width = widths[i];
            table += ' ' + col.padEnd(width) + ' │';
        }
        table += '\n';

        // Header-body separator
        table += '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';

        // Rows
        for (const row of rows) {
            table += '│';
            for (let i = 0; i < columns.length; i++) {
                const val = row[i] || '';
                const width = widths[i];
                const truncated = val.length > width ? val.substring(0, width - 3) + '...' : val;
                table += ' ' + truncated.padEnd(width) + ' │';
            }
            table += '\n';
        }

        // Bottom border
        table += '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

        // Also include expanded array view with full object content
        table += '\n▸ Array(' + data.length + ')\n';
        for (let i = 0; i < Math.min(data.length, 100); i++) {  // Show more items
            const item = data[i];
            if (typeof item === 'object' && item !== null) {
                // Format the object with proper indentation for folding
                const formatted = JSON.stringify(item, null, 2);
                const lines = formatted.split('\n');
                // First line with index
                table += `  ${i}: ${lines[0]}\n`;
                // Rest of the lines with proper indentation
                for (let j = 1; j < lines.length; j++) {
                    table += `    ${lines[j]}\n`;
                }
            } else {
                table += `  ${i}: ${item}\n`;
            }
        }
        if (data.length > 100) {
            table += `  ... ${data.length - 100} more items\n`;
        }

        return table;
    }
}