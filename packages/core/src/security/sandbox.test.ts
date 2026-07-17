import { resolveAndJailPath } from './sandbox';
import * as path from 'path';

describe('Sandbox Security Checks', () => {
  const root = process.platform === 'win32' ? 'C:\\projects\\my-app' : '/data/user/0/com.dextro/repos/my-app';
  
  it('allows safe relative paths', () => {
    const resolved = resolveAndJailPath(root, 'src/index.ts');
    expect(resolved.startsWith(root)).toBe(true);
  });

  it('allows the root path itself', () => {
    const resolved = resolveAndJailPath(root, '.');
    expect(resolved).toBe(path.normalize(root));
  });

  it('rejects path traversal attempts', () => {
    expect(() => resolveAndJailPath(root, '../other-app/src')).toThrow(/Security Exception/);
    expect(() => resolveAndJailPath(root, '../../../../etc/passwd')).toThrow(/Security Exception/);
  });

  it('rejects absolute paths outside the root', () => {
    const maliciousAbs = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/shadow';
    expect(() => resolveAndJailPath(root, maliciousAbs)).toThrow(/Security Exception/);
  });

  it('rejects partial directory name spoofing', () => {
    const spoofedDir = process.platform === 'win32' ? 'C:\\projects\\my-app-hacked' : '/data/user/0/com.dextro/repos/my-app-hacked';
    expect(() => resolveAndJailPath(root, spoofedDir)).toThrow(/Security Exception/);
  });
});
