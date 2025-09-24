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
                    // Pass the package.json directory as an environment variable
                    // Use a dynamic script that finds the extension at runtime
                    const packageDir = path.dirname(this.packageJsonPath);
                    const findExtensionScript = `node -e "const p=require('path');const f=require('fs');const h=require('os').homedir();const d=[p.join(h,'.vscode/extensions'),p.join(h,'.vscode-server/extensions'),p.join(h,'.cursor/extensions')];for(const x of d){if(f.existsSync(x)){const e=f.readdirSync(x).find(n=>n.startsWith('ivgdesign.devmirror-'));if(e){console.log(p.join(x,e,'out','cli.js'));process.exit(0);}}}process.exit(1);"`;
                    packageJson.scripts[mirrorName] =
                        `DEVMIRROR_PKG_PATH="${packageDir}" concurrently "node \\"$(${findExtensionScript})\\"" "${originalScript}"`;
                    modified = true;
                    console.log(`Added mirror script: ${mirrorName}`);
                }
            });

            if (!scriptsToMirror.length) {
                if (!packageJson.scripts['dev:mirror']) {
                    const findExtensionScript = `node -e "const p=require('path');const f=require('fs');const h=require('os').homedir();const d=[p.join(h,'.vscode/extensions'),p.join(h,'.vscode-server/extensions'),p.join(h,'.cursor/extensions')];for(const x of d){if(f.existsSync(x)){const e=f.readdirSync(x).find(n=>n.startsWith('ivgdesign.devmirror-'));if(e){console.log(p.join(x,e,'out','cli.js'));process.exit(0);}}}process.exit(1);"`;
                    packageJson.scripts['dev:mirror'] =
                        `concurrently "node \\"$(${findExtensionScript})\\"" "echo \\"No dev script found\\""`;
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