import * as vscode from 'vscode';
import * as path from 'path';

interface ActiveSession {
    path: string;
    pid: number;
    url: string;
    logDir: string;
    startTime: number;
    logCount: number;
    lastSize: number;
}

type LogChangeCallback = () => void;

export class StatusMonitor {
    private statusBarItem: vscode.StatusBarItem;
    private activeSession: ActiveSession | null = null;
    private updateInterval: NodeJS.Timeout | null = null;
    private pidCheckInterval: NodeJS.Timeout | null = null;
    private onLogChangeCallback: LogChangeCallback | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'devmirror.showLogs';
        this.statusBarItem.text = 'DevMirror';
        this.statusBarItem.tooltip = 'DevMirror - Click to view logs';
        this.statusBarItem.hide(); // Hide by default
    }

    activate(args: { path: string; pid: number; url: string; logDir: string }): void {
        console.log(`[DevMirror] StatusMonitor.activate called with:`, args);

        // Check if this activation is for the current workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('[DevMirror] No workspace folders found');
            return;
        }

        // Check if any workspace folder matches or contains the activated path
        const isForThisWorkspace = workspaceFolders.some(folder => {
            const folderPath = folder.uri.fsPath;
            // Normalize paths for comparison (remove trailing slashes)
            const normalizedFolder = path.normalize(folderPath).toLowerCase().replace(/[\/\\]+$/, '');
            const normalizedArgPath = path.normalize(args.path).toLowerCase().replace(/[\/\\]+$/, '');

            // Log the comparison for debugging
            console.log(`[DevMirror] Comparing paths:
  Workspace: ${normalizedFolder}
  Activated: ${normalizedArgPath}
  Match: ${normalizedArgPath === normalizedFolder || normalizedArgPath.startsWith(normalizedFolder + path.sep) || normalizedFolder.startsWith(normalizedArgPath + path.sep)}`);

            return normalizedArgPath === normalizedFolder ||
                   normalizedArgPath.startsWith(normalizedFolder + path.sep) ||
                   normalizedFolder.startsWith(normalizedArgPath + path.sep);
        });

        if (!isForThisWorkspace) {
            console.log(`[DevMirror] Ignoring activation for ${args.path} - not in this workspace`);
            return;
        }

        // If we already have an active session with the same path, just update the PID
        if (this.activeSession && this.activeSession.path === args.path) {
            this.activeSession.pid = args.pid;
            console.log(`Updated DevMirror session for ${args.path} with PID ${args.pid}`);
            return;
        }

        // Set up new session
        this.activeSession = {
            path: args.path,
            pid: args.pid,
            url: args.url,
            logDir: args.logDir,
            startTime: Date.now(),
            logCount: 0,
            lastSize: 0
        };

        console.log(`DevMirror activated for ${args.path} with PID ${args.pid}`);

        // Start monitoring
        this.startMonitoring();
    }

    private startMonitoring(): void {
        if (!this.activeSession) return;

        // Clear any existing intervals
        this.stopMonitoring();

        // Update status bar every second
        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 1000);

        // Check if process is still running every 2 seconds
        this.pidCheckInterval = setInterval(() => {
            if (this.activeSession && !this.isProcessRunning(this.activeSession.pid)) {
                console.log(`Process ${this.activeSession.pid} has stopped`);
                this.stop();
            }
        }, 2000);

        // Show the status bar
        this.statusBarItem.show();
        this.updateStatus();
    }

    private stopMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.pidCheckInterval) {
            clearInterval(this.pidCheckInterval);
            this.pidCheckInterval = null;
        }
    }

    private isProcessRunning(pid: number): boolean {
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private updateStatus(): void {
        if (!this.activeSession) return;

        const elapsed = Date.now() - this.activeSession.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const timeString = hours > 0
            ? `${hours}h ${minutes}m ${seconds}s`
            : minutes > 0
            ? `${minutes}m ${seconds}s`
            : `${seconds}s`;

        // Count log lines
        try {
            const fs = require('fs');
            const logPath = path.join(this.activeSession.logDir, 'current.log');

            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                if (stats.size !== this.activeSession.lastSize) {
                    const content = fs.readFileSync(logPath, 'utf8');
                    const lines = content.split('\n').filter((line: string) => line.trim());
                    // Count actual log entries (lines starting with [)
                    const newLogCount = lines.filter((line: string) => line.startsWith('[')).length;

                    // Trigger callback if log count changed
                    if (newLogCount !== this.activeSession.logCount && this.onLogChangeCallback) {
                        this.onLogChangeCallback();
                    }

                    this.activeSession.logCount = newLogCount;
                    this.activeSession.lastSize = stats.size;
                }
            }
        } catch (error) {
            // Ignore errors when reading log file
        }

        // Show which package is active
        const packageName = path.basename(this.activeSession.path);

        this.statusBarItem.text = `🟢 DevMirror | ${packageName} | ${this.activeSession.logCount} logs | ${timeString}`;
        this.statusBarItem.tooltip = `DevMirror Active
Package: ${this.activeSession.path}
URL: ${this.activeSession.url}
PID: ${this.activeSession.pid}
Logs: ${this.activeSession.logCount}
Running: ${timeString}
Click to open log file`;
    }

    stop(): void {
        this.stopMonitoring();
        this.statusBarItem.hide();
        this.activeSession = null;
        console.log('DevMirror stopped');
    }

    start(workspacePath: string): void {
        // This is called when manually starting from command
        // In the new architecture, activation happens via the activate command
        console.log('Manual start requested for:', workspacePath);
    }

    getCurrentLogPath(): string | null {
        if (!this.activeSession) return null;
        return path.join(this.activeSession.logDir, 'current.log');
    }

    getCurrentWorkspacePath(): string | null {
        return this.activeSession?.path || null;
    }

    onLogChange(callback: LogChangeCallback): void {
        this.onLogChangeCallback = callback;
    }

    dispose(): void {
        this.stop();
        this.statusBarItem.dispose();
    }
}