/**
 * Dextro Action Queue
 *
 * Manages the lifecycle of tool executions from pending_approval through completion.
 * Each ToolExecution in the queue has a trust tier that determines approval requirements.
 */

import type { ToolExecution, ToolStatus, SecurityTier } from 'core-types';

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

  /** Approve a tool — transitions directly to 'running' */
  approve(id: string): ToolExecution {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);

    tool.status = 'running';
    tool.approvedAt = Date.now();
    tool.startedAt = Date.now();
    return tool;
  }

  /** Mark a tool as rejected (failed with user rejection message) */
  reject(id: string, reason: string): ToolExecution {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);

    tool.status = 'failed';
    tool.error = `Rejected: ${reason}`;
    tool.completedAt = Date.now();
    return tool;
  }

  /**
   * Auto-approve a tool (for 'auto' tier or when security preset allows it).
   * Skips the pending_approval state entirely.
   */
  autoApprove(id: string): ToolExecution {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);

    tool.status = 'running';
    tool.approvedAt = Date.now();
    tool.startedAt = Date.now();
    return tool;
  }

  /** Append a chunk to the live streaming output */
  updateStreamingOutput(id: string, chunk: string): void {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) return;
    tool.streamingOutput = (tool.streamingOutput ?? '') + chunk;
  }

  /** Update status and final output/error */
  updateStatus(id: string, status: ToolStatus, output?: string, error?: string): void {
    const tool = this.queue.find((t) => t.id === id);
    if (!tool) throw new Error(`Action not found: ${id}`);

    tool.status = status;
    if (output !== undefined) tool.output = output;
    if (error !== undefined) tool.error = error;
    if (status === 'completed' || status === 'failed') {
      tool.completedAt = Date.now();
      // Clear streaming buffer on completion
      tool.streamingOutput = undefined;
    }
  }

  getAction(id: string): ToolExecution | undefined {
    return this.queue.find((t) => t.id === id);
  }

  getPendingActions(): ToolExecution[] {
    return this.queue.filter((t) => t.status === 'pending_approval');
  }

  getRunningActions(): ToolExecution[] {
    return this.queue.filter((t) => t.status === 'running');
  }

  getAll(): ToolExecution[] {
    return this.queue;
  }

  clear(): void {
    this.queue = [];
  }
}
