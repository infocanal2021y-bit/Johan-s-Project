import { test, expect, Page } from '@playwright/test';

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

test.describe('Admin-Only Deposits - Sidebar Navigation', () => {
  
  test('Regular user sidebar does not show Deposit link', async ({ page }) => {
    await loginAsUser(page);
    
    // Wait for dashboard to load using a more flexible locator
    await expect(page.getByText(/Welcome back/i)).toBeVisible({ timeout: 10000 });
    
    // Check sidebar for user links - use specific link with href
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('a[href="/accounts"]')).toBeVisible();
    await expect(page.locator('a[href="/transactions"]')).toBeVisible();
    await expect(page.locator('a[href="/transfer"]')).toBeVisible();
    await expect(page.locator('a[href="/withdraw"]')).toBeVisible();
    
    // User should NOT see Deposit link (was removed)
    const depositLink = page.locator('a[href="/deposit"]');
    await expect(depositLink).not.toBeVisible();
    
    // User should NOT see admin links
    const addBalanceLink = page.locator('a[href="/admin/credits"]');
    await expect(addBalanceLink).not.toBeVisible();
  });

  test('Admin user sidebar shows Add Balance link', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Wait for dashboard to load
    await expect(page.getByText(/Welcome back/i)).toBeVisible({ timeout: 10000 });
    
    // Admin should see admin-specific links
    await expect(page.locator('a[href="/admin"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/credits"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/users"]')).toBeVisible();
    
    // Admin should NOT see Deposit link either
    const depositLink = page.locator('a[href="/deposit"]');
    await expect(depositLink).not.toBeVisible();
  });
});

test.describe('Admin Credits Page Access', () => {

  test('Admin can access /admin/credits page', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to admin credits page
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    
    // Check page loaded correctly
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Balance Management')).toBeVisible();
    await expect(page.getByTestId('add-balance-btn')).toBeVisible();
  });

  test('Regular user redirected from /admin/credits to dashboard', async ({ page }) => {
    await loginAsUser(page);
    
    // Try to navigate to admin credits page
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    
    // Should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });
});

test.describe('Admin Add Balance Feature', () => {

  test('Admin can open Add Balance dialog and see form elements', async ({ page }) => {
    await loginAsAdmin(page);
    
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

  test('Admin can add balance to user successfully', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    
    // Click Add Balance button
    await page.getByTestId('add-balance-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Select user (demo user should be in the list)
    await page.getByTestId('user-selector').click();
    // Wait for dropdown and select Demo User
    await page.locator('[role="option"]').filter({ hasText: /demo/i }).first().click();
    
    // Enter amount
    const uniqueAmount = String(Math.floor(Math.random() * 50) + 10);
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

  test('Admin Credits History table displays correctly', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/credits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-credits-page')).toBeVisible({ timeout: 15000 });
    
    // Check for history section
    await expect(page.getByText('Admin Credits History')).toBeVisible();
    
    // Table headers should be visible
    await expect(page.locator('th').filter({ hasText: /reference/i })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /user/i })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /amount/i })).toBeVisible();
  });
});
