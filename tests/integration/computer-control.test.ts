import { WindowsControlAgent } from '../../src/agents/windows-control';
import { BrowserControlAgent } from '../../src/agents/browser-control';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Windows Control Agent', () => {
  let windowsAgent: WindowsControlAgent;

  beforeEach(() => {
    windowsAgent = new WindowsControlAgent();
  });

  it('should list directory contents', async () => {
    const files = await windowsAgent.listDirectory('./');
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toHaveProperty('name');
    expect(files[0]).toHaveProperty('path');
    expect(files[0]).toHaveProperty('isDirectory');
  });

  it('should read a file', async () => {
    const content = await windowsAgent.readFile('./package.json');
    expect(content).toContain('jarvis-v4');
  });

  it('should require approval for delete operations', async () => {
    await expect(windowsAgent.deleteFile('/test.txt')).rejects.toThrow('not approved');
  });

  it('should get system metrics', async () => {
    const metrics = windowsAgent.getSystemMetrics();
    expect(metrics).toHaveProperty('platform');
    expect(metrics).toHaveProperty('cpus');
    expect(metrics).toHaveProperty('totalMemory');
  });

  it('should create directory', async () => {
    const testDir = path.join(os.tmpdir(), 'jarvis-test-' + Date.now());
    await windowsAgent.createDirectory(testDir);
    
    const stats = await fs.stat(testDir);
    expect(stats.isDirectory()).toBe(true);
    
    // Cleanup
    await fs.rmdir(testDir);
  });

  it('should write file with approval warning', async () => {
    const testFile = path.join(os.tmpdir(), 'jarvis-test-' + Date.now() + '.txt');
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    await windowsAgent.writeFile(testFile, 'test content', true);
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Approval required'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('File written'));
    
    // Cleanup
    await fs.unlink(testFile);
    consoleLogSpy.mockRestore();
  });
});

describe('Browser Control Agent', () => {
  let browserAgent: BrowserControlAgent;

  beforeEach(() => {
    browserAgent = new BrowserControlAgent();
  });

  afterEach(async () => {
    await browserAgent.shutdown();
  });

  // Skip browser tests in CI environments or if SKIP_BROWSER_TESTS is set
  const skipBrowserTests = process.env.CI === 'true' || process.env.SKIP_BROWSER_TESTS === 'true';
  
  (skipBrowserTests ? it.skip : it)('should navigate to URL', async () => {
    const tabId = await browserAgent.navigateTo('https://example.com');
    expect(tabId).toBeTruthy();
    expect(typeof tabId).toBe('string');
  }, 30000);

  it('should throw error when interacting with non-existent tab', async () => {
    await expect(
      browserAgent.click('invalid-tab-id', 'button')
    ).rejects.toThrow('Tab invalid-tab-id not found');
  });

  (skipBrowserTests ? it.skip : it)('should close tab', async () => {
    const tabId = await browserAgent.navigateTo('https://example.com');
    await browserAgent.closeTab(tabId);
    
    // Trying to interact should now fail
    await expect(
      browserAgent.getText(tabId, 'h1')
    ).rejects.toThrow('not found');
  }, 30000);
});
