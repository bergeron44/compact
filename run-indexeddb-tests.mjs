#!/usr/bin/env node
/**
 * Run IndexedDB tests via browser - navigates to /testing, clicks Run All Tests, verifies results
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('✅') || text.includes('❌') || text.includes('TEST SUMMARY') || text.includes('tests passed')) {
      console.log(text);
    }
  });

  try {
    console.log(`\n📍 Navigating to ${BASE_URL}/testing ...`);
    await page.goto(`${BASE_URL}/testing`, { waitUntil: 'networkidle', timeout: 15000 });

    console.log('🖱️  Clicking "Run All Tests"...');
    await page.getByRole('button', { name: /Run All Tests/i }).click();

    console.log('⏳ Waiting for tests to complete (~15s)...');
    await page.waitForTimeout(15000);

    const badges = await page.locator('[class*="border"]').filter({ has: page.locator('text=passed') }).count();
    const passedBadges = await page.getByText('passed', { exact: true }).count();
    const failedBadges = await page.getByText('failed', { exact: true }).count();

    const allRows = await page.locator('div.flex.items-center.justify-between.p-3.border.rounded').all();
    let passed = 0, failed = 0;
    for (const row of allRows) {
      const badge = row.locator('[class*="rounded-full"]');
      const text = await badge.textContent();
      if (text?.trim() === 'passed') passed++;
      else if (text?.trim() === 'failed') failed++;
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log('\n❌ Some tests failed. Console output:');
      logs.filter((l) => l.includes('❌') || l.includes('Test failed')).forEach((l) => console.log('  ', l));
      process.exit(1);
    }

    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
