/**
 * Type definitions for Task Management
 */

import { TaskPriority, TaskStatus } from './agentTypes';

export interface TaskPayload {
  [key: string]: unknown;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskMetadata {
  assignedAgentId?: string;
  parentTaskId?: string;
  retryCount: number;
  timeoutMs?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string;
  parentTaskId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}
