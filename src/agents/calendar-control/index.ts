import { BaseAgent } from '../base-agent';
import { google } from 'googleapis';

export class CalendarControlAgent extends BaseAgent {
  protected agentType = 'calendar-control';
  protected permissions = ['read:calendar', 'write:calendar'];
  
  private calendar: any;
  
  async initialize(accessToken: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    
    this.calendar = google.calendar({ version: 'v3', auth });
  }
  
  async createEvent(event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    location?: string;
  }): Promise<any> {
    // Check for conflicts first
    const conflicts = await this.checkConflicts(event.startTime, event.endTime);
    
    if (conflicts.length > 0) {
      console.log(`⚠️ Conflict detected with: ${conflicts.map(c => c.summary).join(', ')}`);
      // TODO: Ask user how to proceed
    }
    
    return await this.accessResource('calendar', 'write', async () => {
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: 'America/Los_Angeles'
          },
          end: {
            dateTime: event.endTime.toISOString(),
            timeZone: 'America/Los_Angeles'
          },
          attendees: event.attendees?.map(email => ({ email }))
        }
      });
      
      console.log(`✅ Event created: ${event.summary}`);
      return response.data;
    });
  }
  
  async listEvents(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.accessResource('calendar', 'read', async () => {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      return response.data.items || [];
    });
  }
  
  async checkConflicts(startTime: Date, endTime: Date): Promise<any[]> {
    const events = await this.listEvents(startTime, endTime);
    
    return events.filter(event => {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      
      // Check for overlap
      return (startTime < eventEnd && endTime > eventStart);
    });
  }
  
  async findAvailableSlots(date: Date, duration: number): Promise<Date[]> {
    const dayStart = new Date(date);
    dayStart.setHours(9, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(17, 0, 0, 0);
    
    const events = await this.listEvents(dayStart, dayEnd);
    const availableSlots: Date[] = [];
    
    let currentTime = dayStart;
    
    while (currentTime < dayEnd) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);
      
      const hasConflict = events.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        return (currentTime < eventEnd && slotEnd > eventStart);
      });
      
      if (!hasConflict) {
        availableSlots.push(new Date(currentTime));
      }
      
      currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute intervals
    }
    
    return availableSlots;
  }
  
  async deleteEvent(eventId: string): Promise<void> {
    return await this.accessResource('calendar', 'write', async () => {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId
      });
      
      console.log(`🗑️ Event deleted: ${eventId}`);
    });
  }
  
  async updateEvent(eventId: string, updates: Partial<any>): Promise<any> {
    return await this.accessResource('calendar', 'write', async () => {
      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updates
      });
      
      console.log(`✅ Event updated: ${eventId}`);
      return response.data;
    });
  }
}
