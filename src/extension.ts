import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigHandler } from './configHandler';
import { ScriptModifier } from './scriptModifier';
import { StatusMonitor } from './statusMonitor';
import { DevMirrorLauncher } from './devmirror-launcher';
import { PuppeteerChecker } from './puppeteerChecker';
import { PackageJsonTreeProvider } from './packageJsonTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('DevMirror');
    const statusMonitor = new StatusMonitor();
    const launcher = new DevMirrorLauncher(outputChannel, statusMonitor);

    // Watch for log file changes and apply folding with debouncing
    const logWatcher = vscode.workspace.createFileSystemWatcher('**/devmirror-logs/*.log');
    const currentLogWatcher = vscode.workspace.createFileSystemWatcher('**/devmirror-logs/current.log');

    let foldTimeout: NodeJS.Timeout | null = null;

    const applyFolding = async (uri: vscode.Uri) => {
        // Clear existing timeout
        if (foldTimeout) {
            clearTimeout(foldTimeout);
        }

        // Set new timeout to fold after 500ms of no changes
        foldTimeout = setTimeout(async () => {
            // Check if file is currently open in editor
            const editors = vscode.window.visibleTextEditors;
            for (const editor of editors) {
                if (editor.document.uri.fsPath === uri.fsPath ||
                    editor.document.uri.fsPath.endsWith('current.log') ||
                    editor.document.uri.fsPath.includes('devmirror-logs')) {
                    // Apply folding after writes have settled
                    await vscode.commands.executeCommand('editor.foldAll');
                    console.log('Applied folding to:', editor.document.uri.fsPath);
                    break;
                }
            }
            foldTimeout = null;
        }, 500);
    };

    // Also watch when files are opened
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && (editor.document.uri.fsPath.endsWith('.log') ||
                      editor.document.uri.fsPath.includes('devmirror-logs'))) {
            // Apply folding immediately when opening log files
            setTimeout(async () => {
                await vscode.commands.executeCommand('editor.foldAll');
                console.log('Applied folding on open to:', editor.document.uri.fsPath);
            }, 100);
        }
    });

    logWatcher.onDidChange(applyFolding);
    currentLogWatcher.onDidChange(applyFolding);
    logWatcher.onDidCreate(applyFolding);
    currentLogWatcher.onDidCreate(applyFolding);

    context.subscriptions.push(logWatcher);
    context.subscriptions.push(currentLogWatcher);

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
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const logPath = path.join(workspaceFolder.uri.fsPath, 'devmirror-logs', 'current.log');
        const uri = vscode.Uri.file(logPath);

        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Active,  // Open in active tab, not beside
                preserveFocus: false
            });

            // Apply word wrap and folding to collapse console lines
            // Need to wait for the editor to be fully ready
            setTimeout(async () => {
                if (editor && editor.document.uri.fsPath === logPath) {
                    // Check current word wrap state and disable if enabled
                    const config = vscode.workspace.getConfiguration('editor', doc.uri);
                    const wordWrap = config.get('wordWrap');
                    if (wordWrap !== 'off') {
                        await vscode.commands.executeCommand('editor.action.toggleWordWrap');
                    }
                    await vscode.commands.executeCommand('editor.foldAll');
                }
            }, 200);
        } catch (error) {
            vscode.window.showErrorMessage(`Cannot open log file: ${error}`);
        }
    });

    // Register tree view for monorepo support
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const treeProvider = new PackageJsonTreeProvider(workspaceFolder.uri.fsPath);
        const treeView = vscode.window.createTreeView('devmirrorPackages', {
            treeDataProvider: treeProvider,
            showCollapseAll: true
        });

        // Command to add mirror script from tree view
        const addMirrorCommand = vscode.commands.registerCommand('devmirror.addMirrorScript', async (item) => {
            await treeProvider.addMirrorScript(item);
        });

        // Command to refresh tree view
        const refreshTreeCommand = vscode.commands.registerCommand('devmirror.refreshPackages', () => {
            treeProvider.refresh();
        });

        context.subscriptions.push(treeView);
        context.subscriptions.push(addMirrorCommand);
        context.subscriptions.push(refreshTreeCommand);
    }

    context.subscriptions.push(setupCommand);
    context.subscriptions.push(startCommand);
    context.subscriptions.push(stopCommand);
    context.subscriptions.push(showLogsCommand);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(statusMonitor);
}

export function deactivate() {}