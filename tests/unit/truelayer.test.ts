import { TrueLayerClient } from '../../src/services/truelayerClient';

describe('TrueLayerClient', () => {
  const client = new TrueLayerClient();

  it('generates PKCE pair', () => {
    const { verifier, challenge } = client.generatePKCE();
    expect(verifier).toBeTruthy();
    expect(challenge).toBeTruthy();
    expect(challenge.length).toBeGreaterThan(10);
  });
});

