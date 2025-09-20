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

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'devmirror.showLogs';
    }

    start(workspacePath: string): void {
        this.startTime = new Date();
        this.logCount = 0;
        this.lastSize = 0;

        const logDir = path.join(workspacePath, 'devmirror-logs');
        const currentLogPath = path.join(logDir, 'current.log');
        this.logFilePath = currentLogPath;

        this.statusBarItem.text = '🔴 DevMirror: Starting...';
        this.statusBarItem.show();

        // Update every second
        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 1000);

        this.updateStatus();
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

        this.statusBarItem.text = `🔴 DevMirror | ${this.logCount} logs | ${timeString}`;
        this.statusBarItem.tooltip = `DevMirror Active\nLogs: ${this.logCount}\nRunning: ${timeString}\nClick to open log file`;
    }

    stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.statusBarItem.text = '🔴 DevMirror';
        this.statusBarItem.tooltip = 'DevMirror - Click to setup';
        this.startTime = null;
        this.logCount = 0;
    }

    dispose(): void {
        this.stop();
        this.statusBarItem.dispose();
    }
}