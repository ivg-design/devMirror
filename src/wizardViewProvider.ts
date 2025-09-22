import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackupManager } from './backupManager';

export class WizardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'devmirror.setupWizard';
    private _view?: vscode.WebviewView;
    private scriptName: string = '';
    private scriptCommand: string = '';
    private packageJsonPath: string = '';
    private pendingScript?: { name: string; command: string; path: string };

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // If we have pending script data, send it now
        if (this.pendingScript) {
            this._view.show?.(true);
            this._view.webview.postMessage({
                type: 'loadScript',
                scriptName: this.pendingScript.name,
                scriptCommand: this.pendingScript.command
            });
            this.scriptName = this.pendingScript.name;
            this.scriptCommand = this.pendingScript.command;
            this.packageJsonPath = this.pendingScript.path;
            this.pendingScript = undefined;
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'generate':
                    await this.generateConfiguration(data.config);
                    break;
                case 'cancel':
                    this.hideWizard();
                    break;
                case 'analyzeScript':
                    const analysis = await this.analyzeScript(data.command);
                    webviewView.webview.postMessage({
                        type: 'scriptAnalysis',
                        analysis
                    });
                    break;
            }
        });
    }

    public showWizard(scriptName: string, scriptCommand: string, packageJsonPath: string) {
        if (this._view) {
            // View exists, use it directly
            this.scriptName = scriptName;
            this.scriptCommand = scriptCommand;
            this.packageJsonPath = packageJsonPath;

            // Show the wizard view first
            this._view.show?.(true);

            // Send script info to webview
            this._view.webview.postMessage({
                type: 'loadScript',
                scriptName,
                scriptCommand
            });
        } else {
            // Store data for when view is created
            this.pendingScript = {
                name: scriptName,
                command: scriptCommand,
                path: packageJsonPath
            };
        }
    }

    private hideWizard() {
        // Collapse the wizard view
        if (this._view) {
            // There's no direct API to collapse, but we can hide by clearing content
            this._view.webview.html = '<html><body style="padding:10px; color:#888;">Select a script and click the gear icon to configure.</body></html>';
        }
        // Focus back to tree view
        vscode.commands.executeCommand('devmirrorPackages.focus');
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
            // Create backup before any modifications
            BackupManager.createBackup(this.packageJsonPath, this.scriptName);

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

            this.hideWizard();

            // Refresh the tree view
            vscode.commands.executeCommand('devmirror.refreshPackages');

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate configuration: ${error}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevMirror Setup Wizard</title>
    <style>
        body {
            background: transparent;
            color: #cccccc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 10px;
            margin: 0;
        }

        h2 {
            color: #ffffff;
            font-size: 14px;
            margin: 0 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #3c3c3c;
        }

        .script-info {
            background: #252526;
            padding: 6px;
            border-radius: 3px;
            margin-bottom: 10px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
        }

        .form-group {
            margin-bottom: 10px;
        }

        label {
            display: block;
            margin-bottom: 3px;
            font-size: 11px;
            color: #ffffff;
        }

        select, input[type="text"], input[type="number"] {
            width: 100%;
            background: #3c3c3c;
            border: 1px solid #474747;
            color: #cccccc;
            padding: 4px;
            border-radius: 3px;
            font-size: 11px;
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
            margin-right: 5px;
            width: 13px;
            height: 13px;
        }

        .checkbox-group label {
            margin-bottom: 0;
            font-size: 11px;
        }

        .buttons {
            display: flex;
            gap: 6px;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid #3c3c3c;
        }

        button {
            flex: 1;
            padding: 5px 8px;
            border: none;
            border-radius: 3px;
            font-size: 11px;
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
            padding: 5px;
            border-radius: 3px;
            font-size: 10px;
            color: #969696;
            margin-top: 3px;
        }

        .advanced-section {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #3c3c3c;
        }

        .section-title {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
            color: #ffffff;
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
            <input type="number" id="port" value="8555" placeholder="Leave empty to auto-detect">
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

            <div class="checkbox-group">
                <input type="checkbox" id="waitForUser">
                <label for="waitForUser">Wait for user interaction</label>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="monitorRestart" checked>
                <label for="monitorRestart">Monitor for restart</label>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="capturePreLaunch">
                <label for="capturePreLaunch">Capture pre-launch output</label>
            </div>

            <div class="form-group">
                <label for="timeout">Timeout (seconds)</label>
                <input type="number" id="timeout" value="60">
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