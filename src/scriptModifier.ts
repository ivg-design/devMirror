import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export class ScriptModifier {
    private packageJsonPath: string;
    private context: vscode.ExtensionContext;

    constructor(private rootPath: string, context: vscode.ExtensionContext) {
        this.packageJsonPath = path.join(rootPath, 'package.json');
        this.context = context;
    }

    async addMirrorScripts(): Promise<void> {
        try {
            // Get CLI path from global state (set in extension activation)
            const cliPath = this.context.globalState.get<string>('devmirror.cliPath');

            if (!cliPath) {
                throw new Error('DevMirror CLI path not found. Please restart VS Code.');
            }

            const content = await fs.readFile(this.packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            // Check if package uses ESM
            const isESM = packageJson.type === 'module';

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            const scriptsToMirror = Object.keys(packageJson.scripts).filter(name =>
                (name.includes('dev') || name.includes('start')) &&
                !name.includes(':mirror')
            );

            let modified = false;
            scriptsToMirror.forEach(name => {
                const mirrorName = `${name}:mirror`;
                const originalScript = packageJson.scripts[name];

                if (!packageJson.scripts[mirrorName]) {
                    // Pass the package.json directory as an environment variable
                    // Use the stable shim path - relative from each package.json location
                    const packageDir = path.dirname(this.packageJsonPath);
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || packageDir;
                    const shimExtension = isESM ? '.cjs' : '.js';
                    const shimPath = path.join(workspaceRoot, '.vscode', 'devmirror', `cli${shimExtension}`);

                    // Calculate relative path from package.json to shim
                    let relativeShimPath = path.relative(packageDir, shimPath);
                    // Ensure forward slashes for cross-platform compatibility
                    relativeShimPath = relativeShimPath.replace(/\\/g, '/');
                    // Add ./ prefix if not going up directories
                    if (!relativeShimPath.startsWith('../')) {
                        relativeShimPath = './' + relativeShimPath;
                    }

                    packageJson.scripts[mirrorName] =
                        `DEVMIRROR_PKG_PATH="${packageDir}" concurrently "node \\"${relativeShimPath}\\"" "${originalScript}"`;
                    modified = true;
                    console.log(`Added mirror script: ${mirrorName}`);
                }
            });

            if (!scriptsToMirror.length) {
                if (!packageJson.scripts['dev:mirror']) {
                    const packageDir = path.dirname(this.packageJsonPath);
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || packageDir;
                    const shimExtension = isESM ? '.cjs' : '.js';
                    const shimPath = path.join(workspaceRoot, '.vscode', 'devmirror', `cli${shimExtension}`);

                    // Calculate relative path from package.json to shim
                    let relativeShimPath = path.relative(packageDir, shimPath);
                    // Ensure forward slashes for cross-platform compatibility
                    relativeShimPath = relativeShimPath.replace(/\\/g, '/');
                    // Add ./ prefix if not going up directories
                    if (!relativeShimPath.startsWith('../')) {
                        relativeShimPath = './' + relativeShimPath;
                    }

                    packageJson.scripts['dev:mirror'] =
                        `concurrently "node \\"${relativeShimPath}\\"" "echo \\"No dev script found\\""`;
                    modified = true;
                }
            }

            if (modified) {
                await fs.writeFile(
                    this.packageJsonPath,
                    JSON.stringify(packageJson, null, 2),
                    'utf8'
                );
                console.log('package.json updated with mirror scripts');
            } else {
                console.log('Mirror scripts already exist in package.json');
            }
        } catch (error) {
            throw new Error(`Failed to modify package.json: ${error}`);
        }
    }

    async removeMirrorScripts(): Promise<void> {
        try {
            const content = await fs.readFile(this.packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            if (packageJson.scripts) {
                const mirrorScripts = Object.keys(packageJson.scripts).filter(name =>
                    name.includes(':mirror')
                );

                mirrorScripts.forEach(name => {
                    delete packageJson.scripts[name];
                });

                if (mirrorScripts.length > 0) {
                    await fs.writeFile(
                        this.packageJsonPath,
                        JSON.stringify(packageJson, null, 2),
                        'utf8'
                    );
                    console.log('Removed mirror scripts from package.json');
                }
            }
        } catch (error) {
            throw new Error(`Failed to remove mirror scripts: ${error}`);
        }
    }

}