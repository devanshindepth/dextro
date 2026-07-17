import { ActionQueue } from './queue';

describe('ActionQueue State Machine', () => {
  let queue: ActionQueue;

  beforeEach(() => {
    queue = new ActionQueue();
  });

  it('enqueues a tool in pending_approval state', () => {
    const tool = queue.enqueue({ command: 'echo hello', requiresHost: true });
    expect(tool.status).toBe('pending_approval');
    expect(tool.command).toBe('echo hello');
    expect(queue.getPendingActions()).toHaveLength(1);
  });

  it('allows approval of pending tools', () => {
    const tool = queue.enqueue({ command: 'ls', requiresHost: false });
    queue.approve(tool.id);
    expect(queue.getPendingActions()).toHaveLength(0);
    const updatedTool = queue.getAction(tool.id);
    expect(updatedTool?.status).toBe('queued');
    expect(updatedTool?.approvedAt).toBeDefined();
  });

  it('allows rejection of pending tools', () => {
    const tool = queue.enqueue({ command: 'rm -rf /', requiresHost: false });
    queue.reject(tool.id, 'Unsafe operation');
    const updatedTool = queue.getAction(tool.id);
    expect(updatedTool?.status).toBe('failed');
    expect(updatedTool?.error).toContain('Rejected by user: Unsafe operation');
  });

  it('allows updating status to running and completed', () => {
    const tool = queue.enqueue({ command: 'ls', requiresHost: false });
    queue.approve(tool.id);
    queue.updateStatus(tool.id, 'running');
    expect(queue.getAction(tool.id)?.status).toBe('running');
    
    queue.updateStatus(tool.id, 'completed', 'file1.txt\nfile2.txt');
    const finalTool = queue.getAction(tool.id);
    expect(finalTool?.status).toBe('completed');
    expect(finalTool?.output).toBe('file1.txt\nfile2.txt');
  });

  it('rejects state changes on non-existent tools', () => {
    expect(() => queue.approve('fake-id')).toThrow(/Action not found/);
  });
});
