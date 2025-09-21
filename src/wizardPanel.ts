import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WizardViewProvider {
    public static currentPanel: WizardViewProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private scriptName: string = '';
    private scriptCommand: string = '';
    private packageJsonPath: string = '';

    public static createOrShow(
        extensionUri: vscode.Uri,
        scriptName: string,
        scriptCommand: string,
        packageJsonPath: string
    ) {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it
        if (WizardViewProvider.currentPanel) {
            WizardViewProvider.currentPanel._panel.reveal(column);
            WizardViewProvider.currentPanel.loadScript(scriptName, scriptCommand, packageJsonPath);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'devmirrorWizard',
            'DevMirror Setup Wizard',
            column,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        WizardViewProvider.currentPanel = new WizardViewProvider(panel, extensionUri);
        WizardViewProvider.currentPanel.loadScript(scriptName, scriptCommand, packageJsonPath);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'generate':
                        await this.generateConfiguration(message.config);
                        break;
                    case 'cancel':
                        this.dispose();
                        break;
                    case 'analyzeScript':
                        const analysis = await this.analyzeScript(message.command);
                        this._panel.webview.postMessage({
                            type: 'scriptAnalysis',
                            analysis
                        });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private loadScript(scriptName: string, scriptCommand: string, packageJsonPath: string) {
        this.scriptName = scriptName;
        this.scriptCommand = scriptCommand;
        this.packageJsonPath = packageJsonPath;

        // Send script info to webview
        this._panel.webview.postMessage({
            type: 'loadScript',
            scriptName,
            scriptCommand
        });
    }

    private async analyzeScript(command: string): Promise<any> {
        const analysis = {
            hasSequential: command.includes('&&'),
            hasConcurrent: command.includes('concurrently') || command.includes('&'),
            hasScript: command.includes('node ') || command.includes('npm run'),
            detectedTools: [] as string[],
            suggestedMode: 'standard' as string
        };

        // Detect tools
        if (command.includes('vite')) analysis.detectedTools.push('vite');
        if (command.includes('webpack')) analysis.detectedTools.push('webpack');
        if (command.includes('next')) analysis.detectedTools.push('next');
        if (command.includes('cef') || command.includes('chrome-remote')) {
            analysis.detectedTools.push('cef');
            analysis.suggestedMode = 'companion';
        }

        // Check for external scripts
        const scriptMatch = command.match(/node\s+([^\s]+\.js)/);
        if (scriptMatch) {
            const scriptPath = path.join(path.dirname(this.packageJsonPath), scriptMatch[1]);
            if (fs.existsSync(scriptPath)) {
                const content = fs.readFileSync(scriptPath, 'utf8');
                if (content.includes('inquirer') || content.includes('prompts')) {
                    analysis.suggestedMode = 'wait';
                }
            }
        }

        return analysis;
    }

    private async generateConfiguration(config: any) {
        try {
            // Generate devmirror.config.json
            const configPath = path.join(path.dirname(this.packageJsonPath), 'devmirror.config.json');
            const devmirrorConfig = {
                mode: config.targetMode,
                outputDir: './devmirror-logs',
                ...(config.targetMode === 'cef' && { cefPort: parseInt(config.port) }),
                ...(config.executionMode === 'wait' && { waitMode: true }),
                ...(config.integrationMode === 'companion' && { companion: true, preserveLogger: true })
            };

            fs.writeFileSync(configPath, JSON.stringify(devmirrorConfig, null, 2));

            // Update package.json with new script
            const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            // Generate appropriate script based on config
            let mirrorScript = '';
            if (config.executionMode === 'wait') {
                mirrorScript = `npm run ${this.scriptName} & npx devmirror-cli --wait`;
            } else if (config.integrationMode === 'companion') {
                mirrorScript = `npm run ${this.scriptName} & npx devmirror-cli --companion`;
            } else {
                mirrorScript = `concurrently "npx devmirror-cli" "npm run ${this.scriptName}"`;
            }

            packageJson.scripts[`${this.scriptName}:mirror`] = mirrorScript;

            fs.writeFileSync(this.packageJsonPath, JSON.stringify(packageJson, null, 2));

            vscode.window.showInformationMessage(
                `✅ DevMirror configuration generated for "${this.scriptName}:mirror"`
            );

            this.dispose();

            // Refresh the tree view
            vscode.commands.executeCommand('devmirror.refreshPackages');

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate configuration: ${error}`);
        }
    }

    public dispose() {
        WizardViewProvider.currentPanel = undefined;

        // Clean up resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevMirror Setup Wizard</title>
    <style>
        body {
            background: #1e1e1e;
            color: #cccccc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 15px;
            margin: 0;
            max-width: 500px;
        }

        h2 {
            color: #ffffff;
            font-size: 16px;
            margin: 0 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid #3c3c3c;
        }

        .script-info {
            background: #252526;
            padding: 8px;
            border-radius: 3px;
            margin-bottom: 15px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
        }

        .form-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: #ffffff;
        }

        select, input[type="text"], input[type="number"] {
            width: 100%;
            background: #3c3c3c;
            border: 1px solid #474747;
            color: #cccccc;
            padding: 5px;
            border-radius: 3px;
            font-size: 12px;
        }

        select:focus, input:focus {
            outline: none;
            border-color: #007acc;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
        }

        input[type="checkbox"] {
            margin-right: 6px;
            width: 14px;
            height: 14px;
        }

        .checkbox-group label {
            margin-bottom: 0;
            font-size: 12px;
        }

        .buttons {
            display: flex;
            gap: 8px;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #3c3c3c;
        }

        button {
            flex: 1;
            padding: 6px 12px;
            border: none;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-primary {
            background: #007acc;
            color: white;
        }

        .btn-primary:hover {
            background: #005a9e;
        }

        .btn-secondary {
            background: #3c3c3c;
            color: #cccccc;
        }

        .btn-secondary:hover {
            background: #474747;
        }

        .analysis-hint {
            background: #252526;
            padding: 6px;
            border-radius: 3px;
            font-size: 11px;
            color: #969696;
            margin-top: 5px;
        }

        .advanced-section {
            margin-top: 15px;
            padding-top: 12px;
            border-top: 1px solid #3c3c3c;
        }

        .section-title {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #ffffff;
        }

        /* Two column layout for compact form */
        .form-row {
            display: flex;
            gap: 10px;
        }

        .form-row .form-group {
            flex: 1;
        }
    </style>
</head>
<body>
    <h2>🔧 DevMirror Setup Wizard</h2>

    <div class="script-info" id="scriptInfo">
        <strong>Script:</strong> <span id="scriptName">loading...</span><br>
        <strong>Command:</strong> <span id="scriptCommand">loading...</span>
    </div>

    <div id="analysisHint" class="analysis-hint" style="display: none;">
        💡 <span id="hintText"></span>
    </div>

    <form id="wizardForm">
        <div class="form-row">
            <div class="form-group">
                <label for="executionMode">Execution Mode</label>
                <select id="executionMode">
                    <option value="immediate">Run immediately</option>
                    <option value="wait">Wait for process/port</option>
                    <option value="smart">Smart detection</option>
                </select>
            </div>

            <div class="form-group">
                <label for="startTrigger">Start Trigger</label>
                <select id="startTrigger">
                    <option value="immediate">Immediately</option>
                    <option value="port-open">When port opens</option>
                    <option value="process-start">When process starts</option>
                    <option value="user-input">After user interaction</option>
                </select>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="targetMode">Target Mode</label>
                <select id="targetMode">
                    <option value="auto">Auto-detect</option>
                    <option value="cef">CEF/Chrome Extension</option>
                    <option value="cdp">Standard Browser (CDP)</option>
                    <option value="node">Node.js Application</option>
                </select>
            </div>

            <div class="form-group" id="portGroup">
                <label for="port">Watch Port</label>
                <input type="number" id="port" value="8555" placeholder="Auto-detect">
            </div>
        </div>

        <div class="form-group">
            <label for="integrationMode">Integration Strategy</label>
            <select id="integrationMode">
                <option value="replace">Replace existing logger</option>
                <option value="companion">Companion mode (preserve existing)</option>
                <option value="hybrid">User choice at runtime</option>
            </select>
        </div>

        <div class="advanced-section">
            <div class="section-title">Advanced Options</div>

            <div class="form-row">
                <div class="checkbox-group">
                    <input type="checkbox" id="waitForUser">
                    <label for="waitForUser">Wait for user interaction</label>
                </div>

                <div class="checkbox-group">
                    <input type="checkbox" id="monitorRestart" checked>
                    <label for="monitorRestart">Monitor for restart</label>
                </div>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="capturePreLaunch">
                <label for="capturePreLaunch">Capture pre-launch output</label>
            </div>

            <div class="form-group">
                <label for="timeout">Timeout (seconds)</label>
                <input type="number" id="timeout" value="60" style="width: 100px;">
            </div>
        </div>

        <div class="buttons">
            <button type="button" class="btn-primary" onclick="generate()">Generate Configuration</button>
            <button type="button" class="btn-secondary" onclick="cancel()">Cancel</button>
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();
        let currentScript = {};

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'loadScript':
                    currentScript = message;
                    document.getElementById('scriptName').textContent = message.scriptName;
                    document.getElementById('scriptCommand').textContent = message.scriptCommand;
                    analyzeScript(message.scriptCommand);
                    break;
                case 'scriptAnalysis':
                    applyAnalysis(message.analysis);
                    break;
            }
        });

        function analyzeScript(command) {
            vscode.postMessage({
                type: 'analyzeScript',
                command: command
            });
        }

        function applyAnalysis(analysis) {
            // Show hint based on analysis
            const hintEl = document.getElementById('analysisHint');
            const hintText = document.getElementById('hintText');

            if (analysis.detectedTools.includes('cef')) {
                hintText.textContent = 'CEF/Chrome debugging detected. Companion mode recommended.';
                hintEl.style.display = 'block';
                document.getElementById('targetMode').value = 'cef';
                document.getElementById('integrationMode').value = 'companion';
            } else if (analysis.suggestedMode === 'wait') {
                hintText.textContent = 'Interactive CLI detected. Wait mode recommended.';
                hintEl.style.display = 'block';
                document.getElementById('executionMode').value = 'wait';
            }
        }

        // Update UI based on selections
        document.getElementById('targetMode').addEventListener('change', (e) => {
            const portGroup = document.getElementById('portGroup');
            if (e.target.value === 'cef') {
                portGroup.style.display = 'block';
            } else {
                portGroup.style.display = 'none';
            }
        });

        function generate() {
            const config = {
                executionMode: document.getElementById('executionMode').value,
                startTrigger: document.getElementById('startTrigger').value,
                targetMode: document.getElementById('targetMode').value,
                port: document.getElementById('port').value,
                integrationMode: document.getElementById('integrationMode').value,
                waitForUser: document.getElementById('waitForUser').checked,
                monitorRestart: document.getElementById('monitorRestart').checked,
                capturePreLaunch: document.getElementById('capturePreLaunch').checked,
                timeout: document.getElementById('timeout').value
            };

            vscode.postMessage({
                type: 'generate',
                config: config
            });
        }

        function cancel() {
            vscode.postMessage({ type: 'cancel' });
        }
    </script>
</body>
</html>`;
    }
}