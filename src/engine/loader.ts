import type { EraConfig } from './types';

const eraModules = import.meta.glob<{ default: EraConfig }>('../eras/*.json');

export async function loadEra(eraId: string): Promise<EraConfig> {
  if (!/^[a-z0-9-]+$/.test(eraId)) {
    throw new Error(`Invalid era ID: "${eraId}"`);
  }
  const load = eraModules[`../eras/${eraId}.json`];
  if (!load) {
    throw new Error(`Era "${eraId}" not found`);
  }
  const mod = await load();
  return mod.default;
}
