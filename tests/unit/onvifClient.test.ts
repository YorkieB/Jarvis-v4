import { OnvifClient } from '../../src/services/onvifClient';

describe('OnvifClient', () => {
  it('initializes with camera info', () => {
    const client = new OnvifClient({
      hostname: '192.168.1.100',
      port: 80,
      username: 'admin',
      password: 'password',
    });
    expect(client).toBeDefined();
  });

  it('throws error when not connected', async () => {
    const client = new OnvifClient({
      hostname: '192.168.1.100',
      port: 80,
      username: 'admin',
      password: 'password',
    });
    await expect(client.getCapabilities()).rejects.toThrow('Camera not connected');
  });
});
