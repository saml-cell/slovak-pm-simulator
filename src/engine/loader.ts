import type { EraConfig } from './types';

export async function loadEra(eraId: string): Promise<EraConfig> {
  // Validate era ID to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(eraId)) {
    throw new Error(`Invalid era ID: "${eraId}"`);
  }
  const resp = await fetch(`./eras/${eraId}.json`);
  if (!resp.ok) {
    throw new Error(`Era "${eraId}" not found (${resp.status})`);
  }
  return resp.json() as Promise<EraConfig>;
}
