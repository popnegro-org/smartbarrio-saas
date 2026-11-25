const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROUTES = ['/index.html', '/kioscos/', '/kioscos/nuovo-market', '/admin/'];
const PRODUCTION = process.env.VISUAL_BASELINE_URL || 'https://smartbarrio.vercel.app';
const SNAPSHOT_DIR = path.join(process.cwd(), 'test-results', 'visual-baseline');

test.describe('Visual regression evidence · production baseline', () => {
  for (const route of ROUTES) {
    test('Capture baseline and candidate ' + route, async ({ browser }) => {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
      const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'home';
      const baseline = path.join(SNAPSHOT_DIR, name + '-production.png');
      const candidate = path.join(SNAPSHOT_DIR, name + '-candidate.png');

      const production = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const baselineResponse = await production.goto(PRODUCTION + route, { waitUntil: 'networkidle' });
      const baselineText = await production.locator('body').innerText().catch(() => '');
      if (!baselineResponse || baselineResponse.status() >= 400 ||
          /authentication required|vercel authentication|sign in to vercel/i.test(baselineText)) {
        await production.close();
        test.skip(true, 'Production visual baseline is protected or unavailable');
      }
      await production.screenshot({ path: baseline, fullPage: true });
      await production.close();

      const current = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await current.goto(route, { waitUntil: 'networkidle' });
      await current.screenshot({ path: candidate, fullPage: true });
      await current.close();

      if (fs.statSync(baseline).size === 0 || fs.statSync(candidate).size === 0) {
        throw new Error('Visual evidence screenshot is empty for ' + route);
      }
    });
  }
});
