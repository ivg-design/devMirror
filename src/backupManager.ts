import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface BackupEntry {
    packageJsonPath: string;
    scriptName: string;
    originalContent: any;
    modifiedAt: number;
    configBackup?: any;
}

export class BackupManager {
    private static backups: Map<string, BackupEntry> = new Map();

    /**
     * Create a backup before modifying package.json
     */
    static createBackup(packageJsonPath: string, scriptName: string): void {
        try {
            const content = fs.readFileSync(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);

            // Create backup key (path + script name)
            const key = `${packageJsonPath}::${scriptName}`;

            // Check if config exists and back it up too
            const configPath = path.join(path.dirname(packageJsonPath), 'devmirror.config.json');
            let configBackup = undefined;
            if (fs.existsSync(configPath)) {
                configBackup = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }

            this.backups.set(key, {
                packageJsonPath,
                scriptName,
                originalContent: packageJson,
                modifiedAt: Date.now(),
                configBackup
            });

            console.log(`Backup created for ${scriptName} in ${packageJsonPath}`);
        } catch (error) {
            console.error('Failed to create backup:', error);
        }
    }

    /**
     * Check if a backup exists for a script
     */
    static hasBackup(packageJsonPath: string, scriptName: string): boolean {
        const key = `${packageJsonPath}::${scriptName}`;
        return this.backups.has(key);
    }

    /**
     * Restore a backup
     */
    static async restoreBackup(packageJsonPath: string, scriptName: string): Promise<boolean> {
        const key = `${packageJsonPath}::${scriptName}`;
        const backup = this.backups.get(key);

        if (!backup) {
            vscode.window.showWarningMessage('No backup found for this script');
            return false;
        }

        try {
            // Restore package.json
            fs.writeFileSync(packageJsonPath, JSON.stringify(backup.originalContent, null, 2));

            // Restore or remove config
            const configPath = path.join(path.dirname(packageJsonPath), 'devmirror.config.json');
            if (backup.configBackup) {
                fs.writeFileSync(configPath, JSON.stringify(backup.configBackup, null, 2));
            } else {
                // If there was no config before, remove it
                if (fs.existsSync(configPath)) {
                    // Check if config has other settings we should preserve
                    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    // For now, just remove it if it was created by us
                    // TODO: More sophisticated config merging
                }
            }

            // Remove backup after successful restore
            this.backups.delete(key);

            vscode.window.showInformationMessage(`✅ Restored ${scriptName} to original state`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restore backup: ${error}`);
            return false;
        }
    }

    /**
     * Get all backups for a package.json file
     */
    static getBackupsForPackage(packageJsonPath: string): string[] {
        const scripts: string[] = [];
        for (const [key, backup] of this.backups) {
            if (backup.packageJsonPath === packageJsonPath) {
                scripts.push(backup.scriptName);
            }
        }
        return scripts;
    }

    /**
     * Clear old backups (older than 1 hour)
     */
    static clearOldBackups(): void {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [key, backup] of this.backups) {
            if (backup.modifiedAt < oneHourAgo) {
                this.backups.delete(key);
            }
        }
    }
}