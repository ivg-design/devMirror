import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { StatusMonitor } from './statusMonitor';

export class DevMirrorLauncher {
    private process: ChildProcess | null = null;
    private outputChannel: vscode.OutputChannel;
    private statusMonitor: StatusMonitor;
    private context: vscode.ExtensionContext;

    constructor(outputChannel: vscode.OutputChannel, statusMonitor: StatusMonitor, context: vscode.ExtensionContext) {
        this.outputChannel = outputChannel;
        this.statusMonitor = statusMonitor;
        this.context = context;
    }

    async start(workspacePath: string): Promise<void> {
        if (this.process) {
            vscode.window.showWarningMessage('DevMirror is already running');
            return;
        }

        // Get CLI path from global state (set in extension activation)
        const cliPath = this.context.globalState.get<string>('devmirror.cliPath');

        if (!cliPath) {
            vscode.window.showErrorMessage('DevMirror CLI path not found. Please restart VS Code.');
            return;
        }

        this.outputChannel.show();
        this.outputChannel.appendLine('Starting DevMirror capture...');

        // Start the CLI process
        this.process = spawn('node', [cliPath], {
            cwd: workspacePath,
            env: { ...process.env }
        });

        // Start status monitoring
        this.statusMonitor.start(workspacePath);

        this.process.stdout?.on('data', (data) => {
            this.outputChannel.append(data.toString());
        });

        this.process.stderr?.on('data', (data) => {
            this.outputChannel.append(`[ERROR] ${data.toString()}`);
        });

        this.process.on('close', (code) => {
            this.outputChannel.appendLine(`DevMirror stopped with code ${code}`);
            this.process = null;
            this.statusMonitor.stop();
        });

        this.process.on('error', (error) => {
            vscode.window.showErrorMessage(`DevMirror error: ${error.message}`);
            this.outputChannel.appendLine(`Error: ${error.message}`);
            this.process = null;
            this.statusMonitor.stop();
        });
    }

    stop(): void {
        if (this.process) {
            this.process.kill('SIGINT');
            this.process = null;
            this.statusMonitor.stop();
            this.outputChannel.appendLine('DevMirror stopped');
        }
    }

    isRunning(): boolean {
        return this.process !== null;
    }
}