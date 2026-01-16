import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { SystemExecutor } from './systemExecutor';
import logger from '../utils/logger';

interface RegistryOptions {
  path: string;
  name?: string;
  value?: string;
}

export class SystemActions {
  private executor: SystemExecutor;

  constructor(executor?: SystemExecutor) {
    this.executor = executor || new SystemExecutor();
  }

  // Processes
  async listProcesses(): Promise<string> {
    const cmd = os.platform() === 'win32' ? 'tasklist' : 'ps aux';
    const res = await this.executor.execute({ cmd });
    return res.stdout;
  }

  async killProcess(pid: number): Promise<void> {
    const cmd =
      os.platform() === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;
    await this.executor.execute({ cmd });
  }

  // Services
  async listServices(): Promise<string> {
    if (os.platform() === 'win32') {
      const res = await this.executor.execute({
        cmd: 'sc query type= service state= all',
      });
      return res.stdout;
    }
    if (os.platform() === 'darwin') {
      const res = await this.executor.execute({ cmd: 'launchctl list' });
      return res.stdout;
    }
    const res = await this.executor.execute({
      cmd: 'systemctl list-units --type=service --all',
    });
    return res.stdout;
  }

  async restartService(name: string): Promise<void> {
    if (os.platform() === 'win32') {
      await this.executor.execute({
        cmd: `sc stop "${name}" && sc start "${name}"`,
        shell: 'cmd',
      });
      return;
    }
    if (os.platform() === 'darwin') {
      await this.executor.execute({
        cmd: `sudo launchctl stop ${name} && sudo launchctl start ${name}`,
      });
      return;
    }
    await this.executor.execute({ cmd: `sudo systemctl restart ${name}` });
  }

  // Files (guarded)
  async readFileSafe(targetPath: string): Promise<string> {
    const resolved = path.resolve(targetPath);
    return fs.readFile(resolved, 'utf8');
  }

  async writeFileSafe(targetPath: string, content: string): Promise<void> {
    const resolved = path.resolve(targetPath);
    await fs.writeFile(resolved, content, 'utf8');
  }

  async deleteFileSafe(targetPath: string): Promise<void> {
    const resolved = path.resolve(targetPath);
    await fs.rm(resolved, { force: true, recursive: false });
  }

  async listDirSafe(targetPath: string): Promise<string[]> {
    const resolved = path.resolve(targetPath);
    return fs.readdir(resolved);
  }

  // Network
  async pingHost(host: string): Promise<boolean> {
    const cmd =
      os.platform() === 'win32' ? `ping -n 1 ${host}` : `ping -c 1 ${host}`;
    const res = await this.executor.execute({ cmd });
    return res.exitCode === 0;
  }

  async checkPort(
    host: string,
    port: number,
    timeoutMs = 3000,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let finished = false;
      const finish = (value: boolean) => {
        if (!finished) {
          finished = true;
          socket.destroy();
          resolve(value);
        }
      };
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => finish(true));
      socket.on('timeout', () => finish(false));
      socket.on('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  // Registry (Windows only)
  async registryRead(opts: RegistryOptions): Promise<string> {
    if (os.platform() !== 'win32') {
      throw new Error('Registry operations are Windows-only');
    }
    const keyPath = opts.path;
    const name = opts.name ? `-Name "${opts.name}"` : '';
    const cmd = `Get-ItemProperty -Path "${keyPath}" ${name} | ConvertTo-Json -Compress`;
    const res = await this.executor.execute({ cmd, shell: 'powershell' });
    return res.stdout;
  }

  async registryWrite(opts: RegistryOptions): Promise<void> {
    if (os.platform() !== 'win32') {
      throw new Error('Registry operations are Windows-only');
    }
    if (!opts.name || opts.value === undefined) {
      throw new Error('Registry write requires name and value');
    }
    const cmd = `Set-ItemProperty -Path "${opts.path}" -Name "${opts.name}" -Value "${opts.value}"`;
    await this.executor.execute({ cmd, shell: 'powershell' });
  }
}
