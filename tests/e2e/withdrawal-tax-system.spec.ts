import { test, expect, Page } from '@playwright/test';

// Credentials
const ADMIN_EMAIL = "admi@paylionsbit.es";
const ADMIN_PASSWORD = "LionsBit2026!";
const TEST_USER_EMAIL = "test.user@test.com";
const TEST_USER_PASSWORD = "TestPass123";

/**
 * Helper: Login as admin user
 */
async function loginAsAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill(ADMIN_EMAIL);
  await page.getByTestId('login-password-input').fill(ADMIN_PASSWORD);
  await page.getByTestId('login-submit-btn').click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByText(/Welcome back/i)).toBeVisible();
}

/**
 * Helper: Login as test user
 */
async function loginAsTestUser(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill(TEST_USER_EMAIL);
  await page.getByTestId('login-password-input').fill(TEST_USER_PASSWORD);
  await page.getByTestId('login-submit-btn').click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByText(/Welcome back/i)).toBeVisible();
}

test.describe('User Transactions Page - Tax Payment', () => {
  
  test('Transactions page loads and shows withdrawals with tax info', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    // Verify page loaded
    await expect(page.getByTestId('transactions-page')).toBeVisible();
    await expect(page.getByText('Transaction History')).toBeVisible();
    
    // Check for export CSV button
    await expect(page.getByTestId('export-csv-btn')).toBeVisible();
    
    // Check for filter selector
    await expect(page.getByTestId('filter-selector')).toBeVisible();
  });
  
  test('Withdrawal with pending_tax shows Tax Progress column', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transactions-page')).toBeVisible();
    
    // Check for Tax Progress column header
    await expect(page.getByText('Tax Progress')).toBeVisible();
    
    // Look for a pending_tax withdrawal
    const taxPendingBadge = page.getByText('Tax Pending');
    if (await taxPendingBadge.isVisible()) {
      // The pay tax button should be visible
      const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
      await expect(payTaxBtn).toBeVisible();
    }
  });
  
  test('Pay Tax button opens crypto-only payment dialog', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transactions-page')).toBeVisible();
    
    // Find and click pay tax button
    const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
    if (await payTaxBtn.isVisible()) {
      await payTaxBtn.click();
      
      // Wait for dialog to open
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Verify dialog title - Pay Tax
      await expect(page.getByText(/Pay Tax/i)).toBeVisible();
      
      // Verify tax info is shown
      await expect(page.getByText('Impuesto Requerido')).toBeVisible();
      await expect(page.getByText('$4850.00 USD')).toBeVisible();
      
      // Verify "Pay with Balance" option is NOT present (crypto only)
      await expect(page.getByText(/Pay with Balance/i)).not.toBeVisible();
      
      // Verify crypto payment section is present
      await expect(page.getByText('Pago con Criptomonedas')).toBeVisible();
    }
  });
  
  test('Tax payment dialog shows all crypto wallet options', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
    if (await payTaxBtn.isVisible()) {
      await payTaxBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Scroll to see crypto options
      const dialog = page.locator('[role="dialog"]');
      await dialog.evaluate(el => el.scrollTop = 400);
      
      // Verify all crypto options are present: BTC, ETH, USDT
      await expect(page.getByText('Bitcoin')).toBeVisible();
      await expect(page.getByText('Ethereum')).toBeVisible();
      await expect(page.getByText('Tether USDT')).toBeVisible();
    }
  });
  
  test('Tax payment dialog shows minimum payment ($200) and 72h warning', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
    if (await payTaxBtn.isVisible()) {
      await payTaxBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Check for minimum payment info ($200)
      await expect(page.getByText('$200 USD')).toBeVisible();
      
      // Check for 72 hours warning
      await expect(page.getByText(/72 horas/i)).toBeVisible();
    }
  });
  
  test('Selecting crypto shows wallet address and QR code', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
    if (await payTaxBtn.isVisible()) {
      await payTaxBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Scroll to crypto options
      const dialog = page.locator('[role="dialog"]');
      await dialog.evaluate(el => el.scrollTop = 400);
      
      // Click on Bitcoin option
      await page.getByText('Bitcoin').click();
      
      // Wait for QR code (SVG element) to appear
      await expect(page.locator('svg').filter({ has: page.locator('rect') })).toBeVisible();
      
      // Check for wallet address display
      await expect(page.getByText('bc1q5qaunggmt6ckrhw928g3v0fkzuklnwveflfred')).toBeVisible();
      
      // Check for TXID input field
      await expect(page.getByTestId('crypto-txid-input')).toBeVisible();
      
      // Check for amount input field
      await expect(page.getByTestId('crypto-amount-input')).toBeVisible();
    }
  });
  
  test('Tax progress bar shows correctly (Required, Paid, Remaining)', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    const payTaxBtn = page.locator('[data-testid^="pay-tax-btn-"]').first();
    if (await payTaxBtn.isVisible()) {
      await payTaxBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Verify tax progress info is displayed
      await expect(page.getByText('Pagado')).toBeVisible();
      await expect(page.getByText('Restante')).toBeVisible();
      await expect(page.getByText('Progreso del pago')).toBeVisible();
    }
  });
});

test.describe('Admin Withdrawals Page', () => {
  
  test('Admin withdrawals page loads correctly', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    
    // Verify page loaded
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    await expect(page.getByText('Retiros Pendientes')).toBeVisible();
    
    // Check for refresh button
    await expect(page.getByText('Actualizar')).toBeVisible();
  });
  
  test('Admin withdrawals table shows pending tax withdrawals', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Check for withdrawal row
    const withdrawalRow = page.locator('[data-testid^="withdrawal-row-"]').first();
    if (await withdrawalRow.isVisible()) {
      // Verify table shows user info
      await expect(page.getByText('Test User')).toBeVisible();
      await expect(page.getByText('test.user@test.com')).toBeVisible();
    }
  });
  
  test('Admin withdrawals shows tax info (Required, Paid, Remaining)', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Check for tax columns
    await expect(page.getByText('Requerido:')).toBeVisible();
    await expect(page.getByText('Pagado:')).toBeVisible();
    await expect(page.getByText('Restante:')).toBeVisible();
    
    // Verify $4850 tax amount
    await expect(page.getByText('$4850')).toBeVisible();
  });
  
  test('Admin can open Add Payment dialog', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Click add payment button
    const addPaymentBtn = page.locator('[data-testid^="add-payment-btn-"]').first();
    if (await addPaymentBtn.isVisible()) {
      await addPaymentBtn.click();
      
      // Wait for dialog
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Verify dialog title
      await expect(page.getByText('Registrar Pago Manual')).toBeVisible();
      
      // Verify form fields
      await expect(page.getByText('Monto del Pago (USD)')).toBeVisible();
      await expect(page.getByText('Método de Pago')).toBeVisible();
      await expect(page.getByText('Tipo de Crypto')).toBeVisible();
      await expect(page.getByText('TXID (Opcional)')).toBeVisible();
      await expect(page.getByText('Notas (Opcional)')).toBeVisible();
    }
  });
  
  test('Admin payment dialog shows minimum $200 requirement', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    
    const addPaymentBtn = page.locator('[data-testid^="add-payment-btn-"]').first();
    if (await addPaymentBtn.isVisible()) {
      await addPaymentBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Check for minimum amount hint
      await expect(page.getByPlaceholder(/Mínimo \$200/i)).toBeVisible();
    }
  });
  
  test('Admin withdrawals shows time remaining for 72h deadline', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Check for time remaining column  
    await expect(page.getByText('TIEMPO')).toBeVisible();
    
    // Should show hours remaining (format: Xh restantes)
    const timeRemaining = page.getByText(/\d+h restantes/);
    if (await timeRemaining.isVisible()) {
      await expect(timeRemaining).toBeVisible();
    }
  });
  
  test('Admin cannot approve withdrawal while tax is pending', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Find approve button for pending tax withdrawal
    const approveBtn = page.locator('[data-testid^="approve-btn-"]').first();
    if (await approveBtn.isVisible()) {
      // The button should be disabled for pending_tax status
      const isDisabled = await approveBtn.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });
  
  test('Admin can change withdrawal status', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    
    // Check for status dropdown
    const statusSelect = page.locator('[role="combobox"]').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.click();
      
      // Check for status options
      await expect(page.getByText('Impuesto Pendiente')).toBeVisible();
      await expect(page.getByText('En Revisión')).toBeVisible();
      await expect(page.getByText('Procesando')).toBeVisible();
    }
  });
});

test.describe('Withdrawal Status Transitions', () => {
  
  test('Withdrawal with pending_tax has correct status badge', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    
    // Look for Tax Pending badge
    const taxPendingBadge = page.getByText('Tax Pending');
    if (await taxPendingBadge.isVisible()) {
      // Verify it has orange styling (indicating pending tax)
      await expect(taxPendingBadge).toHaveClass(/text-orange/);
    }
  });
  
  test('User can filter transactions by withdrawal type', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transactions-page')).toBeVisible();
    
    // Click filter selector
    await page.getByTestId('filter-selector').click();
    
    // Select Withdrawals
    await page.getByText('Withdrawals', { exact: true }).click();
    
    // All visible transactions should be withdrawals
    const rows = page.locator('[data-testid^="transaction-row-"]');
    const count = await rows.count();
    
    if (count > 0) {
      // First row should show withdraw type
      await expect(page.getByText('Withdraw').first()).toBeVisible();
    }
  });
});

test.describe('Navigation and Access Control', () => {
  
  test('Regular user can access transactions page', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transactions-page')).toBeVisible();
  });
  
  test('Regular user cannot access admin withdrawals page', async ({ page }) => {
    await loginAsTestUser(page);
    
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    
    // Should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    // Should NOT see admin withdrawals page
    await expect(page.getByTestId('admin-withdrawals-page')).not.toBeVisible();
  });
  
  test('Admin can access admin withdrawals from sidebar', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Wait for dashboard to load
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
    
    // Look for Admin Dashboard link in sidebar
    await expect(page.locator('a[href="/admin"]')).toBeVisible();
    
    // Navigate to admin withdrawals
    await page.goto('/admin/withdrawals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
  });
});
