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
            // First, install the wrapper script to the project
            await this.installWrapper();

            const content = await fs.readFile(this.packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            // Use the local wrapper script that dynamically finds the extension
            const wrapperPath = path.join(this.rootPath, 'node_modules', '.bin', 'devmirror-cli');

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
                        `concurrently "npx devmirror-cli" "${originalScript}"`;
                    modified = true;
                    console.log(`Added mirror script: ${mirrorName}`);
                }
            });

            if (!scriptsToMirror.length) {
                if (!packageJson.scripts['dev:mirror']) {
                    packageJson.scripts['dev:mirror'] =
                        `concurrently "npx devmirror-cli" "echo \\"No dev script found\\""`;
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

    private async installWrapper(): Promise<void> {
        const extensionPath = vscode.extensions.getExtension('IVGDesign.devmirror')?.extensionPath ||
                             vscode.extensions.getExtension('devmirror')?.extensionPath;

        if (!extensionPath) {
            throw new Error('DevMirror extension not found');
        }

        // Copy wrapper script to project
        const wrapperSource = path.join(extensionPath, 'out', 'devmirror-cli-wrapper.js');
        const binDir = path.join(this.rootPath, 'node_modules', '.bin');
        const wrapperDest = path.join(binDir, 'devmirror-cli');

        // Ensure .bin directory exists
        await fs.mkdir(binDir, { recursive: true });

        // Copy wrapper script
        await fs.copyFile(wrapperSource, wrapperDest);

        // Make it executable
        await fs.chmod(wrapperDest, '755');

        console.log('Installed devmirror-cli wrapper');
    }
}