import { BaseAgent } from '../base-agent';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export class WindowsControlAgent extends BaseAgent {
  protected agentType = 'windows-control';
  protected permissions = [
    'read:file_system',
    'write:file_system',
    'delete:file_system',
    'read:processes',
    'write:processes'
  ];
  
  async listDirectory(dirPath: string): Promise<any[]> {
    return await this.accessResource('file_system', 'read', async () => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      return entries.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }));
    });
  }
  
  async readFile(filePath: string): Promise<string> {
    return await this.accessResource('file_system', 'read', async () => {
      return await fs.readFile(filePath, 'utf-8');
    });
  }
  
  async writeFile(filePath: string, content: string, requireApproval: boolean = true): Promise<void> {
    if (requireApproval) {
      // TODO: Request user approval via approval system
      console.log(`⚠️ Approval required to write file: ${filePath}`);
    }
    
    return await this.accessResource('file_system', 'write', async () => {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`✅ File written: ${filePath}`);
    });
  }
  
  async deleteFile(filePath: string): Promise<void> {
    // RULE 6: Destructive action requires explicit approval
    console.log(`⚠️ DESTRUCTIVE ACTION: Delete ${filePath} - requires approval`);
    
    // TODO: Request approval through approval system
    const approved = false; // Placeholder
    
    if (!approved) {
      throw new Error('Delete operation not approved by user');
    }
    
    return await this.accessResource('file_system', 'delete', async () => {
      await fs.unlink(filePath);
      console.log(`🗑️ File deleted: ${filePath}`);
    });
  }
  
  async createDirectory(dirPath: string): Promise<void> {
    return await this.accessResource('file_system', 'write', async () => {
      await fs.mkdir(dirPath, { recursive: true });
    });
  }
  
  async launchApplication(appPath: string, args: string[] = []): Promise<void> {
    return await this.accessResource('processes', 'write', async () => {
      const command = `"${appPath}" ${args.join(' ')}`;
      await execAsync(command);
      console.log(`🚀 Launched: ${appPath}`);
    });
  }
  
  async getRunningProcesses(): Promise<any[]> {
    return await this.accessResource('processes', 'read', async () => {
      const { stdout } = await execAsync(
        process.platform === 'win32' 
          ? 'tasklist /FO CSV /NH' 
          : 'ps aux'
      );
      
      // Parse process list
      const lines = stdout.trim().split('\n');
      return lines.map(line => {
        const parts = line.split(',');
        return {
          name: parts[0]?.replace(/"/g, ''),
          pid: parts[1]?.replace(/"/g, '')
        };
      });
    });
  }
  
  async killProcess(pid: number): Promise<void> {
    return await this.accessResource('processes', 'write', async () => {
      await execAsync(
        process.platform === 'win32'
          ? `taskkill /PID ${pid} /F`
          : `kill -9 ${pid}`
      );
      console.log(`❌ Process killed: ${pid}`);
    });
  }
  
  getSystemMetrics(): any {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      loadAverage: os.loadavg()
    };
  }
}
