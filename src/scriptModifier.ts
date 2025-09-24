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
                    // Pass the package.json directory as an environment variable, use direct CLI path
                    const packageDir = path.dirname(this.packageJsonPath);
                    packageJson.scripts[mirrorName] =
                        `DEVMIRROR_PKG_PATH="${packageDir}" concurrently "node \\"${cliPath}\\"" "${originalScript}"`;
                    modified = true;
                    console.log(`Added mirror script: ${mirrorName}`);
                }
            });

            if (!scriptsToMirror.length) {
                if (!packageJson.scripts['dev:mirror']) {
                    packageJson.scripts['dev:mirror'] =
                        `concurrently "node \\"${cliPath}\\"" "echo \\"No dev script found\\""`;
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