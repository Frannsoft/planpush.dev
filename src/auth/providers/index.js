// Provider registry and common interface
// Each provider exports: { name, getUser(token), getEmail(token) }

import GitHubProvider from './github.js';

const providers = {
  github: GitHubProvider,
};

export function getProvider(idp) {
  if (!providers[idp]) throw new Error(`Unknown provider: ${idp}`);
  return providers[idp];
}

export function listProviders() {
  return Object.keys(providers);
}
