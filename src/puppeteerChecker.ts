import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class PuppeteerChecker {
    static async ensurePuppeteerInstalled(rootPath: string): Promise<boolean> {
        // Check if puppeteer-core is already installed
        const nodeModulesPath = path.join(rootPath, 'node_modules', 'puppeteer-core');

        if (fs.existsSync(nodeModulesPath)) {
            return true;
        }

        // Check package.json for puppeteer-core
        const packageJsonPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            if (deps['puppeteer-core']) {
                // It's in package.json but not installed
                const installChoice = await vscode.window.showWarningMessage(
                    'puppeteer-core is listed but not installed. Install it now?',
                    'Install',
                    'Cancel'
                );

                if (installChoice === 'Install') {
                    return await this.installPuppeteer(rootPath, false);
                }
                return false;
            }
        }

        // Puppeteer-core is not installed
        const choice = await vscode.window.showInformationMessage(
            'DevMirror requires puppeteer-core to capture browser console output. Install it now?',
            'Install',
            'Install as Dev Dependency',
            'Cancel'
        );

        if (choice === 'Install') {
            return await this.installPuppeteer(rootPath, false);
        } else if (choice === 'Install as Dev Dependency') {
            return await this.installPuppeteer(rootPath, true);
        }

        return false;
    }

    private static async installPuppeteer(rootPath: string, isDev: boolean): Promise<boolean> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing puppeteer-core...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Running npm install...' });

                // Detect package manager
                const yarnLockExists = fs.existsSync(path.join(rootPath, 'yarn.lock'));
                const pnpmLockExists = fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'));

                let command: string;
                if (pnpmLockExists) {
                    command = `pnpm add ${isDev ? '-D' : ''} puppeteer-core`;
                } else if (yarnLockExists) {
                    command = `yarn add ${isDev ? '--dev' : ''} puppeteer-core`;
                } else {
                    command = `npm install ${isDev ? '--save-dev' : '--save'} puppeteer-core`;
                }

                progress.report({ increment: 50, message: 'Installing dependencies...' });

                const { stdout, stderr } = await execAsync(command, { cwd: rootPath });

                if (stderr && !stderr.includes('warning')) {
                    console.error('Installation stderr:', stderr);
                }

                progress.report({ increment: 100, message: 'Installation complete!' });

                vscode.window.showInformationMessage('puppeteer-core installed successfully!');
                return true;

            } catch (error) {
                vscode.window.showErrorMessage(`Failed to install puppeteer-core: ${error}`);
                return false;
            }
        });
    }
}