import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import { ConfigHandler } from './configHandler';
import { ScriptModifier } from './scriptModifier';
import { StatusMonitor } from './statusMonitor';
import { DevMirrorLauncher } from './devmirror-launcher';
import { PuppeteerChecker } from './puppeteerChecker';
import { PackageJsonTreeProvider } from './packageJsonTreeProvider';
import { WizardViewProvider } from './wizardPanel';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('DevMirror');
    const statusMonitor = new StatusMonitor();
    const launcher = new DevMirrorLauncher(outputChannel, statusMonitor);

    // Start HTTP server for IPC with CLI
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/activate') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const args = JSON.parse(body);
                    console.log('DevMirror activation received:', args);
                    statusMonitor.activate(args);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'activated' }));
                } catch (error) {
                    console.error('Failed to process activation:', error);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid request' }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // Try to start server on port 37240 (arbitrary but consistent)
    const PORT = 37240;
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`DevMirror IPC server listening on port ${PORT}`);
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${PORT} already in use - DevMirror might already be running`);
        } else {
            console.error('DevMirror IPC server error:', err);
        }
    });

    // Configuration for auto-refresh and auto-fold
    const config = vscode.workspace.getConfiguration('devmirror');
    let autoRefresh = config.get<boolean>('autoRefresh', true);
    let autoFold = config.get<boolean>('autoFold', true);

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('devmirror')) {
            const config = vscode.workspace.getConfiguration('devmirror');
            autoRefresh = config.get<boolean>('autoRefresh', true);
            autoFold = config.get<boolean>('autoFold', true);
        }
    });

    // File refresh control
    let refreshTimeout: NodeJS.Timeout | null = null;

    // Set up the log change callback
    statusMonitor.onLogChange(() => {
        const logPath = statusMonitor.getCurrentLogPath();
        if (logPath && autoRefresh) {
            refreshAndFold(vscode.Uri.file(logPath));
        }
    });

    const refreshAndFold = async (uri: vscode.Uri) => {
        if (!autoRefresh) return;

        // Clear existing timeout
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
        }

        // Set new timeout to refresh and fold after 1.5 seconds of no changes
        refreshTimeout = setTimeout(async () => {
            // Check if file is currently open in editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) return;

            const activeDoc = activeEditor.document;
            // Check if the active document is the log file that changed
            if (activeDoc.uri.fsPath === uri.fsPath ||
                (uri.fsPath.includes('devmirror-logs') &&
                 activeDoc.uri.fsPath.includes('devmirror-logs') &&
                 activeDoc.uri.fsPath.endsWith('.log'))) {

                try {
                    // Save current position
                    const position = activeEditor.selection.active;
                    const wasAtBottom = position.line >= activeDoc.lineCount - 5;

                    // Revert (refresh) the file to get latest content
                    await vscode.commands.executeCommand('workbench.action.files.revert');

                    // Wait for the revert to complete
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Apply folding if enabled
                    if (autoFold) {
                        await vscode.commands.executeCommand('editor.foldAll');
                    }

                    // If user was at bottom, scroll to new bottom
                    if (wasAtBottom) {
                        const newLastLine = activeEditor.document.lineCount - 1;
                        const newPosition = new vscode.Position(newLastLine, 0);
                        activeEditor.selection = new vscode.Selection(newPosition, newPosition);
                        activeEditor.revealRange(
                            new vscode.Range(newPosition, newPosition),
                            vscode.TextEditorRevealType.Default
                        );
                    } else {
                        // Otherwise restore previous position
                        const newSelection = new vscode.Selection(position, position);
                        activeEditor.selection = newSelection;
                        activeEditor.revealRange(
                            new vscode.Range(position, position),
                            vscode.TextEditorRevealType.InCenter
                        );
                    }

                    console.log('Refreshed and folded:', activeDoc.uri.fsPath);
                } catch (error) {
                    console.error('Error refreshing log file:', error);
                }
            }
            refreshTimeout = null;
        }, 1500);
    };

    // Also watch when files are opened
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && (editor.document.uri.fsPath.endsWith('.log') ||
                      editor.document.uri.fsPath.includes('devmirror-logs'))) {
            // Apply folding immediately when opening log files if enabled
            if (autoFold) {
                setTimeout(async () => {
                    await vscode.commands.executeCommand('editor.foldAll');
                    console.log('Applied folding on open to:', editor.document.uri.fsPath);
                }, 100);
            }
        }
    });

    // Setup command
    const setupCommand = vscode.commands.registerCommand('devmirror.setup', async () => {
        try {
            outputChannel.show();
            outputChannel.appendLine('🔴 DevMirror Setup Starting...');

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('Please open a workspace folder first');
                return;
            }

            const rootPath = workspaceFolder.uri.fsPath;

            // Check for puppeteer-core first
            outputChannel.appendLine('├─ Checking for puppeteer-core...');
            const hasPuppeteer = await PuppeteerChecker.ensurePuppeteerInstalled(rootPath);
            if (!hasPuppeteer) {
                outputChannel.appendLine('└─ Setup cancelled: puppeteer-core is required');
                vscode.window.showWarningMessage('DevMirror setup cancelled. puppeteer-core is required.');
                return;
            }
            outputChannel.appendLine('├─ puppeteer-core found ✓');

            const config = new ConfigHandler(rootPath);
            const modifier = new ScriptModifier(rootPath);

            outputChannel.appendLine('├─ Creating config file...');
            await config.initialize();

            outputChannel.appendLine('├─ Modifying package.json...');
            await modifier.addMirrorScripts();

            outputChannel.appendLine('└─ Setup complete!');

            vscode.window.showInformationMessage(
                'DevMirror setup complete! Run "npm run dev:mirror" or use "DevMirror: Start" command.',
                'Open Config'
            ).then(selection => {
                if (selection === 'Open Config') {
                    const configPath = vscode.Uri.file(`${rootPath}/devmirror.config.json`);
                    vscode.window.showTextDocument(configPath);
                }
            });
        } catch (error) {
            outputChannel.appendLine(`Error: ${error}`);
            vscode.window.showErrorMessage(`DevMirror setup failed: ${error}`);
        }
    });

    // Start command
    const startCommand = vscode.commands.registerCommand('devmirror.start', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace folder first');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Check for puppeteer-core before starting
        const hasPuppeteer = await PuppeteerChecker.ensurePuppeteerInstalled(rootPath);
        if (!hasPuppeteer) {
            vscode.window.showWarningMessage('Cannot start DevMirror. puppeteer-core is required.');
            return;
        }

        await launcher.start(rootPath);
    });

    // Stop command
    const stopCommand = vscode.commands.registerCommand('devmirror.stop', () => {
        launcher.stop();
    });

    // Show logs command
    const showLogsCommand = vscode.commands.registerCommand('devmirror.showLogs', async () => {
        // Get the current log path from status monitor
        const logPath = statusMonitor.getCurrentLogPath();

        if (logPath) {
            const uri = vscode.Uri.file(logPath);

            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Active,  // Open in active tab, not beside
                    preserveFocus: false
                });

                // Apply settings and scroll to bottom
                setTimeout(async () => {
                    if (editor && editor.document.uri.fsPath === logPath) {
                        // Check current word wrap state and disable if enabled
                        const config = vscode.workspace.getConfiguration('editor', doc.uri);
                        const wordWrap = config.get('wordWrap');
                        if (wordWrap !== 'off') {
                            await vscode.commands.executeCommand('editor.action.toggleWordWrap');
                        }

                        // Apply folding if enabled
                        if (autoFold) {
                            await vscode.commands.executeCommand('editor.foldAll');
                        }

                        // Scroll to bottom (tail)
                        const lastLine = doc.lineCount - 1;
                        const range = new vscode.Range(lastLine, 0, lastLine, 0);
                        editor.revealRange(range, vscode.TextEditorRevealType.Default);

                        // Move cursor to end
                        const position = new vscode.Position(lastLine, 0);
                        editor.selection = new vscode.Selection(position, position);
                    }
                }, 200);
            } catch (error) {
                vscode.window.showErrorMessage(`Cannot open log file: ${error}`);
            }
        } else {
            // No active monitoring, show settings
            vscode.commands.executeCommand('workbench.action.openSettings', 'devmirror');
        }
    });

    // Open settings command
    const openSettingsCommand = vscode.commands.registerCommand('devmirror.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'devmirror');
    });

    // Register tree view for monorepo support
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const treeProvider = new PackageJsonTreeProvider(workspaceFolder.uri.fsPath);
        const treeView = vscode.window.createTreeView('devmirrorPackages', {
            treeDataProvider: treeProvider,
            showCollapseAll: true
        });

        // Command to add mirror script from tree view (simple mode)
        const addMirrorCommand = vscode.commands.registerCommand('devmirror.addMirrorScript', async (item) => {
            await treeProvider.addMirrorScript(item);
        });

        // Command to open wizard from tree view (advanced mode)
        const openWizardCommand = vscode.commands.registerCommand('devmirror.openSetupWizard', async (item) => {
            // Create or show the wizard panel
            WizardViewProvider.createOrShow(context.extensionUri, item.label, item.command, item.resourcePath);
        });

        // Command to refresh tree view
        const refreshTreeCommand = vscode.commands.registerCommand('devmirror.refreshPackages', () => {
            treeProvider.refresh();
        });

        context.subscriptions.push(treeView);
        context.subscriptions.push(addMirrorCommand);
        context.subscriptions.push(openWizardCommand);
        context.subscriptions.push(refreshTreeCommand);
    }

    context.subscriptions.push(setupCommand);
    context.subscriptions.push(startCommand);
    context.subscriptions.push(stopCommand);
    context.subscriptions.push(showLogsCommand);
    context.subscriptions.push(openSettingsCommand);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(statusMonitor);
    context.subscriptions.push(new vscode.Disposable(() => {
        server.close();
    }));
}

export function deactivate() {}