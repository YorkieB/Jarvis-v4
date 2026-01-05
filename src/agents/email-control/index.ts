import { BaseAgent } from '../base-agent';
import { google } from 'googleapis';

export class EmailControlAgent extends BaseAgent {
  protected agentType = 'email-control';
  protected permissions = ['read:email', 'write:email'];
  
  private gmail: any;
  
  async initialize(accessToken: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    
    this.gmail = google.gmail({ version: 'v1', auth });
  }
  
  async listEmails(query?: string, maxResults: number = 10): Promise<any[]> {
    return await this.accessResource('email', 'read', async () => {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });
      
      const messages = response.data.messages || [];
      
      // Fetch full details for each message
      const emails = await Promise.all(
        messages.map(async (msg: any) => {
          const details = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id
          });
          
          return this.parseEmail(details.data);
        })
      );
      
      return emails;
    });
  }
  
  async readEmail(emailId: string): Promise<any> {
    return await this.accessResource('email', 'read', async () => {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId
      });
      
      return this.parseEmail(response.data);
    });
  }
  
  async sendEmail(to: string, subject: string, body: string, requireApproval: boolean = true): Promise<void> {
    if (requireApproval) {
      console.log(`⚠️ Approval required to send email to ${to}: "${subject}"`);
      // TODO: Request approval
    }
    
    return await this.accessResource('email', 'write', async () => {
      const message = [
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\n');
      
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });
      
      console.log(`✅ Email sent to ${to}`);
    });
  }
  
  async labelEmail(emailId: string, labelId: string): Promise<void> {
    return await this.accessResource('email', 'write', async () => {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: [labelId]
        }
      });
    });
  }
  
  async archiveEmail(emailId: string): Promise<void> {
    return await this.accessResource('email', 'write', async () => {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          removeLabelIds: ['INBOX']
        }
      });
      
      console.log(`📦 Email archived: ${emailId}`);
    });
  }
  
  async summarizeInbox(): Promise<string> {
    const emails = await this.listEmails('is:unread', 20);
    
    const summary = {
      unreadCount: emails.length,
      categories: this.categorizeEmails(emails),
      urgent: emails.filter((e: any) => e.labels?.includes('IMPORTANT')).length
    };
    
    return `You have ${summary.unreadCount} unread emails. ${summary.urgent} are marked urgent.`;
  }
  
  private parseEmail(data: any): any {
    const headers = data.payload.headers;
    
    return {
      id: data.id,
      threadId: data.threadId,
      from: headers.find((h: any) => h.name === 'From')?.value,
      to: headers.find((h: any) => h.name === 'To')?.value,
      subject: headers.find((h: any) => h.name === 'Subject')?.value,
      date: headers.find((h: any) => h.name === 'Date')?.value,
      snippet: data.snippet,
      labels: data.labelIds
    };
  }
  
  private categorizeEmails(emails: any[]): Record<string, number> {
    const categories: Record<string, number> = {};
    
    for (const email of emails) {
      const category = this.detectCategory(email);
      categories[category] = (categories[category] || 0) + 1;
    }
    
    return categories;
  }
  
  private detectCategory(email: any): string {
    const subject = email.subject?.toLowerCase() || '';
    
    if (subject.includes('invoice') || subject.includes('receipt')) return 'billing';
    if (subject.includes('meeting') || subject.includes('calendar')) return 'scheduling';
    if (subject.includes('security') || subject.includes('alert')) return 'security';
    
    return 'general';
  }
}
