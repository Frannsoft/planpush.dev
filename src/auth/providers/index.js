// Provider registry and common interface
// Each provider exports: { name, getUser(token), getEmail(token) }

import GitHubProvider from './github.js';
import OktaProvider from './okta.js';

const providers = {
  github: GitHubProvider,
  okta: OktaProvider,
};

export function getProvider(idp) {
  if (!providers[idp]) throw new Error(`Unknown provider: ${idp}`);
  return providers[idp];
}

export function listProviders() {
  return Object.keys(providers);
}
