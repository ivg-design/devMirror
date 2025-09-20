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
            const packageDir = path.dirname(item.resourcePath);

            // Check for and create devmirror.config.json if needed
            await this.ensureDevMirrorConfig(packageDir);

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

            const scriptName = item.label as string;
            const mirrorName = `${scriptName}:mirror`;
            const originalCommand = item.description as string;

            // Install wrapper to ensure npx devmirror-cli works
            await this.installWrapper(packageDir);

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

            // Pass the package.json directory as an environment variable
            packageJson.scripts[mirrorName] = `DEVMIRROR_PKG_PATH="${packageDir}" concurrently "npx devmirror-cli" "${originalCommand}"`;

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

    private async installWrapper(packageDir: string): Promise<void> {
        // Check if wrapper exists in project
        const wrapperDest = path.join(packageDir, 'node_modules', '.bin', 'devmirror-cli');

        try {
            await fs.access(wrapperDest);
        } catch {
            // Wrapper doesn't exist, copy it from extension
            const extensionPath = vscode.extensions.getExtension('IVGDesign.devmirror')?.extensionPath ||
                                  vscode.extensions.getExtension('devmirror')?.extensionPath;

            if (extensionPath) {
                const wrapperSrc = path.join(extensionPath, 'out', 'devmirror-cli-wrapper.js');
                const binDir = path.join(packageDir, 'node_modules', '.bin');

                // Ensure .bin directory exists
                await fs.mkdir(binDir, { recursive: true });

                // Copy the wrapper
                const content = await fs.readFile(wrapperSrc, 'utf8');
                await fs.writeFile(wrapperDest, content, { mode: 0o755 });
            }
        }
    }

    private async ensureDevMirrorConfig(packageDir: string): Promise<void> {
        const configPath = path.join(packageDir, 'devmirror.config.json');

        try {
            // Check if config already exists
            await fs.access(configPath);

            // Config exists, let's verify it has the required fields
            const content = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(content);

            // Update if missing required fields
            let updated = false;
            if (!config.url) {
                // Try to detect port from package.json scripts
                const port = await this.detectDevServerPort(packageDir);
                config.url = `http://localhost:${port}`;
                updated = true;
            }
            if (!config.outputDir) {
                config.outputDir = './devmirror-logs';
                updated = true;
            }

            if (updated) {
                await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            }
        } catch (error) {
            // Config doesn't exist, create it
            const port = await this.detectDevServerPort(packageDir);
            const defaultConfig = {
                url: `http://localhost:${port}`,
                outputDir: './devmirror-logs'
            };

            await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
            vscode.window.showInformationMessage(`Created devmirror.config.json in ${path.basename(packageDir)}`);
        }
    }

    private async detectDevServerPort(packageDir: string): Promise<number> {
        try {
            const packageJsonPath = path.join(packageDir, 'package.json');
            const content = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            // Look for port in scripts
            const scripts = packageJson.scripts || {};
            for (const [name, command] of Object.entries(scripts)) {
                if (typeof command === 'string' && (name.includes('dev') || name.includes('start'))) {
                    // Look for port patterns
                    const portMatch = command.match(/(?:PORT=|--port\s+|:)(\d{4})/);
                    if (portMatch) {
                        return parseInt(portMatch[1]);
                    }
                }
            }

            // Check for common config files
            const envPath = path.join(packageDir, '.env');
            try {
                const envContent = await fs.readFile(envPath, 'utf8');
                const portMatch = envContent.match(/PORT=(\d{4})/);
                if (portMatch) {
                    return parseInt(portMatch[1]);
                }
            } catch {
                // No .env file
            }

            // Default ports based on common frameworks
            if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) {
                return 5173;
            }
            if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
                return 3000;
            }
        } catch {
            // Error reading package.json
        }

        // Default fallback
        return 3000;
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