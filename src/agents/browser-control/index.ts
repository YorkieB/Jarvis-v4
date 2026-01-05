import { BaseAgent } from '../base-agent';
import { chromium, Browser, Page } from 'playwright';

export class BrowserControlAgent extends BaseAgent {
  protected agentType = 'browser-control';
  protected permissions = ['read:browser', 'write:browser'];
  
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });
    
    console.log('🌐 Browser initialized');
  }
  
  async navigateTo(url: string, tabId?: string): Promise<string> {
    return await this.accessResource('browser', 'write', async () => {
      if (!this.browser) await this.initialize();
      
      let page: Page;
      
      if (tabId && this.pages.has(tabId)) {
        page = this.pages.get(tabId)!;
      } else {
        page = await this.browser!.newPage();
        const newTabId = tabId || `tab-${Date.now()}`;
        this.pages.set(newTabId, page);
        tabId = newTabId;
      }
      
      await page.goto(url);
      console.log(`✅ Navigated to: ${url}`);
      
      return tabId;
    });
  }
  
  async click(tabId: string, selector: string): Promise<void> {
    return await this.accessResource('browser', 'write', async () => {
      const page = this.pages.get(tabId);
      if (!page) throw new Error(`Tab ${tabId} not found`);
      
      await page.click(selector);
    });
  }
  
  async fill(tabId: string, selector: string, value: string): Promise<void> {
    return await this.accessResource('browser', 'write', async () => {
      const page = this.pages.get(tabId);
      if (!page) throw new Error(`Tab ${tabId} not found`);
      
      await page.fill(selector, value);
    });
  }
  
  async getText(tabId: string, selector: string): Promise<string> {
    return await this.accessResource('browser', 'read', async () => {
      const page = this.pages.get(tabId);
      if (!page) throw new Error(`Tab ${tabId} not found`);
      
      const element = await page.$(selector);
      if (!element) throw new Error(`Element ${selector} not found`);
      
      return await element.textContent() || '';
    });
  }
  
  async screenshot(tabId: string, fullPage: boolean = false): Promise<Buffer> {
    return await this.accessResource('browser', 'read', async () => {
      const page = this.pages.get(tabId);
      if (!page) throw new Error(`Tab ${tabId} not found`);
      
      return await page.screenshot({ fullPage });
    });
  }
  
  async executeScript(tabId: string, script: string): Promise<any> {
    return await this.accessResource('browser', 'write', async () => {
      const page = this.pages.get(tabId);
      if (!page) throw new Error(`Tab ${tabId} not found`);
      
      return await page.evaluate(script);
    });
  }
  
  async closeTab(tabId: string): Promise<void> {
    const page = this.pages.get(tabId);
    if (page) {
      await page.close();
      this.pages.delete(tabId);
      console.log(`❌ Tab closed: ${tabId}`);
    }
  }
  
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
      console.log('🌐 Browser closed');
    }
  }
}
