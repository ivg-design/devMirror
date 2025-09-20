import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export class ScriptModifier {
    private packageJsonPath: string;

    constructor(private rootPath: string) {
        this.packageJsonPath = path.join(rootPath, 'package.json');
    }

    async addMirrorScripts(): Promise<void> {
        try {
            const content = await fs.readFile(this.packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            // Get extension path
            const extensionPath = vscode.extensions.getExtension('devmirror')?.extensionPath ||
                                  vscode.extensions.getExtension('unknown.devmirror')?.extensionPath;

            if (!extensionPath) {
                throw new Error('DevMirror extension path not found');
            }

            const cliPath = path.join(extensionPath, 'out', 'cli.js');

            const scriptsToMirror = Object.keys(packageJson.scripts).filter(name =>
                (name.includes('dev') || name.includes('start')) &&
                !name.includes(':mirror')
            );

            let modified = false;
            scriptsToMirror.forEach(name => {
                const mirrorName = `${name}:mirror`;
                const originalScript = packageJson.scripts[name];

                if (!packageJson.scripts[mirrorName]) {
                    packageJson.scripts[mirrorName] =
                        `concurrently "node '${cliPath}'" "${originalScript}"`;
                    modified = true;
                    console.log(`Added mirror script: ${mirrorName}`);
                }
            });

            if (!scriptsToMirror.length) {
                if (!packageJson.scripts['dev:mirror']) {
                    packageJson.scripts['dev:mirror'] =
                        `concurrently "node '${cliPath}'" "echo \\"No dev script found\\""`;
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