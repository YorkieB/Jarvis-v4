import os from 'os';
import { SystemExecutor } from './systemExecutor';

export type RemediationAction =
  | 'flush_dns'
  | 'reset_network'
  | 'restart_audio'
  | 'clear_temp'
  | 'restart_windows_update';

export class RemediationLibrary {
  private executor: SystemExecutor;

  constructor(executor?: SystemExecutor) {
    this.executor = executor || new SystemExecutor();
  }

  async run(action: RemediationAction): Promise<string> {
    switch (action) {
      case 'flush_dns':
        return this.flushDns();
      case 'reset_network':
        return this.resetNetwork();
      case 'restart_audio':
        return this.restartAudio();
      case 'clear_temp':
        return this.clearTemp();
      case 'restart_windows_update':
        return this.restartWindowsUpdate();
      default:
        throw new Error('Unknown remediation action');
    }
  }

  private async flushDns(): Promise<string> {
    const platform = os.platform();
    if (platform === 'win32') {
      await this.executor.execute({ cmd: 'ipconfig /flushdns', shell: 'cmd' });
      return 'DNS cache flushed (Windows)';
    }
    if (platform === 'darwin') {
      await this.executor.execute({
        cmd: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder',
      });
      return 'DNS cache flushed (macOS)';
    }
    await this.executor.execute({
      cmd: 'sudo systemd-resolve --flush-caches || sudo resolvectl flush-caches',
    });
    return 'DNS cache flushed (Linux)';
  }

  private async resetNetwork(): Promise<string> {
    const platform = os.platform();
    if (platform === 'win32') {
      await this.executor.execute({ cmd: 'netsh winsock reset', shell: 'cmd' });
      await this.executor.execute({ cmd: 'netsh int ip reset', shell: 'cmd' });
      return 'Network stack reset (Windows)';
    }
    if (platform === 'darwin') {
      await this.executor.execute({
        cmd: 'sudo ifconfig en0 down && sudo ifconfig en0 up',
      });
      return 'Network interface restarted (macOS en0)';
    }
    await this.executor.execute({
      cmd: 'sudo systemctl restart NetworkManager || sudo service networking restart',
    });
    return 'Network service restarted (Linux)';
  }

  private async restartAudio(): Promise<string> {
    const platform = os.platform();
    if (platform === 'win32') {
      await this.executor.execute({
        cmd: 'net stop Audiosrv && net start Audiosrv',
        shell: 'cmd',
      });
      return 'Audio service restarted (Windows)';
    }
    if (platform === 'darwin') {
      await this.executor.execute({ cmd: 'sudo killall coreaudiod' });
      return 'CoreAudio restarted (macOS)';
    }
    await this.executor.execute({ cmd: 'pulseaudio -k || true' });
    await this.executor.execute({ cmd: 'pulseaudio --start || true' });
    return 'PulseAudio restarted (Linux)';
  }

  private async clearTemp(): Promise<string> {
    const platform = os.platform();
    if (platform === 'win32') {
      await this.executor.execute({
        cmd: 'del /q/f/s %TEMP%\\*',
        shell: 'cmd',
      });
      return 'Temp cleared (Windows)';
    }
    await this.executor.execute({ cmd: 'rm -rf /tmp/*' });
    return 'Temp cleared (*nix)';
  }

  private async restartWindowsUpdate(): Promise<string> {
    if (os.platform() !== 'win32') {
      throw new Error('Windows Update remediation is Windows-only');
    }
    await this.executor.execute({
      cmd: 'net stop wuauserv && net stop bits',
      shell: 'cmd',
    });
    await this.executor.execute({
      cmd: 'net start wuauserv && net start bits',
      shell: 'cmd',
    });
    return 'Windows Update services restarted';
  }
}
