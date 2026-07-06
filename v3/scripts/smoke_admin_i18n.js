const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  page.on('requestfinished', async (req) => {
    const resp = req.response();
    console.log('REQUEST:', req.method(), req.url(), '=>', resp?.status());
  });
  page.on('requestfailed', (req) => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));
  try {
    await page.goto('http://localhost:13830/login', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 3000));
    const title = await page.$eval('.login-brand-sub', (e) => e.textContent.trim()).catch(() => 'missing');
    const emailLabel = await page.$eval('label', (e) => e.textContent.trim()).catch(() => 'missing');
    const signIn = await page.$eval('button[type="submit"]', (e) => e.textContent.trim()).catch(() => 'missing');
    console.log('Default EN:', { title, emailLabel, signIn });
  } catch (e) {
    console.error('Smoke test failed:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
