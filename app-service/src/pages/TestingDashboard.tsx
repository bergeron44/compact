import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import * as Tests from '@/lib/storage/tests';

export default function TestingDashboard() {
  const [results, setResults] = useState<
    Array<{ test: string; status: 'idle' | 'running' | 'passed' | 'failed' }>
  >([]);
  const [isRunning, setIsRunning] = useState(false);

  const tests = [
    { name: 'Add User', fn: Tests.testAddUser },
    { name: 'Get User', fn: () => Tests.testGetUser('TEST001') },
    { name: 'Get All Users', fn: Tests.testGetAllUsers },
    { name: 'Update User', fn: () => Tests.testUpdateUser('TEST001') },
    { name: 'Add Cache', fn: Tests.testAddCache },
    { name: 'Get Cache', fn: () => Tests.testGetCacheByProject('project_alpha') },
    { name: 'Update Cache Hit', fn: Tests.testUpdateCacheHitFirst },
    { name: 'Get Cache Stats', fn: () => Tests.testGetCacheStats('project_alpha') },
    { name: 'Add Prompt', fn: Tests.testAddPrompt },
    { name: 'Get Prompts', fn: () => Tests.testGetPromptsByEmployee('TEST001') },
    { name: 'Export Data', fn: Tests.testExportData },
    { name: 'Test Migration', fn: Tests.testMigration },
  ];

  const runTest = async (test: (typeof tests)[0], index: number) => {
    setResults((prev) => {
      const newResults = [...prev];
      newResults[index] = { test: test.name, status: 'running' };
      return newResults;
    });

    try {
      await test.fn();
      setResults((prev) => {
        const newResults = [...prev];
        newResults[index] = { test: test.name, status: 'passed' };
        return newResults;
      });
    } catch (error) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[index] = { test: test.name, status: 'failed' };
        return newResults;
      });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults(tests.map((t) => ({ test: t.name, status: 'idle' as const })));

    for (let i = 0; i < tests.length; i++) {
      await runTest(tests[i], i);
      await new Promise((resolve) => setTimeout(resolve, 500));
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
