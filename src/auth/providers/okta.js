// Okta OIDC provider using openid-client
// Handles OIDC Authorization Code + PKCE flow with ID-token signature verification

import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  randomState,
  randomNonce,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
} from 'openid-client';
import { createHash } from 'crypto';

let discoveredConfig = null;

// Lazy-initialize OIDC discovery
async function getDiscoveredConfig() {
  if (discoveredConfig) return discoveredConfig;

  const issuerUrl = process.env.OKTA_ISSUER;
  if (!issuerUrl) {
    throw new Error('OKTA_ISSUER environment variable is required');
  }

  discoveredConfig = await discovery(
    new URL(issuerUrl),
    process.env.OKTA_CLIENT_ID,
    process.env.OKTA_CLIENT_SECRET
  );

  return discoveredConfig;
}

// Compute PKCE challenge from verifier
function getPKCEChallenge(verifier) {
  return calculatePKCECodeChallenge(verifier);
}

export default {
  name: 'okta',

  // Exchange authorization code for ID token (OIDC)
  // Returns { subject, email, email_verified, name, groups, id_token }
  async exchangeCodeForToken(code, redirectUri, codeVerifier, nonce) {
    const config = await getDiscoveredConfig();

    // Use openid-client to exchange code for tokens
    // authorizationCodeGrant handles JWT signature verification + nonce validation
    const tokens = await authorizationCodeGrant(
      config,
      {
        code,
        redirect_uri: redirectUri,
      },
      {
        expectedNonce: nonce,
        code_verifier: codeVerifier,
      }
    );

    // Extract claims from ID token
    const claims = tokens.claims();

    return {
      subject: claims.sub,
      email: claims.email,
      email_verified: claims.email_verified,
      name: claims.name || claims.preferred_username,
      groups: claims.groups || [],
      id_token: tokens.id_token,
    };
  },

  // Build authorization request URL with PKCE
  // Returns { authorizationUrl, codeVerifier, nonce }
  async getAuthorizationUrl(redirectUri, state) {
    const config = await getDiscoveredConfig();

    // Generate PKCE verifier and challenge
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = getPKCEChallenge(codeVerifier);

    // Generate nonce for ID token validation
    const nonce = randomNonce();

    // Build authorization URL
    const authorizationUrl = buildAuthorizationUrl(config, {
      client_id: process.env.OKTA_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce,
    });

    return {
      authorizationUrl: authorizationUrl.toString(),
      codeVerifier,
      nonce,
    };
  },

  // Get OAuth config from environment
  getOAuthConfig() {
    return {
      issuer: process.env.OKTA_ISSUER,
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
    };
  },

  // Check if the provider is configured
  isConfigured() {
    return !!(process.env.OKTA_ISSUER && process.env.OKTA_CLIENT_ID && process.env.OKTA_CLIENT_SECRET);
  },

  // Build end session URL for RP-initiated logout via end_session_endpoint
  // Returns the URL to redirect to, or null if not configured
  async getEndSessionUrl(idToken, postLogoutRedirectUri) {
    if (!idToken || !postLogoutRedirectUri) return null;

    const config = await getDiscoveredConfig();
    const endSessionEndpoint = config.end_session_endpoint;
    if (!endSessionEndpoint) return null;

    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: postLogoutRedirectUri,
      client_id: process.env.OKTA_CLIENT_ID,
    });

    return `${endSessionEndpoint}?${params}`;
  },
};
