import type { ToolExecution, ToolStatus } from 'core-types';

/**
 * Visual Execution Queue Manager
 * Manages the lifecycle of tool commands before/after user approval.
 */
export class ActionQueue {
  private queue: ToolExecution[] = [];

  enqueue(tool: Omit<ToolExecution, 'id' | 'status'>): ToolExecution {
    const entry: ToolExecution = {
      ...tool,
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'pending_approval',
    };
    this.queue.push(entry);
    return entry;
  }

  approve(id: string): ToolExecution {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);
    
    tool.status = 'queued';
    tool.approvedAt = Date.now();
    return tool;
  }

  reject(id: string, reason: string): ToolExecution {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);
    
    tool.status = 'failed';
    tool.error = `Rejected by user: ${reason}`;
    tool.completedAt = Date.now();
    return tool;
  }

  updateStatus(id: string, status: ToolStatus, output?: string, error?: string): void {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);
    
    tool.status = status;
    if (output) tool.output = output;
    if (error) tool.error = error;
    if (status === 'completed' || status === 'failed') {
      tool.completedAt = Date.now();
    }
  }

  getAction(id: string): ToolExecution | undefined {
    return this.queue.find((t) => t.id === id);
  }

  getPendingActions(): ToolExecution[] {
    return this.queue.filter((t) => t.status === 'pending_approval');
  }

  getAll(): ToolExecution[] {
    return this.queue;
  }
}
