import { Logger, type LogLevelType } from '@gohighlevel/api-client';
import { FileSessionStorage } from './storage';
import { HighLevel } from './client';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see .env.example).`);
  return value;
}

let storageInstance: FileSessionStorage | null = null;

export function getStorage(): FileSessionStorage {
  if (storageInstance) return storageInstance;

  const clientId = requireEnv('GHL_CLIENT_ID');
  const logLevel = (process.env.GHL_SDK_LOG_LEVEL as LogLevelType | undefined) || 'warn';
  const logger = new Logger(logLevel, 'GHL_API_EXT');

  storageInstance = new FileSessionStorage(process.env.GHL_TOKEN_STORE_PATH, logger);
  storageInstance.setClientId(clientId);
  return storageInstance;
}

/**
 * Exchange an OAuth `code` (from the marketplace authorize redirect) for a
 * company access/refresh token pair and persist it under the returned companyId.
 */
export async function exchangeAuthCodeForTokens(code: string): Promise<{ companyId: string; userId: string }> {
  const clientId = requireEnv('GHL_CLIENT_ID');
  const clientSecret = requireEnv('GHL_CLIENT_SECRET');
  const redirectUri = requireEnv('GHL_REDIRECT_URI');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    user_type: 'Company',
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Token exchange failed');
  }
  if (!data.companyId || !data.userId) {
    throw new Error(`Unexpected token response, missing companyId/userId: ${JSON.stringify(data)}`);
  }

  const storage = getStorage();
  await storage.setSession(data.companyId, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_in: data.expires_in,
    scope: data.scope,
    userType: 'Company',
    companyId: data.companyId,
    userId: data.userId,
  });

  return { companyId: data.companyId, userId: data.userId };
}

/**
 * Build a HighLevel SDK client authorized as a company (agency) user. Used
 * only to mint location tokens via `ensureLocationAccessToken` — endpoint
 * wrappers in this package always operate on location-scoped clients.
 */
async function getCompanyHighLevelClient(companyId: string): Promise<HighLevel> {
  const clientId = requireEnv('GHL_CLIENT_ID');
  const clientSecret = requireEnv('GHL_CLIENT_SECRET');
  const logLevel = (process.env.GHL_SDK_LOG_LEVEL as LogLevelType | undefined) || 'warn';
  const storage = getStorage();

  const session = await storage.getSession(companyId);
  if (!session?.access_token) {
    throw new Error(`No company session for companyId=${companyId}. Run "npm run authorize" first.`);
  }

  return new HighLevel({
    clientId,
    clientSecret,
    agencyAccessToken: session.access_token,
    logLevel,
    sessionStorage: storage,
  });
}

/**
 * Get (minting/refreshing as needed) a location access token, caching it in
 * the file store keyed by locationId.
 */
export async function ensureLocationAccessToken(params: { companyId: string; locationId: string }): Promise<string> {
  const storage = getStorage();

  const existing = await storage.getSession(params.locationId);
  const expireAt = typeof existing?.expire_at === 'number' ? existing.expire_at : undefined;
  if (existing?.access_token && expireAt && Date.now() + 30_000 < expireAt) {
    return existing.access_token;
  }

  const ghl = await getCompanyHighLevelClient(params.companyId);
  const tokenData = await ghl.oauth.getLocationAccessToken({
    companyId: params.companyId,
    locationId: params.locationId,
  });

  if (!tokenData?.access_token) {
    throw new Error('No access_token in response from getLocationAccessToken');
  }

  await storage.setSession(params.locationId, {
    access_token: tokenData.access_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in,
    scope: tokenData.scope,
    userType: 'Location',
    companyId: params.companyId,
    locationId: params.locationId,
    userId: tokenData.userId,
  });

  return tokenData.access_token;
}

/**
 * Build a HighLevel SDK client authorized for a single location. This is
 * what every search wrapper in this package uses under the hood.
 */
export async function getLocationHighLevelClient(locationAccessToken: string): Promise<HighLevel> {
  const clientId = requireEnv('GHL_CLIENT_ID');
  const clientSecret = requireEnv('GHL_CLIENT_SECRET');
  const logLevel = (process.env.GHL_SDK_LOG_LEVEL as LogLevelType | undefined) || 'warn';

  return new HighLevel({ clientId, clientSecret, locationAccessToken, logLevel });
}

/** Convenience: resolve a ready-to-use location client from just companyId + locationId. */
export async function getAuthorizedLocationClient(params: {
  companyId: string;
  locationId: string;
}): Promise<HighLevel> {
  const token = await ensureLocationAccessToken(params);
  return getLocationHighLevelClient(token);
}

/** Returns the most recently stored company session, for CLI/script convenience. */
export async function findMostRecentCompanyId(): Promise<string | null> {
  const storage = getStorage();
  const sessions = await storage.getSessionsByApplication();
  const companySessions = sessions.filter((s) => s.userType === 'Company' && s.companyId);
  if (!companySessions.length) return null;
  companySessions.sort((a, b) => (b.expire_at ?? 0) - (a.expire_at ?? 0));
  return companySessions[0].companyId ?? null;
}
