import fs from 'fs';
import path from 'path';
import { SessionStorage, type ISessionData, type Logger } from '@gohighlevel/api-client';

const DEFAULT_STORE_PATH = path.join(process.cwd(), '.tokens.json');

type TokenStoreFile = Record<string, ISessionData>;

function readStoreFile(filePath: string): TokenStoreFile {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeStoreFile(filePath: string, data: TokenStoreFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * SessionStorage backed by a local JSON file, keyed by resourceId (companyId or
 * locationId) — same key scheme TIETOOLS uses for its Supabase-backed storage,
 * but with no external infra dependency.
 */
export class FileSessionStorage extends SessionStorage {
  private clientId = '';
  private filePath: string;
  private cache: TokenStoreFile | null = null;

  constructor(filePath: string = DEFAULT_STORE_PATH, logger?: Logger) {
    super(logger);
    this.filePath = filePath;
  }

  setClientId(clientId: string): void {
    this.clientId = clientId;
  }

  async init(): Promise<void> {
    this.cache = readStoreFile(this.filePath);
  }

  async disconnect(): Promise<void> {
    this.cache = null;
  }

  async createCollection(): Promise<void> {
    // No-op: a single JSON file holds every resource's session.
  }

  async getCollection(collectionName: string): Promise<any> {
    return collectionName;
  }

  private store(): TokenStoreFile {
    if (!this.cache) this.cache = readStoreFile(this.filePath);
    return this.cache;
  }

  private persist(): void {
    writeStoreFile(this.filePath, this.store());
  }

  async setSession(resourceId: string, sessionData: ISessionData): Promise<void> {
    const store = this.store();
    const expire_at =
      typeof sessionData.expire_at === 'number'
        ? sessionData.expire_at
        : this.calculateExpireAt(sessionData.expires_in);

    store[resourceId] = { ...sessionData, expire_at };
    this.persist();
  }

  async getSession(resourceId: string): Promise<ISessionData | null> {
    return this.store()[resourceId] ?? null;
  }

  async deleteSession(resourceId: string): Promise<void> {
    const store = this.store();
    delete store[resourceId];
    this.persist();
  }

  async getAccessToken(resourceId: string): Promise<string | null> {
    return this.store()[resourceId]?.access_token ?? null;
  }

  async getRefreshToken(resourceId: string): Promise<string | null> {
    return this.store()[resourceId]?.refresh_token ?? null;
  }

  async getSessionsByApplication(): Promise<ISessionData[]> {
    return Object.values(this.store());
  }
}
