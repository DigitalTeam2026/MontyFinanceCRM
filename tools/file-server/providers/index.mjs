// Maps a storage_type to its provider. Local and NAS share the filesystem
// provider; s3 and sharepoint are credentialed cloud providers.
import { localProvider } from './local.mjs';
import { s3Provider } from './s3.mjs';
import { sharepointProvider } from './sharepoint.mjs';
import { HttpError } from './util.mjs';

const PROVIDERS = {
  local: localProvider,
  nas: localProvider,
  s3: s3Provider,
  sharepoint: sharepointProvider,
};

/** Storage types that require credentials from Vault. */
export const CREDENTIALED = new Set(['s3', 'sharepoint']);

export function getProvider(storageType) {
  const provider = PROVIDERS[storageType];
  if (!provider) throw new HttpError(400, `Unsupported storage type "${storageType}".`);
  return provider;
}

export { HttpError } from './util.mjs';
