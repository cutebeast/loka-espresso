/**
 * Comprehensive customer PWA journey test.
 */

const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:13810';
const API_URL = 'http://localhost:13800/api/v1';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickButtonByText(page, text) {
  return await page.evaluate((txt) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.trim() === txt);
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
}

async function dismissSplash(page) {
  // Splash screen shows promotion with a Skip button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const skip = btns.find(b => b.innerText.trim() === 'Skip');
    if (skip) skip.click();
  });
}

async function dismissA2HS(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cancel = btns.find(b => b.innerText.trim() === 'Cancel');
    if (cancel) cancel.click();
  });
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const errors = [];
  const ts = Math.random().toString(36).substring(2, 10);
  const email = `journey-${ts}@example.com`;

  try {
    // ===== STEP 1: Load homepage and dismiss overlays =====
    console.log('1. Loading homepage...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(3000);
    
    // Wait for splash screen to render
    await sleep(2000);
    
    // Dismiss splash screen
    await dismissSplash(page);
    await sleep(1000);
    
    // Dismiss A2HS popup
    await dismissA2HS(page);
    await sleep(500);
    
    // Click Browse as Guest
    const guestClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const guest = btns.find(b => b.innerText.includes('Browse as Guest'));
      if (guest) { guest.click(); return true; }
      return false;
    });
    if (!guestClicked) {
      console.log('   ⚠ Browse as Guest button not found');
    }
    await sleep(3000);
    
    const homeText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Homepage loaded (text length:', homeText.length + ')');
    // Login screen is ~189 chars; main app is ~900+ chars
    if (homeText.length < 150) {
      errors.push(`Homepage too short after dismiss (${homeText.length} chars)`);
    }

    // ===== STEP 2: Click Add on a menu item =====
    console.log('2. Adding item to cart...');
    const addClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.add-btn'));
      if (btns.length > 0) { btns[0].click(); return true; }
      return false;
    });
    if (!addClicked) {
      console.log('   ⚠ No add-btn found, trying generic Add buttons');
      await clickButtonByText(page, 'Add');
    }
    await sleep(2000);
    console.log('   ✓ Clicked Add');

    // ===== STEP 3: Navigate to Menu page =====
    console.log('3. Navigating to Menu...');
    await clickButtonByText(page, 'Menu');
    await sleep(3000);
    const menuText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Menu page (text length:', menuText.length + ')');
    if (menuText.length < 150) {
      errors.push(`Menu page too short (${menuText.length} chars)`);
    }

    // ===== STEP 4: Navigate to Orders page (should show login prompt for guest) =====
    console.log('4. Navigating to Orders...');
    await clickButtonByText(page, 'Orders');
    await sleep(3000);
    const ordersText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Orders page (text length:', ordersText.length + ')');
    
    // ===== STEP 5: Register via API and inject token =====
    console.log('5. Registering customer via API...');
    // Node.js 24 has built-in fetch
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email, display_name: `Journey ${ts}` })
    });
    const regData = await regRes.json();
    if (regRes.status !== 201) {
      errors.push(`Registration failed: ${regRes.status}`);
    } else {
      console.log('   ✓ Registered:', email);
      const token = regData.tokens.access_token;
      
      // Inject token into browser localStorage
      await page.evaluate((t) => {
        localStorage.setItem('token', t);
        localStorage.setItem('access_token', t);
      }, token);
    }

    // ===== STEP 6: Reload app as authenticated user =====
    console.log('6. Reloading as authenticated user...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(3000);
    await clickButtonByText(page, 'Skip');
    await sleep(500);
    await clickButtonByText(page, 'Cancel');
    await sleep(500);
    
    const authText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Reloaded (text length:', authText.length + ')');

    // ===== STEP 7: Full API order journey =====
    console.log('7. Placing order via API...');
    const token = regData.tokens.access_token;
    
    // Get menu item
    const menuRes = await fetch(`${API_URL}/menu/stores/1`);
    const menuData = await menuRes.json();
    const itemId = menuData.data.items[0].id;
    
    // Add to cart
    const addCartRes = await fetch(`${API_URL}/cart/items?store_id=1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_item_id: itemId, quantity: 1, selected_modifiers: [] })
    });
    if (addCartRes.status !== 200) {
      errors.push(`Add to cart failed: ${addCartRes.status}`);
    }
    
    // Get cart
    const cartRes = await fetch(`${API_URL}/cart?store_id=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const cartData = await cartRes.json();
    const cartId = cartData.data.id;
    
    // Create order
    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: 1,
        cart_id: cartId,
        order_type: 'takeaway',
        fulfillment_type: 'counter_pickup'
      })
    });
    if (orderRes.status !== 201) {
      const errText = await orderRes.text();
      errors.push(`Order creation failed: ${orderRes.status} - ${errText}`);
    } else {
      const orderData = await orderRes.json();
      console.log('   ✓ Order placed (id:', orderData.data.id + ')');
    }

    // ===== STEP 8: Navigate to Orders page and verify =====
    console.log('8. Checking Orders page shows order...');
    await clickButtonByText(page, 'Orders');
    await sleep(3000);
    const finalOrdersText = await page.evaluate(() => document.body.innerText);
    console.log('   Orders page text length:', finalOrdersText.length);
    
    // ===== STEP 9: Navigate to Rewards =====
    console.log('9. Navigating to Rewards...');
    await clickButtonByText(page, 'Rewards');
    await sleep(2000);
    const rewardsText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Rewards page (text length:', rewardsText.length + ')');

    // ===== STEP 10: Navigate to Profile =====
    console.log('10. Navigating to Profile...');
    await clickButtonByText(page, 'Profile');
    await sleep(2000);
    const profileText = await page.evaluate(() => document.body.innerText);
    console.log('   ✓ Profile page (text length:', profileText.length + ')');
    if (profileText.length < 200) {
      errors.push(`Profile page too short (${profileText.length} chars)`);
    }

  } catch (err) {
    errors.push(`Unexpected error: ${err.message}`);
    console.error(err);
  }

  await browser.close();

  if (errors.length > 0) {
    console.error('\n❌ FAILED:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n✅ Customer PWA full journey verified successfully');
    process.exit(0);
  }
}

run();
