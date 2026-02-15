# MISSION: Create Interactive Testing Suite for IndexedDB Migration

You need to create a comprehensive testing interface that allows us to manually verify that all IndexedDB operations work correctly.

## YOUR TASK:

Create **two testing approaches**:

### **Approach 1: Browser Console Test Functions**
### **Approach 2: UI Testing Page**

---

## APPROACH 1: Browser Console Testing

### **File:** `src/lib/storage/tests.ts`

Create a file with test helper functions that can be called from the browser console.
```typescript
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
      compressedResponse: 'RAG: Retrieval-Augmented Generation...',
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // Mock vector
      compressionRatio: 0.45,
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
          compressedResponse: 'Test compressed',
          vector: [0.1, 0.2],
          hitCount: 1,
          compressionRatio: 0.5,
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
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    results.forEach(r => {
      console.log(`${r.passed ? '✅' : '❌'} ${r.test}`);
    });
    
    console.log('═══════════════════════════════');
    console.log(`Result: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
    
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
  (window as any).dbTests = {
    // Users
    addUser: testAddUser,
    getUser: testGetUser,
    getAllUsers: testGetAllUsers,
    updateUser: testUpdateUser,
    
    // Cache
    addCache: testAddCache,
    getCache: testGetCacheByProject,
    updateCacheHit: testUpdateCacheHit,
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
```

---

### **File:** `src/App.tsx`

**Add this import:**
```typescript
// Import tests for console access (development only)
if (import.meta.env.DEV) {
  import('./lib/storage/tests');
}
```

---

## APPROACH 2: UI Testing Page

### **File:** `src/pages/TestingDashboard.tsx`

Create a visual testing interface:
```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import * as Tests from '@/lib/storage/tests';

export default function TestingDashboard() {
  const [results, setResults] = useState<Array<{ test: string; status: 'idle' | 'running' | 'passed' | 'failed' }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  const tests = [
    { name: 'Add User', fn: Tests.testAddUser },
    { name: 'Get User', fn: () => Tests.testGetUser('TEST001') },
    { name: 'Get All Users', fn: Tests.testGetAllUsers },
    { name: 'Update User', fn: () => Tests.testUpdateUser('TEST001') },
    { name: 'Add Cache', fn: Tests.testAddCache },
    { name: 'Get Cache', fn: Tests.testGetCacheByProject },
    { name: 'Update Cache Hit', fn: () => Tests.testUpdateCacheHit(1) },
    { name: 'Get Cache Stats', fn: Tests.testGetCacheStats },
    { name: 'Add Prompt', fn: Tests.testAddPrompt },
    { name: 'Get Prompts', fn: Tests.testGetPromptsByEmployee },
    { name: 'Export Data', fn: Tests.testExportData },
    { name: 'Test Migration', fn: Tests.testMigration },
  ];

  const runTest = async (test: typeof tests[0], index: number) => {
    setResults(prev => {
      const newResults = [...prev];
      newResults[index] = { test: test.name, status: 'running' };
      return newResults;
    });

    try {
      await test.fn();
      setResults(prev => {
        const newResults = [...prev];
        newResults[index] = { test: test.name, status: 'passed' };
        return newResults;
      });
    } catch (error) {
      setResults(prev => {
        const newResults = [...prev];
        newResults[index] = { test: test.name, status: 'failed' };
        return newResults;
      });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults(tests.map(t => ({ test: t.name, status: 'idle' as const })));

    for (let i = 0; i < tests.length; i++) {
      await runTest(tests[i], i);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunning(false);
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">IndexedDB Testing Dashboard</h1>

      <Card className="p-6 mb-6">
        <div className="flex gap-4">
          <Button onClick={runAllTests} disabled={isRunning}>
            {isRunning ? 'Running Tests...' : 'Run All Tests'}
          </Button>
          <Button variant="outline" onClick={Tests.testExportData}>
            Export Data
          </Button>
          <Button variant="destructive" onClick={Tests.testClearAll}>
            Clear All Data
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Test Results</h2>
        <div className="space-y-2">
          {tests.map((test, index) => {
            const result = results[index];
            return (
              <div key={test.name} className="flex items-center justify-between p-3 border rounded">
                <span>{test.name}</span>
                <div className="flex gap-2">
                  {result && (
                    <Badge
                      variant={
                        result.status === 'passed'
                          ? 'default'
                          : result.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {result.status}
                    </Badge>
                  )}
                  <Button size="sm" onClick={() => runTest(test, index)}>
                    Run
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
```

**Add route in `src/App.tsx`:**
```typescript
<Route path="/testing" element={<TestingDashboard />} />
```

---

## USAGE INSTRUCTIONS:

### **Console Testing (Approach 1):**

1. Open browser DevTools (F12)
2. Go to Console tab
3. Type: `dbTests.runAll()` - runs all tests
4. Or individual tests:
```javascript
   await dbTests.addUser()
   await dbTests.getUser('TEST001')
   await dbTests.addCache()
   await dbTests.updateCacheHit(1)
```

### **UI Testing (Approach 2):**

1. Navigate to `/testing` in browser
2. Click "Run All Tests" button
3. Watch tests run one by one
4. Check results (passed/failed)

---

## VERIFICATION CHECKLIST:

After running tests, verify in DevTools:

1. Open DevTools → Application tab → IndexedDB
2. Expand `dell-compact-db`
3. Check each table:
   - [ ] `users` - has test user
   - [ ] `cache` - has test entries
   - [ ] `prompts` - has test prompts
4. Click on table → verify data structure matches schema

---

Now implement both approaches and provide clear instructions on how to run the tests!