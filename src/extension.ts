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
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false
            });

            // Apply folding to collapse console lines
            // Need to wait for the editor to be fully ready
            setTimeout(async () => {
                if (editor && editor.document.uri.fsPath === logPath) {
                    // First unfold all to reset state
                    await vscode.commands.executeCommand('editor.unfoldAll');
                    // Then fold at level 1 (folds all top-level log entries)
                    await vscode.commands.executeCommand('editor.foldLevel1');
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