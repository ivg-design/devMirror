import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';

export interface LogEntry {
    type: 'console' | 'error' | 'network' | 'browser' | 'lifecycle' | 'suppressed' | 'debug';
    method?: string;
    level?: string;
    message: string;
    stack?: any;
    url?: string;
    source?: string;
    timestamp: number;
    count?: number;
}

export class LogWriter {
    private writeStream: WriteStream | null = null;
    private currentLogPath: string = '';
    private logSize: number = 0;
    private readonly MAX_LOG_SIZE = 50 * 1024 * 1024; // 50MB

    constructor(private outputDir: string) {}

    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create output directory:', error);
        }

        await this.createNewLogFile();
    }

    private async createNewLogFile(): Promise<void> {
        if (this.writeStream) {
            this.writeStream.end();
        }

        const date = new Date();
        // Format filename: YYYY-MM-DD-HHMMSS.log (local time)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        const timestamp = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
        this.currentLogPath = path.join(this.outputDir, `${timestamp}.log`);
        this.writeStream = createWriteStream(this.currentLogPath, { flags: 'a' });
        this.logSize = 0;

        const currentSymlink = path.join(this.outputDir, 'current.log');
        try {
            await fs.unlink(currentSymlink);
        } catch {}

        try {
            await fs.symlink(path.basename(this.currentLogPath), currentSymlink);
        } catch (error) {
            console.log('Could not create symlink (may not be supported on Windows)');
        }

        this.write({
            type: 'lifecycle',
            message: '════════════ DevMirror Session Started ════════════',
            timestamp: Date.now()
        });
    }

    write(entry: LogEntry): void {
        if (!this.writeStream) {
            this.initialize();
            return;
        }

        const formattedEntry = this.formatEntry(entry);
        const entrySize = Buffer.byteLength(formattedEntry);

        if (this.logSize + entrySize > this.MAX_LOG_SIZE) {
            this.createNewLogFile();
        }

        this.writeStream.write(formattedEntry + '\n');
        this.logSize += entrySize;
    }

    private formatEntry(entry: LogEntry): string {
        const date = new Date(entry.timestamp);

        // Format: yymmddThh:mm:ss.ms (two digit milliseconds)
        const year = String(date.getFullYear()).slice(-2);  // Last 2 digits of year
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ms = String(Math.floor(date.getMilliseconds() / 10)).padStart(2, '0'); // Two digits (00-99)

        const timestamp = `${year}${month}${day}T${hours}:${minutes}:${seconds}.${ms}`;
        const prefix = `[${timestamp}]`;

        let typeLabel = entry.type.toUpperCase();
        if (entry.type === 'console' && entry.method) {
            // Drop the CONSOLE: prefix, just use the method
            typeLabel = entry.method.toUpperCase();
        } else if (entry.type === 'network') {
            typeLabel = 'NETWORK:ERROR';
        } else if (entry.type === 'browser' && entry.level) {
            typeLabel = `BROWSER:${entry.level.toUpperCase()}`;
        }

        // Handle multi-line messages with proper indentation
        const logPrefix = `${prefix} [${typeLabel}] `;
        const prefixLength = logPrefix.length;

        // Split the message into lines and indent continuation lines
        const messageLines = entry.message.split('\n');
        const indentedMessage = messageLines.map((line, index) => {
            if (index === 0) {
                return line;  // First line stays as-is
            }
            // Indent continuation lines to align with the start of the message
            return ' '.repeat(prefixLength) + line;
        }).join('\n');

        let message = logPrefix + indentedMessage;

        if (entry.count && entry.count > 1) {
            message += ` (×${entry.count})`;
        }

        if (entry.url) {
            message += `\n    URL: ${entry.url}`;
        }

        if (entry.source) {
            message += `\n    Source: ${entry.source}`;
        }

        if (entry.stack) {
            const stackTrace = this.formatStackTrace(entry.stack);
            if (stackTrace) {
                message += `\n${stackTrace}`;
            }
        }

        return message;
    }

    private formatStackTrace(stack: any): string {
        if (!stack) return '';

        if (typeof stack === 'string') {
            return stack.split('\n')
                .map(line => `    ${line}`)
                .join('\n');
        }

        if (Array.isArray(stack)) {
            return stack
                .map(frame => {
                    if (frame.functionName && frame.url && frame.lineNumber) {
                        return `    at ${frame.functionName} (${frame.url}:${frame.lineNumber}:${frame.columnNumber || 0})`;
                    }
                    return `    at ${frame.url || 'unknown'}`;
                })
                .join('\n');
        }

        if (stack.callFrames && Array.isArray(stack.callFrames)) {
            return this.formatStackTrace(stack.callFrames);
        }

        return '';
    }

    async close(): Promise<void> {
        if (this.writeStream) {
            this.write({
                type: 'lifecycle',
                message: '════════════ DevMirror Session Ended ════════════',
                timestamp: Date.now()
            });

            return new Promise((resolve) => {
                if (this.writeStream) {
                    this.writeStream.end(() => resolve());
                } else {
                    resolve();
                }
            });
        }
    }
}