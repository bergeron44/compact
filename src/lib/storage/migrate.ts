import { localDB } from './db';

export async function migrateToIndexedDB(): Promise<void> {
  const migrated = localStorage.getItem('indexeddb_migration_complete');
  if (migrated === 'true') return;

  console.log('[Compact] Starting migration from localStorage to IndexedDB...');

  try {
    await localDB.migrateFromLocalStorage();
    localStorage.setItem('indexeddb_migration_complete', 'true');
    console.log('[Compact] Migration completed successfully.');
  } catch (error) {
    console.error('[Compact] Migration failed:', error);
  }
}
