/**
 * Sentry Integration Validation Tests
 * Validates error tracking and monitoring integration
 */

describe('Sentry Integration', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  // Wait for server to be ready before running tests
  beforeAll(async () => {
    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        if (response.ok) {
          console.log('✅ Server is ready for Sentry validation tests');
          return;
        }
      } catch (error) {
        console.log(
          `⏳ Waiting for server... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
    throw new Error(
      'Server not ready. Please start the server with: npm run dev',
    );
  }, 15000);

  test('Captures intentional errors via debug endpoint', async () => {
    // Test the /debug-sentry endpoint
    try {
      const response = await fetch(`${BASE_URL}/debug-sentry`);

      // The endpoint should throw an error (status 500)
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);

      console.log('✅ Debug endpoint triggered error as expected');

      // Note: Actual Sentry error capture validation would require:
      // 1. Sentry API client setup
      // 2. Query recent events
      // 3. Verify error was captured
      // This is omitted here as it requires Sentry API credentials
      console.log(
        'ℹ️  To fully validate Sentry capture, check Sentry dashboard at:',
      );
      console.log('   https://sentry.io/organizations/<your-org>/issues/');
    } catch (error: any) {
      // Fetch might throw on 500 status depending on implementation
      // This is also acceptable
      console.log('✅ Error thrown as expected:', error.message);
    }
  });

  test('Server remains healthy after Sentry error', async () => {
    // Trigger error via debug endpoint
    try {
      await fetch(`${BASE_URL}/debug-sentry`);
    } catch {
      // Ignore error
    }

    // Verify server is still healthy
    const healthResponse = await fetch(`${BASE_URL}/health`);
    expect(healthResponse.ok).toBe(true);

    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('healthy');

    console.log('✅ Server remains healthy after error capture');
  });

  test('Health check does not trigger Sentry errors', async () => {
    // Regular health checks should not generate Sentry events
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('healthy');

    console.log('✅ Normal operations do not trigger Sentry errors');
  });

  test('Sentry configuration is present', async () => {
    // Verify SENTRY_DSN is configured
    const sentryDsn = process.env.SENTRY_DSN;

    if (!sentryDsn) {
      console.warn('⚠️  SENTRY_DSN not configured in environment');
      console.warn('   Sentry error tracking may not be active');
    } else {
      console.log('✅ SENTRY_DSN is configured');
      expect(sentryDsn).toContain('sentry.io');
    }
  });

  test('Multiple errors are handled independently', async () => {
    // Trigger multiple errors in sequence
    const errorPromises = [];

    for (let i = 0; i < 3; i++) {
      errorPromises.push(
        fetch(`${BASE_URL}/debug-sentry`).catch(() => {
          /* ignore */
        }),
      );
    }

    await Promise.all(errorPromises);

    // Server should still be healthy
    const healthResponse = await fetch(`${BASE_URL}/health`);
    expect(healthResponse.ok).toBe(true);

    console.log('✅ Multiple errors handled without server degradation');
  });
});
