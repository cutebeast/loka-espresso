const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let failed = false;
  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.text()));
  page.on('pageerror', (err) => { console.log('PAGE ERROR:', err.message); failed = true; });
  page.on('requestfailed', (req) => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));
  try {
    await page.goto('http://localhost:13830/login', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    const emailSel = 'input[type="email"], input[name="email"], input#email';
    const passwordSel = 'input[type="password"], input[name="password"], input#password';
    const submitSel = 'button[type="submit"]';
    await page.waitForSelector(emailSel, { visible: true });
    await page.waitForSelector(passwordSel, { visible: true });
    await page.waitForSelector(submitSel, { visible: true });

    await page.focus(emailSel);
    await page.type(emailSel, 'admin@loyaltysystem.uk', { delay: 5 });
    await page.focus(passwordSel);
    await page.type(passwordSel, 'admin123', { delay: 5 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click(submitSel),
    ]);

    const url = page.url();
    console.log('URL after login:', url);
    if (!url.endsWith('/') && !url.includes('/dashboard')) {
      const errorText = await page.$eval('.login-error', (e) => e.textContent.trim()).catch(() => 'unknown');
      throw new Error(`Expected dashboard after login, got ${url} (error: ${errorText})`);
    }

    await page.waitForSelector('h1', { visible: true, timeout: 10000 });
    const title = await page.$eval('h1', (e) => e.textContent.trim()).catch(() => 'missing');
    console.log('Dashboard h1:', title);
    if (title !== 'Dashboard') {
      throw new Error(`Unexpected dashboard title: ${title}`);
    }

    console.log('Admin login + dashboard smoke PASSED');
  } catch (e) {
    console.error('Smoke test failed:', e.message);
    const html = await page.content().catch(() => '');
    console.error('Final HTML snippet:', html.slice(0, 1500));
    failed = true;
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
