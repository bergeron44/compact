import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ============================================
// DATABASE SCHEMA DEFINITION
// ============================================

export interface CompactDB extends DBSchema {
  users: {
    key: string;
    value: {
      employeeId: string;
      fullName: string;
      projectName: string;
      registeredAt: string;
      lastLogin?: string;
    };
    indexes: {
      'by-name': string;
      'by-project': string;
    };
  };

  cache: {
    key: number;
    value: {
      id?: number;
      projectId: string;
      employeeId: string;
      queryText: string;
      llmResponse: string;
      compressedPrompt: string;
      embedding: number[];
      hitCount: number;
      compressionRatio: number;
      originalTokens: number;
      compressedTokens: number;
      createdAt: string;
      lastAccessed: string;
    };
    indexes: {
      'by-project': string;
      'by-employee': string;
      'by-query': string;
      'by-date': string;
    };
  };

  prompts: {
    key: number;
    value: {
      id?: number;
      employeeId: string;
      projectId: string;
      queryText: string;
      timestamp: string;
      cached: boolean;
      responseTime?: number;
    };
    indexes: {
      'by-employee': string;
      'by-project': string;
      'by-date': string;
    };
  };
}

// ============================================
// TYPE ALIASES
// ============================================

export type UserValue = CompactDB['users']['value'];
export type CacheValue = CompactDB['cache']['value'];
export type PromptValue = CompactDB['prompts']['value'];

// ============================================
// DATABASE CLASS
// ============================================

class LocalDatabase {
  private db: IDBPDatabase<CompactDB> | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly DB_NAME = 'dell-compact-db';
  private readonly DB_VERSION = 3;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.db = await openDB<CompactDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          // ── Version 1: initial schema ──────────────────────────
          if (oldVersion < 1) {
            const usersStore = db.createObjectStore('users', { keyPath: 'employeeId' });
            usersStore.createIndex('by-name', 'fullName');
            usersStore.createIndex('by-project', 'projectName');

            const cacheStore = db.createObjectStore('cache', {
              keyPath: 'id',
              autoIncrement: true,
            });
            cacheStore.createIndex('by-project', 'projectId');
            cacheStore.createIndex('by-employee', 'employeeId');
            cacheStore.createIndex('by-query', 'queryText');
            cacheStore.createIndex('by-date', 'createdAt');

            const promptsStore = db.createObjectStore('prompts', {
              keyPath: 'id',
              autoIncrement: true,
            });
            promptsStore.createIndex('by-employee', 'employeeId');
            promptsStore.createIndex('by-project', 'projectId');
            promptsStore.createIndex('by-date', 'timestamp');
          }

          // ── Version 2: rename compressedResponse → compressedPrompt ──
          if (oldVersion < 2 && oldVersion >= 1) {
            const cacheStore = transaction.objectStore('cache');
            const request = cacheStore.openCursor();
            request.onsuccess = function () {
              const cursor = request.result;
              if (!cursor) return;
              const record = cursor.value as Record<string, unknown>;
              if ('compressedResponse' in record && !('compressedPrompt' in record)) {
                record['compressedPrompt'] = record['compressedResponse'];
                delete record['compressedResponse'];
                cursor.update(record);
              }
              cursor.continue();
            };
          }

          // ── Version 3: clear cache (old 8-dim embeddings → new 384/768-dim) ──
          if (oldVersion < 3 && oldVersion >= 1) {
            const cacheStore = transaction.objectStore('cache');
            cacheStore.clear();
            console.info(
              '[db] Cleared cache store during upgrade to v3 (embedding dimension change).'
            );
          }
        },
      });
    })();

    await this.initPromise;
  }

  private async ensureInit(): Promise<void> {
    if (!this.db) await this.init();
  }

  // ============================================
  // USERS OPERATIONS
  // ============================================

  async addUser(user: Omit<UserValue, 'registeredAt' | 'lastLogin'>): Promise<string> {
    await this.ensureInit();
    const record: UserValue = {
      ...user,
      registeredAt: new Date().toISOString(),
    };
    await this.db!.add('users', record);
    return user.employeeId;
  }

  async getUser(employeeId: string): Promise<UserValue | undefined> {
    await this.ensureInit();
    return await this.db!.get('users', employeeId);
  }

  async updateUserLogin(employeeId: string): Promise<void> {
    await this.ensureInit();
    const user = await this.getUser(employeeId);
    if (user) {
      user.lastLogin = new Date().toISOString();
      await this.db!.put('users', user);
    }
  }

  async getAllUsers(): Promise<UserValue[]> {
    await this.ensureInit();
    return await this.db!.getAll('users');
  }

  // ============================================
  // CACHE OPERATIONS
  // ============================================

  async addToCache(
    entry: Omit<CacheValue, 'id' | 'hitCount' | 'createdAt' | 'lastAccessed'>
  ): Promise<number> {
    await this.ensureInit();
    const record = {
      ...entry,
      hitCount: 1,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };
    const id = await this.db!.add('cache', record);
    return id as number;
  }

  async getCacheEntry(id: number): Promise<CacheValue | undefined> {
    await this.ensureInit();
    return await this.db!.get('cache', id);
  }

  async getCacheByProject(projectId: string): Promise<CacheValue[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-project', projectId);
  }

  async getCacheByEmployee(employeeId: string): Promise<CacheValue[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-employee', employeeId);
  }

  async updateCacheHit(id: number): Promise<void> {
    await this.ensureInit();
    const entry = await this.getCacheEntry(id);
    if (entry) {
      entry.hitCount += 1;
      entry.lastAccessed = new Date().toISOString();
      await this.db!.put('cache', entry);
    }
  }

  async deleteCache(id: number): Promise<void> {
    await this.ensureInit();
    await this.db!.delete('cache', id);
  }

  async deleteCacheByIndices(projectId: string, indices: number[]): Promise<void> {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const tx = this.db!.transaction('cache', 'readwrite');
    const toDelete = entries.filter((_, i) => indices.includes(i));
    await Promise.all(toDelete.map((e) => tx.store.delete(e.id!)));
    await tx.done;
  }

  async clearCacheForProject(projectId: string): Promise<void> {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const tx = this.db!.transaction('cache', 'readwrite');
    await Promise.all(entries.map((e) => tx.store.delete(e.id!)));
    await tx.done;
  }

  // ============================================
  // PROMPTS OPERATIONS
  // ============================================

  async addPrompt(prompt: Omit<PromptValue, 'id' | 'timestamp'>): Promise<number> {
    await this.ensureInit();
    const record = {
      ...prompt,
      timestamp: new Date().toISOString(),
    };
    const id = await this.db!.add('prompts', record);
    return id as number;
  }

  async getPromptsByEmployee(employeeId: string): Promise<PromptValue[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-employee', employeeId);
  }

  async getPromptsByProject(projectId: string): Promise<PromptValue[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-project', projectId);
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getCacheStats(projectId: string): Promise<{
    totalQueries: number;
    totalHits: number;
    hitRate: number;
    avgCompression: number;
  }> {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const totalQueries = entries.length;
    const totalHits = entries.reduce((sum, e) => sum + (e.hitCount - 1), 0);
    const hitRate =
      totalQueries > 0
        ? Math.round((totalHits / (totalHits + totalQueries)) * 100)
        : 0;
    const avgCompression =
      totalQueries > 0
        ? Math.round(
            entries.reduce((sum, e) => sum + e.compressionRatio, 0) / totalQueries
          )
        : 0;
    return { totalQueries, totalHits, hitRate, avgCompression };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // EXPORT / IMPORT
  // ============================================

  async exportData(): Promise<string> {
    await this.ensureInit();
    const [users, cache, prompts] = await Promise.all([
      this.getAllUsers(),
      this.db!.getAll('cache'),
      this.db!.getAll('prompts'),
    ]);

    const exportPayload = {
      version: this.DB_VERSION,
      exportedAt: new Date().toISOString(),
      users,
      cache,
      prompts,
    };

    return JSON.stringify(exportPayload, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    await this.ensureInit();
    const data = JSON.parse(jsonData) as {
      users?: UserValue[];
      cache?: CacheValue[];
      prompts?: PromptValue[];
    };

    const tx = this.db!.transaction(['users', 'cache', 'prompts'], 'readwrite');
    await Promise.all([
      tx.objectStore('users').clear(),
      tx.objectStore('cache').clear(),
      tx.objectStore('prompts').clear(),
    ]);

    for (const user of data.users || []) {
      await tx.objectStore('users').add(user);
    }
    for (const entry of data.cache || []) {
      await tx.objectStore('cache').add(entry);
    }
    for (const prompt of data.prompts || []) {
      await tx.objectStore('prompts').add(prompt);
    }

    await tx.done;
  }

  // ============================================
  // MIGRATION FROM LOCALSTORAGE
  // ============================================

  async migrateFromLocalStorage(): Promise<void> {
    await this.ensureInit();

    // Migrate users
    const orgUsersRaw = localStorage.getItem('dell_compact_org_users');
    if (orgUsersRaw) {
      const orgUsers = JSON.parse(orgUsersRaw) as Array<{
        employeeId: string;
        fullName: string;
        projectName: string;
        registeredAt: string;
        prompts: Array<{ text: string; vector: number[]; frequency: number; lastUsed: string }>;
      }>;
      for (const u of orgUsers) {
        const exists = await this.getUser(u.employeeId);
        if (!exists) {
          const record: UserValue = {
            employeeId: u.employeeId,
            fullName: u.fullName,
            projectName: u.projectName,
            registeredAt: u.registeredAt || new Date().toISOString(),
          };
          await this.db!.add('users', record);
        }
        // Migrate embedded prompts
        if (u.prompts?.length) {
          for (const p of u.prompts) {
            await this.addPrompt({
              employeeId: u.employeeId,
              projectId: u.employeeId, // projectId = employeeId in old schema
              queryText: p.text,
              cached: false,
            });
          }
        }
      }
    }

    // Migrate cache
    const cacheRaw = localStorage.getItem('dell_compact_cache');
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw) as Record<
        string,
        Array<{
          queryText: string;
          llmResponse: string;
          compressedPrompt: string;
          vector: number[];
          compressionRatio: number;
          originalTokens: number;
          compressedTokens: number;
          hitCount: number;
          createdAt: string;
          lastAccessed: string;
        }>
      >;
      for (const projectId in cache) {
        for (const entry of cache[projectId]) {
          await this.addToCache({
            projectId,
            employeeId: projectId, // projectId = employeeId in old schema
            queryText: entry.queryText,
            llmResponse: entry.llmResponse,
            compressedPrompt: entry.compressedPrompt,
            embedding: entry.vector || [],
            compressionRatio: entry.compressionRatio ?? 0,
            originalTokens: entry.originalTokens ?? 0,
            compressedTokens: entry.compressedTokens ?? 0,
          });
        }
      }
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const localDB = new LocalDatabase();
