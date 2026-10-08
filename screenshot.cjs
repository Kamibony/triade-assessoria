const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to root route
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000); // give it time to render
  await page.screenshot({ path: 'root_route.png' });

  // Navigate to portal route
  await page.goto('http://localhost:5173/portal');
  await page.waitForTimeout(2000); // give it time to render
  await page.screenshot({ path: 'portal_route.png' });

  await browser.close();
})();
