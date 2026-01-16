/**
 * Type definitions for Hierarchical Agent Delegation System
 */

export type AgentStatus = 'idle' | 'busy' | 'error' | 'stopped';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type FailureType =
  | 'crash'
  | 'timeout'
  | 'error'
  | 'unresponsive'
  | 'logic_error';
export type RecoveryMethod = 'restart' | 'replace' | 'manual' | 'watchdog';

export interface AgentCapabilities {
  agentType: string;
  capabilities: string[];
  maxConcurrentTasks: number;
}

export interface AgentHealthMetrics {
  agentId: string;
  healthScore: number;
  status: AgentStatus;
  currentWorkload: number;
  lastHeartbeat: Date | null;
  consecutiveFailures: number;
}

export interface TaskDecomposition {
  parentTaskId: string;
  subtasks: Array<{
    type: string;
    payload: Record<string, unknown>;
    priority: TaskPriority;
    dependencies?: string[];
  }>;
}
