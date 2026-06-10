const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:13810/', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Click Skip on splash
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const skip = btns.find(b => b.innerText.includes('Skip'));
    if (skip) skip.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // Click Browse as Guest
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const guest = btns.find(b => b.innerText.includes('Browse as Guest'));
    if (guest) guest.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('After guest - text length:', text.length);
  
  // Find all clickable elements (buttons and links)
  const clickable = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    return buttons.map(b => ({
      tag: b.tagName,
      text: b.innerText?.substring(0, 50),
      class: b.className?.substring(0, 100),
    })).filter(b => b.text && b.text.length > 0);
  });
  console.log('Clickable elements:', JSON.stringify(clickable, null, 2));
  
  await browser.close();
})();
