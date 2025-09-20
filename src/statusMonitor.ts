import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class StatusMonitor {
    private statusBarItem: vscode.StatusBarItem;
    private logCount: number = 0;
    private startTime: Date | null = null;
    private updateInterval: NodeJS.Timeout | null = null;
    private logFilePath: string | null = null;
    private lastSize: number = 0;
    private watchInterval: NodeJS.Timeout | null = null;
    private currentWorkspacePath: string | null = null;
    private isRunning: boolean = false;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'devmirror.showLogs';
        this.statusBarItem.text = 'DevMirror';
        this.statusBarItem.tooltip = 'DevMirror - Click to view logs';
        this.statusBarItem.show();  // Always show the status bar

        // Start watching for CLI instances
        this.startWatching();
    }

    private startWatching(): void {
        // Check every 1 second for CLI status files (reduced for faster response)
        this.watchInterval = setInterval(() => {
            this.checkForCLIInstances();
        }, 1000);

        // Check immediately
        this.checkForCLIInstances();
    }

    private async checkForCLIInstances(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        let foundActive = false;
        for (const folder of workspaceFolders) {
            const statusPath = path.join(folder.uri.fsPath, 'devmirror-logs', '.devmirror-status.json');
            try {
                const stats = fs.statSync(statusPath);
                // Check if file is recent (updated in last 3 seconds for faster detection)
                if (Date.now() - stats.mtimeMs < 3000) {
                    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                    foundActive = true;

                    // Start monitoring if not already running for this workspace
                    if (!this.isRunning || this.currentWorkspacePath !== folder.uri.fsPath) {
                        this.startFromCLI(folder.uri.fsPath, statusData.startTime);
                    }
                    break;
                }
            } catch (error) {
                // Status file doesn't exist or is old
                console.log('Error checking status file:', error);
            }
        }

        // No active CLI instances found
        if (!foundActive && this.updateInterval) {
            this.stop();
        }
    }

    private startFromCLI(workspacePath: string, startTimeMs: number): void {
        this.startTime = new Date(startTimeMs);
        this.logCount = 0;
        this.lastSize = 0;
        this.currentWorkspacePath = workspacePath;
        this.isRunning = true;

        const logDir = path.join(workspacePath, 'devmirror-logs');
        const currentLogPath = path.join(logDir, 'current.log');
        this.logFilePath = currentLogPath;

        this.statusBarItem.text = '🟢 DevMirror: Starting...';
        this.statusBarItem.show();

        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update every second
        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 1000);

        this.updateStatus();
    }

    start(workspacePath: string): void {
        this.startTime = new Date();
        this.logCount = 0;
        this.lastSize = 0;
        this.currentWorkspacePath = workspacePath;
        this.isRunning = true;

        const logDir = path.join(workspacePath, 'devmirror-logs');
        const currentLogPath = path.join(logDir, 'current.log');
        this.logFilePath = currentLogPath;

        this.statusBarItem.text = '🟢 DevMirror: Starting...';
        this.statusBarItem.show();

        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update every second
        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 1000);

        this.updateStatus();
    }

    getCurrentWorkspacePath(): string | null {
        return this.currentWorkspacePath;
    }

    private updateStatus(): void {
        if (!this.startTime || !this.logFilePath) return;

        // Calculate elapsed time
        const elapsed = Date.now() - this.startTime.getTime();
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
            if (fs.existsSync(this.logFilePath)) {
                const stats = fs.statSync(this.logFilePath);
                if (stats.size !== this.lastSize) {
                    const content = fs.readFileSync(this.logFilePath, 'utf8');
                    const lines = content.split('\n').filter(line => line.trim());
                    // Count actual log entries (lines starting with [)
                    this.logCount = lines.filter(line => line.startsWith('[')).length;
                    this.lastSize = stats.size;
                }
            }
        } catch (error) {
            // Ignore errors when reading log file
        }

        this.statusBarItem.text = `🟢 DevMirror | ${this.logCount} logs | ${timeString}`;
        this.statusBarItem.tooltip = `DevMirror Active\nWorkspace: ${path.basename(this.currentWorkspacePath || '')}\nLogs: ${this.logCount}\nRunning: ${timeString}\nClick to open log file`;
    }

    stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.statusBarItem.text = 'DevMirror';
        this.statusBarItem.tooltip = 'DevMirror - Click to start capture';
        this.statusBarItem.show();
        this.startTime = null;
        this.logCount = 0;
        this.currentWorkspacePath = null;
        this.isRunning = false;
    }

    dispose(): void {
        this.stop();
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        this.statusBarItem.dispose();
    }
}