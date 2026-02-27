import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://fintech-deposits.preview.emergentagent.com';

// Helper: Login as regular user
async function loginAsUser(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'demo@vaultbank.com');
  await page.fill('input[type="password"]', 'Password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

// Helper: Login as admin
async function loginAsAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'admin@vaultbank.com');
  await page.fill('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

// Remove Emergent badge that may overlay UI
async function removeEmergentBadge(page: Page) {
  await page.evaluate(() => {
    const badge = document.querySelector('[class*="emergent"], [id*="emergent-badge"]');
    if (badge) badge.remove();
  });
}

test.describe('Admin-Only Deposits - Sidebar Navigation', () => {
  
  test('Regular user should NOT see Deposit link in sidebar', async ({ page }) => {
    await loginAsUser(page);
    await removeEmergentBadge(page);
    
    // Wait for sidebar to load
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10000 });
    
    // Check sidebar links for regular user
    const sidebar = page.locator('aside, nav').first();
    
    // User should see these links
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /accounts/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /transactions/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /transfer/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /withdraw/i })).toBeVisible();
    
    // User should NOT see Deposit link
    const depositLink = page.getByRole('link', { name: /^deposit$/i });
    await expect(depositLink).not.toBeVisible();
    
    // User should NOT see admin links
    const adminDashboardLink = page.getByRole('link', { name: /admin dashboard/i });
    await expect(adminDashboardLink).not.toBeVisible();
    
    const addBalanceLink = page.getByRole('link', { name: /add balance/i });
    await expect(addBalanceLink).not.toBeVisible();
  });

  test('Admin user should see Add Balance link in sidebar', async ({ page }) => {
    await loginAsAdmin(page);
    await removeEmergentBadge(page);
    
    // Wait for sidebar to load
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10000 });
    
    // Admin should see regular user links
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /accounts/i })).toBeVisible();
    
    // Admin should see admin-specific links
    await expect(page.getByRole('link', { name: /admin dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /add balance/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^users$/i })).toBeVisible();
    
    // Admin should also NOT see Deposit link (it's removed for everyone)
    const depositLink = page.getByRole('link', { name: /^deposit$/i });
    await expect(depositLink).not.toBeVisible();
  });
});

test.describe('Admin Credits Page Access', () => {

  test('Admin can access /admin/credits page', async ({ page }) => {
    await loginAsAdmin(page);
    await removeEmergentBadge(page);
    
    // Navigate to admin credits page
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    
    // Check page loaded correctly
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Balance Management')).toBeVisible();
    await expect(page.getByTestId('add-balance-btn')).toBeVisible();
  });

  test('Regular user cannot access /admin/credits - redirected to dashboard', async ({ page }) => {
    await loginAsUser(page);
    await removeEmergentBadge(page);
    
    // Try to navigate to admin credits page
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    
    // Should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Admin credits page should not be visible
    await expect(page.getByTestId('admin-credits-page')).not.toBeVisible();
  });
});

test.describe('Admin Add Balance Feature', () => {

  test('Admin can open Add Balance dialog', async ({ page }) => {
    await loginAsAdmin(page);
    await removeEmergentBadge(page);
    
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    
    // Click Add Balance button
    await page.getByTestId('add-balance-btn').click();
    
    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Add Balance to User')).toBeVisible();
    
    // Dialog elements should be visible
    await expect(page.getByTestId('user-selector')).toBeVisible();
    await expect(page.getByTestId('amount-input')).toBeVisible();
    await expect(page.getByTestId('currency-selector')).toBeVisible();
    await expect(page.getByTestId('description-input')).toBeVisible();
    await expect(page.getByTestId('confirm-add-balance-btn')).toBeVisible();
  });

  test('Admin can add balance to user and see it in history', async ({ page }) => {
    await loginAsAdmin(page);
    await removeEmergentBadge(page);
    
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    
    // Get initial credits count
    const initialCreditsText = await page.locator('text=/Total Credits/').first().textContent();
    
    // Click Add Balance button
    await page.getByTestId('add-balance-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Select user (demo user should be in the list)
    await page.getByTestId('user-selector').click();
    await page.getByRole('option', { name: /demo/i }).first().click();
    
    // Enter amount
    const uniqueAmount = String(Math.floor(Math.random() * 100) + 1);
    await page.getByTestId('amount-input').fill(uniqueAmount);
    
    // Enter description
    const uniqueDescription = `E2E_TEST_${Date.now()}`;
    await page.getByTestId('description-input').fill(uniqueDescription);
    
    // Submit
    await page.getByTestId('confirm-add-balance-btn').click();
    
    // Wait for success - dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
    
    // Verify the credit appears in history table
    await expect(page.getByText(uniqueDescription)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin Credits History', () => {

  test('Admin Credits History table shows correct data', async ({ page }) => {
    await loginAsAdmin(page);
    await removeEmergentBadge(page);
    
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    
    // Check for history section
    await expect(page.getByText('Admin Credits History')).toBeVisible();
    
    // Table headers should be visible
    await expect(page.getByRole('columnheader', { name: /reference/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /user/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /admin/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /description/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /date/i })).toBeVisible();
  });
});
