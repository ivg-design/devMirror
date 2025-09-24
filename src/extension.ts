import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import { ConfigHandler } from './configHandler';
import { ScriptModifier } from './scriptModifier';
import { StatusMonitor } from './statusMonitor';
import { DevMirrorLauncher } from './devmirror-launcher';
import { PuppeteerChecker } from './puppeteerChecker';
import { PackageJsonTreeProvider } from './packageJsonTreeProvider';
import { WizardViewProvider } from './wizardViewProvider';
import { BackupManager } from './backupManager';

export function activate(context: vscode.ExtensionContext) {
    // Store CLI path using context.extensionUri on activation
    const cliUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'cli.js');
    context.globalState.update('devmirror.cliPath', cliUri.fsPath);

    // Create or update the shim on every activation
    const fs = require('fs');
    const path = require('path');

    const ensureDevMirrorShim = async () => {
        if (!vscode.workspace.workspaceFolders) return;

        for (const folder of vscode.workspace.workspaceFolders) {
            const shimDir = path.join(folder.uri.fsPath, '.vscode', 'devmirror');
            const configPath = path.join(shimDir, 'config.json');

            // Check if the package.json uses ESM
            const packageJsonPath = path.join(folder.uri.fsPath, 'package.json');
            let isESM = false;
            try {
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    isESM = packageJson.type === 'module';
                }
            } catch (e) {
                // Ignore errors reading package.json
            }

            // Use .cjs extension for ESM packages, .js for CommonJS
            const shimExtension = isESM ? '.cjs' : '.js';
            const shimPath = path.join(shimDir, `cli${shimExtension}`);

            // Create directory if it doesn't exist
            if (!fs.existsSync(shimDir)) {
                fs.mkdirSync(shimDir, { recursive: true });
            }

            // Clean up old shims with wrong extension
            const oldJsShim = path.join(shimDir, 'cli.js');
            const oldCjsShim = path.join(shimDir, 'cli.cjs');
            if (isESM && fs.existsSync(oldJsShim)) {
                fs.unlinkSync(oldJsShim);
            }
            if (!isESM && fs.existsSync(oldCjsShim)) {
                fs.unlinkSync(oldCjsShim);
            }

            // Write config with current extension path
            const config = {
                extensionPath: context.extensionUri.fsPath,
                cliPath: cliUri.fsPath
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

            // Write the shim script
            const shimScript = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const cli = config.cliPath;
require(cli);
`;

            fs.writeFileSync(shimPath, shimScript, { encoding: 'utf8', mode: 0o755 });
            console.log(`DevMirror shim updated at ${shimPath} (${isESM ? 'ESM' : 'CommonJS'} mode)`);
        }
    };

    ensureDevMirrorShim();

    const outputChannel = vscode.window.createOutputChannel('DevMirror');
    const statusMonitor = new StatusMonitor();
    const launcher = new DevMirrorLauncher(outputChannel, statusMonitor, context);

    // Function to handle activation messages
    const handleActivation = (args: any) => {
        statusMonitor.activate(args);
    };

    // Start HTTP server for IPC with CLI
    const PORT = 37240;
    let serverStarted = false;

    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/activate') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const args = JSON.parse(body);
                    handleActivation(args);

                    // Also broadcast to other windows via a different mechanism
                    // Since we can't directly communicate between windows,
                    // each window will check if the activation is for its workspace
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'activated' }));
                } catch (error) {
                    console.error('[DevMirror] Failed to process activation:', error);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid request' }));
                }
            });
        } else if (req.method === 'POST' && req.url === '/broadcast') {
            // Handle broadcasts from other windows
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const args = JSON.parse(body);
                    handleActivation(args);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'broadcasted' }));
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid broadcast' }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // Try to start server
    server.listen(PORT, '127.0.0.1', () => {
        serverStarted = true;
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            // Don't try to start another server, just rely on workspace filtering
            serverStarted = false;
        } else {
            console.error('[DevMirror] IPC server error:', err);
        }
    });

    // Activation is handled exclusively via HTTP server on port 37240
    // No file-based activation needed since HTTP is more reliable

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

    // Set up the log change callback (for when status monitor is active)
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
                        // Try multiple fold strategies
                        try {
                            // Make sure the editor is active
                            const currentEditor = vscode.window.activeTextEditor;
                            if (currentEditor && currentEditor.document.uri.fsPath === uri.fsPath) {
                                // Use foldAll to fold all log entries
                                await vscode.commands.executeCommand('editor.foldAll');
                                }
                        } catch (e) {
                            console.log('[DevMirror] Failed to fold on refresh:', e);
                        }
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

    // Set up a file watcher for devmirror-logs directory
    // This will work independently of the status monitor
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        workspaceFolders.forEach(folder => {
            const logsPattern = new vscode.RelativePattern(
                folder,
                '**/devmirror-logs/**/*.log'
            );

            const watcher = vscode.workspace.createFileSystemWatcher(logsPattern);

            // Watch for changes to log files
            watcher.onDidChange((uri) => {
                if (autoRefresh) {
                    refreshAndFold(uri);
                }
            });

            context.subscriptions.push(watcher);
        });
    }

    // Watch when active editor changes (includes opening and switching)
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && (editor.document.uri.fsPath.endsWith('.log') ||
                      editor.document.uri.fsPath.includes('devmirror-logs'))) {
            // Apply folding when switching to or opening log files if enabled
            if (autoFold) {

                // The editor is ALREADY active - no need to call showTextDocument!
                // That was causing the recursion.
                setTimeout(async () => {
                    try {
                        // Simply fold the already-active editor
                        await vscode.commands.executeCommand('editor.foldAll');
                    } catch (e) {
                        console.log('[DevMirror] Failed to fold:', e);
                    }
                }, 800);  // Delay for editor to fully load
            }
        }
    });

    // Remove the onDidChangeVisibleTextEditors handler entirely!
    // It's redundant with onDidChangeActiveTextEditor and contributes to the event storm.
    // When the active editor changes, that's sufficient for our folding needs.

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
            const modifier = new ScriptModifier(rootPath, context);

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
        const treeProvider = new PackageJsonTreeProvider(workspaceFolder.uri.fsPath, context);
        const treeView = vscode.window.createTreeView('devmirrorPackages', {
            treeDataProvider: treeProvider,
            showCollapseAll: true
        });

        // Initialize the wizard context (hidden by default)
        vscode.commands.executeCommand('setContext', 'devmirror.showWizard', false);

        // Register the wizard view provider
        const wizardProvider = new WizardViewProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                WizardViewProvider.viewType,
                wizardProvider
            )
        );

        // Command to add mirror script from tree view (simple mode)
        const addMirrorCommand = vscode.commands.registerCommand('devmirror.addMirrorScript', async (item) => {
            await treeProvider.addMirrorScript(item);
        });

        // Command to open wizard from tree view (advanced mode)
        const openWizardCommand = vscode.commands.registerCommand('devmirror.openSetupWizard', async (item) => {
            // Focus the wizard view
            await vscode.commands.executeCommand('devmirror.setupWizard.focus');
            // Send script info to wizard
            wizardProvider.showWizard(item.label, item.command, item.resourcePath);
        });

        // Command to refresh tree view
        const refreshTreeCommand = vscode.commands.registerCommand('devmirror.refreshPackages', () => {
            treeProvider.refresh();
        });

        // Command to undo mirror script modifications
        const undoMirrorCommand = vscode.commands.registerCommand('devmirror.undoMirrorScript', async (item) => {
            if (await BackupManager.restoreBackup(item.resourcePath, item.label)) {
                treeProvider.refresh();
            }
        });

        context.subscriptions.push(treeView);
        context.subscriptions.push(addMirrorCommand);
        context.subscriptions.push(openWizardCommand);
        context.subscriptions.push(refreshTreeCommand);
        context.subscriptions.push(undoMirrorCommand);
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