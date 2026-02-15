/**
 * Interactive testing functions for IndexedDB operations
 * Usage: Open browser console and call these functions
 */

import { localDB } from './db';

// ============================================
// USER TESTS
// ============================================

/**
 * Test 1: Add a user
 * Usage: await testAddUser()
 */
export async function testAddUser() {
  console.log('🧪 Testing: Add User...');

  try {
    await localDB.addUser({
      employeeId: 'TEST001',
      fullName: 'Test User',
      projectName: 'project_alpha',
    });

    console.log('✅ User added successfully');
    console.log('Verify in DevTools → Application → IndexedDB → users table');

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

/**
 * Test 2: Get a user
 * Usage: await testGetUser('TEST001')
 */
export async function testGetUser(employeeId: string = 'TEST001') {
  console.log(`🧪 Testing: Get User ${employeeId}...`);

  try {
    const user = await localDB.getUser(employeeId);

    if (user) {
      console.log('✅ User found:', user);
      return user;
    } else {
      console.log('⚠️ User not found');
      return null;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

/**
 * Test 3: Get all users
 * Usage: await testGetAllUsers()
 */
export async function testGetAllUsers() {
  console.log('🧪 Testing: Get All Users...');

  try {
    const users = await localDB.getAllUsers();
    console.log(`✅ Found ${users.length} users:`, users);
    return users;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return [];
  }
}

/**
 * Test 4: Update user (login timestamp)
 * Usage: await testUpdateUser('TEST001')
 */
export async function testUpdateUser(employeeId: string = 'TEST001') {
  console.log(`🧪 Testing: Update User ${employeeId}...`);

  try {
    await localDB.updateUserLogin(employeeId);
    const user = await localDB.getUser(employeeId);

    console.log('✅ User updated. Last login:', user?.lastLogin);
    return user;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

// ============================================
// CACHE TESTS
// ============================================

/**
 * Test 5: Add to cache
 * Usage: await testAddCache()
 */
export async function testAddCache() {
  console.log('🧪 Testing: Add to Cache...');

  try {
    const id = await localDB.addToCache({
      projectId: 'project_alpha',
      employeeId: 'TEST001',
      queryText: 'What is RAG?',
      llmResponse: 'RAG stands for Retrieval-Augmented Generation...',
      compressedPrompt: 'RAG: Retrieval-Augmented Generation...',
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // Mock vector
      compressionRatio: 45,
      originalTokens: 100,
      compressedTokens: 45,
    });

    console.log('✅ Cache entry added with ID:', id);
    console.log('Verify in DevTools → Application → IndexedDB → cache table');

    return id;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

/**
 * Test 6: Get cache by project
 * Usage: await testGetCacheByProject('project_alpha')
 */
export async function testGetCacheByProject(projectId: string = 'project_alpha') {
  console.log(`🧪 Testing: Get Cache for ${projectId}...`);

  try {
    const entries = await localDB.getCacheByProject(projectId);
    console.log(`✅ Found ${entries.length} cache entries:`, entries);
    return entries;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return [];
  }
}

/**
 * Test 7: Update cache hit count
 * Usage: await testUpdateCacheHit(1)
 * Or: await testUpdateCacheHitFirst() - updates first cache entry in project_alpha
 */
export async function testUpdateCacheHit(cacheId: number) {
  console.log(`🧪 Testing: Update Cache Hit for ID ${cacheId}...`);

  try {
    await localDB.updateCacheHit(cacheId);
    const entry = await localDB.getCacheEntry(cacheId);

    console.log('✅ Hit count updated:', entry?.hitCount);
    return entry;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

/** Updates first cache entry in project_alpha (for UI / standalone runs) */
export async function testUpdateCacheHitFirst() {
  const entries = await localDB.getCacheByProject('project_alpha');
  if (entries.length === 0) {
    console.log('⚠️ No cache entries - run Add Cache first');
    return false;
  }
  const id = entries[0].id!;
  return testUpdateCacheHit(id);
}

/**
 * Test 8: Delete cache entry
 * Usage: await testDeleteCache(1)
 */
export async function testDeleteCache(cacheId: number) {
  console.log(`🧪 Testing: Delete Cache ID ${cacheId}...`);

  try {
    await localDB.deleteCache(cacheId);
    const entry = await localDB.getCacheEntry(cacheId);

    if (!entry) {
      console.log('✅ Cache entry deleted successfully');
      return true;
    } else {
      console.log('⚠️ Cache entry still exists');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

/**
 * Test 9: Get cache stats
 * Usage: await testGetCacheStats('project_alpha')
 */
export async function testGetCacheStats(projectId: string = 'project_alpha') {
  console.log(`🧪 Testing: Get Cache Stats for ${projectId}...`);

  try {
    const stats = await localDB.getCacheStats(projectId);
    console.log('✅ Cache stats:', stats);
    return stats;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

// ============================================
// PROMPTS TESTS
// ============================================

/**
 * Test 10: Add prompt
 * Usage: await testAddPrompt()
 */
export async function testAddPrompt() {
  console.log('🧪 Testing: Add Prompt...');

  try {
    const id = await localDB.addPrompt({
      employeeId: 'TEST001',
      projectId: 'project_alpha',
      queryText: 'What is machine learning?',
      cached: false,
      responseTime: 1500,
    });

    console.log('✅ Prompt added with ID:', id);
    return id;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

/**
 * Test 11: Get prompts by employee
 * Usage: await testGetPromptsByEmployee('TEST001')
 */
export async function testGetPromptsByEmployee(employeeId: string = 'TEST001') {
  console.log(`🧪 Testing: Get Prompts for ${employeeId}...`);

  try {
    const prompts = await localDB.getPromptsByEmployee(employeeId);
    console.log(`✅ Found ${prompts.length} prompts:`, prompts);
    return prompts;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return [];
  }
}

// ============================================
// EXPORT/IMPORT TESTS
// ============================================

/**
 * Test 12: Export all data
 * Usage: await testExportData()
 */
export async function testExportData() {
  console.log('🧪 Testing: Export Data...');

  try {
    const json = await localDB.exportData();
    console.log('✅ Data exported successfully');
    console.log('JSON length:', json.length, 'characters');

    // Download as file
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indexeddb-export-${Date.now()}.json`;
    a.click();

    console.log('💾 Downloaded as file');
    return json;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

/**
 * Test 13: Import data
 * Usage: await testImportData(jsonString)
 */
export async function testImportData(jsonData: string) {
  console.log('🧪 Testing: Import Data...');

  try {
    await localDB.importData(jsonData);
    console.log('✅ Data imported successfully');

    // Verify
    const users = await localDB.getAllUsers();
    const cache = await localDB.getCacheByProject('project_alpha');

    console.log(`Imported: ${users.length} users, ${cache.length} cache entries`);
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// ============================================
// MIGRATION TEST
// ============================================

/**
 * Test 14: Simulate migration
 * Usage: await testMigration()
 */
export async function testMigration() {
  console.log('🧪 Testing: Migration from localStorage...');

  try {
    // Setup mock localStorage data
    const mockUsers = [
      {
        employeeId: 'MIGRATE001',
        fullName: 'Migration Test User',
        projectName: 'project_beta',
        prompts: [],
        registeredAt: new Date().toISOString(),
      },
    ];

    const mockCache = {
      project_beta: [
        {
          queryText: 'Test query',
          llmResponse: 'Test response',
          compressedPrompt: 'Test compressed',
          vector: [0.1, 0.2],
          hitCount: 1,
          compressionRatio: 50,
          originalTokens: 100,
          compressedTokens: 50,
        },
      ],
    };

    localStorage.setItem('dell_compact_org_users', JSON.stringify(mockUsers));
    localStorage.setItem('dell_compact_cache', JSON.stringify(mockCache));

    console.log('📦 Mock localStorage data created');

    // Run migration
    await localDB.migrateFromLocalStorage();

    console.log('✅ Migration completed');

    // Verify
    const migratedUser = await localDB.getUser('MIGRATE001');
    const migratedCache = await localDB.getCacheByProject('project_beta');

    console.log('Migrated user:', migratedUser);
    console.log('Migrated cache entries:', migratedCache.length);

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// ============================================
// CLEANUP
// ============================================

/**
 * Test 15: Clear all data (DANGEROUS!)
 * Usage: await testClearAll()
 */
export async function testClearAll() {
  const confirm = window.confirm(
    '⚠️ WARNING: This will DELETE ALL DATA from IndexedDB!\n\nAre you sure?'
  );

  if (!confirm) {
    console.log('❌ Cancelled');
    return false;
  }

  console.log('🧪 Testing: Clear All Data...');

  try {
    await localDB.deleteDatabase();
    console.log('✅ All data cleared');
    console.log('🔄 Refresh the page to reinitialize');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// ============================================
// RUN ALL TESTS
// ============================================

/**
 * Run all tests in sequence
 * Usage: await runAllTests()
 */
export async function runAllTests() {
  console.log('🚀 Running ALL tests...\n');

  const results: { test: string; passed: boolean }[] = [];

  try {
    // Users
    results.push({ test: 'Add User', passed: await testAddUser() });
    results.push({ test: 'Get User', passed: !!(await testGetUser()) });
    results.push({ test: 'Update User', passed: !!(await testUpdateUser()) });
    results.push({ test: 'Get All Users', passed: (await testGetAllUsers()).length > 0 });

    // Cache
    const cacheId = await testAddCache();
    results.push({ test: 'Add Cache', passed: !!cacheId });
    results.push({ test: 'Get Cache', passed: (await testGetCacheByProject()).length > 0 });

    if (cacheId) {
      results.push({ test: 'Update Cache Hit', passed: !!(await testUpdateCacheHit(cacheId)) });
    }

    results.push({ test: 'Get Cache Stats', passed: !!(await testGetCacheStats()) });

    // Prompts
    results.push({ test: 'Add Prompt', passed: !!(await testAddPrompt()) });
    results.push({ test: 'Get Prompts', passed: (await testGetPromptsByEmployee()).length > 0 });

    // Export
    results.push({ test: 'Export Data', passed: !!(await testExportData()) });

    // Summary
    console.log('\n📊 TEST SUMMARY:');
    console.log('═══════════════════════════════');

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;

    results.forEach((r) => {
      console.log(`${r.passed ? '✅' : '❌'} ${r.test}`);
    });

    console.log('═══════════════════════════════');
    console.log(`Result: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);

    return results;
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    return results;
  }
}

// ============================================
// EXPOSE TO WINDOW (for console access)
// ============================================

if (typeof window !== 'undefined') {
  (window as unknown as { dbTests: Record<string, unknown> }).dbTests = {
    // Users
    addUser: testAddUser,
    getUser: testGetUser,
    getAllUsers: testGetAllUsers,
    updateUser: testUpdateUser,

    // Cache
    addCache: testAddCache,
    getCache: testGetCacheByProject,
    updateCacheHit: testUpdateCacheHit,
    updateCacheHitFirst: testUpdateCacheHitFirst,
    deleteCache: testDeleteCache,
    getCacheStats: testGetCacheStats,

    // Prompts
    addPrompt: testAddPrompt,
    getPrompts: testGetPromptsByEmployee,

    // Export/Import
    exportData: testExportData,
    importData: testImportData,

    // Migration
    testMigration,

    // Cleanup
    clearAll: testClearAll,

    // Run all
    runAll: runAllTests,
  };

  console.log('✅ Test functions loaded!');
  console.log('Usage: dbTests.addUser(), dbTests.runAll(), etc.');
  console.log('Type "dbTests" to see all available tests');
}
