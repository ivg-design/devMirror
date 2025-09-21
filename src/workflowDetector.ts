import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export interface WorkflowType {
    type: 'simple' | 'interactive' | 'sequential' | 'complex';
    hasInteractivePrompt: boolean;
    hasCEFLogger: boolean;
    hasDevServer: boolean;
    suggestedIntegration: 'standard' | 'companion' | 'wait-mode';
    scripts: string[];
}

export class WorkflowDetector {
    constructor(private projectPath: string) {}

    async detectWorkflow(): Promise<WorkflowType> {
        const packageJsonPath = path.join(this.projectPath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

        const scripts = packageJson.scripts || {};
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Check for interactive CLI tools
        const hasInteractiveDeps = this.hasInteractiveDependencies(dependencies);

        // Analyze script patterns
        const scriptAnalysis = this.analyzeScripts(scripts);

        // Check for CEF/Chrome debugging
        const hasCEF = await this.detectCEFSetup(this.projectPath, scripts);

        // Determine workflow type
        if (hasInteractiveDeps && scriptAnalysis.hasSequential) {
            return {
                type: 'interactive',
                hasInteractivePrompt: true,
                hasCEFLogger: hasCEF,
                hasDevServer: scriptAnalysis.hasDevServer,
                suggestedIntegration: 'wait-mode',
                scripts: scriptAnalysis.devScripts
            };
        }

        if (hasCEF && scriptAnalysis.hasConcurrent) {
            return {
                type: 'complex',
                hasInteractivePrompt: hasInteractiveDeps,
                hasCEFLogger: true,
                hasDevServer: scriptAnalysis.hasDevServer,
                suggestedIntegration: 'companion',
                scripts: scriptAnalysis.devScripts
            };
        }

        return {
            type: 'simple',
            hasInteractivePrompt: false,
            hasCEFLogger: false,
            hasDevServer: scriptAnalysis.hasDevServer,
            suggestedIntegration: 'standard',
            scripts: scriptAnalysis.devScripts
        };
    }

    private hasInteractiveDependencies(deps: Record<string, string>): boolean {
        const interactivePackages = [
            'inquirer', 'prompts', 'enquirer', 'readline-sync',
            'ora', 'chalk', 'commander', 'yargs'
        ];

        return Object.keys(deps).some(dep =>
            interactivePackages.some(pkg => dep.includes(pkg))
        );
    }

    private analyzeScripts(scripts: Record<string, string>) {
        const devScripts = Object.keys(scripts).filter(name =>
            name.includes('dev') || name.includes('start')
        );

        const scriptValues = Object.values(scripts).join(' ');

        return {
            devScripts,
            hasConcurrent: /concurrently|npm-run-all|\|\||&(?!&)/.test(scriptValues),
            hasSequential: /&&/.test(scriptValues),
            hasDevServer: /vite|webpack|next|react-scripts/.test(scriptValues),
            hasCEF: /cef|chrome-remote|cdp|8555|9222/.test(scriptValues)
        };
    }

    private async detectCEFSetup(projectPath: string, scripts: Record<string, string>): Promise<boolean> {
        // Check for .debug file (Adobe CEP indicator)
        const debugPath = path.join(projectPath, '.debug');
        try {
            await fs.access(debugPath);
            return true;
        } catch {}

        // Check for CEF logger scripts
        const scriptValues = Object.values(scripts).join(' ');
        if (/cef-console-logger|chrome-remote-interface/.test(scriptValues)) {
            return true;
        }

        // Check for CEF-related files in scripts directory
        try {
            const scriptsDir = path.join(projectPath, 'scripts');
            const files = await fs.readdir(scriptsDir);
            return files.some(file => file.includes('cef') || file.includes('logger'));
        } catch {
            return false;
        }
    }

    async generateIntegration(workflow: WorkflowType): Promise<any> {
        const config: any = {
            outputDir: './devmirror-logs'
        };

        switch (workflow.suggestedIntegration) {
            case 'wait-mode':
                config.mode = 'cef';
                config.cefPort = 8555;
                config.companion = true;
                config.startMode = 'wait';
                config.waitForPort = true;
                config.autoDetect = true;
                break;

            case 'companion':
                config.mode = 'cef';
                config.cefPort = 8555;
                config.companion = true;
                config.preserveLogger = true;
                break;

            case 'standard':
            default:
                config.mode = 'cdp';
                config.autoDetectPort = true;
                break;
        }

        return {
            config,
            scripts: this.generateScripts(workflow)
        };
    }

    private generateScripts(workflow: WorkflowType): Record<string, string> {
        const scripts: Record<string, string> = {};

        for (const scriptName of workflow.scripts) {
            switch (workflow.suggestedIntegration) {
                case 'wait-mode':
                    // Run original script and DevMirror in wait mode
                    scripts[`${scriptName}:mirror`] =
                        `concurrently -n "APP,MIRROR" "${scriptName}" "npx devmirror-cli --wait"`;
                    scripts[`mirror:watch`] = 'npx devmirror-cli --wait';
                    break;

                case 'companion':
                    // Run alongside existing logger
                    scripts[`${scriptName}:mirror`] =
                        `concurrently "${scriptName}" "npx devmirror-cli"`;
                    break;

                case 'standard':
                    // Standard integration
                    scripts[`${scriptName}:mirror`] =
                        `concurrently "npx devmirror-cli" "${scriptName}"`;
                    break;
            }
        }

        return scripts;
    }
}