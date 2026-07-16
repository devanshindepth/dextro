import type { ToolExecution, ToolStatus } from 'db-schema';

/**
 * Visual Execution Queue Manager
 * Manages the lifecycle of tool commands before/after user approval.
 * Works identically on mobile (local) and daemon (remote) sides.
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

  approve(id: string): ToolExecution | null {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) return null;
    tool.status = tool.requiresHost ? 'queued' : 'running';
    tool.approvedAt = Date.now();
    return tool;
  }

  updateStatus(id: string, status: ToolStatus, output?: string, error?: string): void {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) return;
    tool.status = status;
    if (output) tool.output = output;
    if (error) tool.error = error;
    if (status === 'completed' || status === 'failed') {
      tool.completedAt = Date.now();
    }
  }

  getPending(): ToolExecution[] {
    return this.queue.filter((t) => t.status === 'pending_approval');
  }

  getAll(): ToolExecution[] {
    return this.queue;
  }
}
