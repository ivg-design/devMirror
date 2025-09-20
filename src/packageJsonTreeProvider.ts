import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

interface PackageScript {
    packagePath: string;
    scriptName: string;
    scriptCommand: string;
    hasMirror: boolean;
}

export class PackageJsonTreeProvider implements vscode.TreeDataProvider<PackageJsonItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageJsonItem | undefined | null | void> = new vscode.EventEmitter<PackageJsonItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageJsonItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private packageJsonFiles: string[] = [];
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async findPackageJsonFiles(): Promise<void> {
        const pattern = new vscode.RelativePattern(this.workspaceRoot, '**/package.json');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        this.packageJsonFiles = files.map(uri => uri.fsPath);
    }

    getTreeItem(element: PackageJsonItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PackageJsonItem): Promise<PackageJsonItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder open');
            return [];
        }

        if (!element) {
            // Root level - show all package.json files
            await this.findPackageJsonFiles();
            return this.packageJsonFiles.map(filePath => {
                const relativePath = path.relative(this.workspaceRoot, filePath);
                const dirName = path.dirname(relativePath) || '.';
                return new PackageJsonItem(
                    dirName,
                    filePath,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'package'
                );
            });
        } else if (element.contextValue === 'package') {
            // Show scripts for this package.json
            try {
                const content = await fs.readFile(element.resourcePath, 'utf8');
                const packageJson = JSON.parse(content);

                if (!packageJson.scripts) {
                    return [];
                }

                const scripts: PackageJsonItem[] = [];
                for (const [name, command] of Object.entries(packageJson.scripts)) {
                    const hasMirror = name.includes(':mirror');
                    const isDevScript = name.includes('dev') || name.includes('start') || name.includes('serve');

                    // Only show dev-related scripts that don't already have :mirror
                    if (isDevScript && !hasMirror) {
                        scripts.push(new PackageJsonItem(
                            name,
                            element.resourcePath,
                            vscode.TreeItemCollapsibleState.None,
                            'script',
                            command as string,
                            `${name}:mirror` in packageJson.scripts
                        ));
                    }
                }
                return scripts;
            } catch (error) {
                console.error('Error reading package.json:', error);
                return [];
            }
        }

        return [];
    }

    async addMirrorScript(item: PackageJsonItem): Promise<void> {
        if (item.contextValue !== 'script') {
            return;
        }

        try {
            const content = await fs.readFile(item.resourcePath, 'utf8');
            const packageJson = JSON.parse(content);

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            // Get extension path
            const extensionPath = vscode.extensions.getExtension('IVGDesign.devmirror')?.extensionPath ||
                                  vscode.extensions.getExtension('devmirror')?.extensionPath;

            if (!extensionPath) {
                vscode.window.showErrorMessage('DevMirror extension not found');
                return;
            }

            const cliPath = path.join(extensionPath, 'out', 'cli.js');
            const scriptName = item.label as string;
            const mirrorName = `${scriptName}:mirror`;
            const originalCommand = item.description as string;

            // Check if concurrently is available
            const hasLocalConcurrently = await this.checkForDependency(item.resourcePath, 'concurrently');

            if (!hasLocalConcurrently) {
                const install = await vscode.window.showWarningMessage(
                    `'concurrently' is required but not found in ${path.dirname(item.resourcePath)}. Install it?`,
                    'Install', 'Cancel'
                );

                if (install === 'Install') {
                    const terminal = vscode.window.createTerminal('DevMirror Setup');
                    terminal.sendText(`cd "${path.dirname(item.resourcePath)}" && npm install --save-dev concurrently`);
                    terminal.show();

                    vscode.window.showInformationMessage('Installing concurrently... Please try again after installation completes.');
                    return;
                }
                return;
            }

            packageJson.scripts[mirrorName] = `concurrently "node '${cliPath}'" "${originalCommand}"`;

            await fs.writeFile(item.resourcePath, JSON.stringify(packageJson, null, 2), 'utf8');

            vscode.window.showInformationMessage(`Added mirror script: ${mirrorName}`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add mirror script: ${error}`);
        }
    }

    private async checkForDependency(packageJsonPath: string, dependency: string): Promise<boolean> {
        try {
            const content = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            return !!(
                packageJson.dependencies?.[dependency] ||
                packageJson.devDependencies?.[dependency]
            );
        } catch {
            return false;
        }
    }
}

class PackageJsonItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourcePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly description?: string,
        public readonly hasMirror?: boolean
    ) {
        super(label, collapsibleState);

        this.tooltip = this.contextValue === 'package'
            ? `${this.label}/package.json`
            : `${this.label}: ${this.description}`;

        if (this.contextValue === 'package') {
            this.iconPath = new vscode.ThemeIcon('package');
        } else if (this.contextValue === 'script') {
            this.iconPath = this.hasMirror
                ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
                : new vscode.ThemeIcon('play');
        }
    }
}