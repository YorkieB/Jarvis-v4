import { BaseAgent } from '../base-agent';
import pm2 from 'pm2';

export class SelfHealingAgent extends BaseAgent {
  protected agentType = 'self-healing';
  protected permissions = ['read:agent_health', 'write:agent_health'];
  
  private healthChecks: Map<string, number> = new Map();
  
  async startMonitoring(): Promise<void> {
    // Connect to PM2
    pm2.connect((err) => {
      if (err) {
        console.error('Failed to connect to PM2:', err);
        return;
      }
      
      // Monitor all agents every 30 seconds
      setInterval(() => this.checkAllAgents(), 30000);
    });
  }
  
  private async checkAllAgents(): Promise<void> {
    pm2.list((err, processes) => {
      if (err) return;
      
      for (const proc of processes) {
        if (proc.pm2_env?.status === 'stopped' || proc.pm2_env?.status === 'errored') {
          console.warn(`⚠️  Agent ${proc.name} is ${proc.pm2_env.status} - restarting...`);
          this.restartAgent(proc.name!);
        }
      }
    });
  }
  
  private async restartAgent(agentName: string): Promise<void> {
    pm2.restart(agentName, (err) => {
      if (err) {
        console.error(`Failed to restart ${agentName}:`, err);
      } else {
        console.log(`✅ ${agentName} restarted successfully`);
      }
    });
  }
}
