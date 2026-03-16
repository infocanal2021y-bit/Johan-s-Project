import { test, expect, Page } from '@playwright/test';

// Admin credentials
const ADMIN_EMAIL = 'admi@paylionsbit.es';
const ADMIN_PASSWORD = 'LionsBit2026!';

// Valid Spanish IBAN for testing (CaixaBank)
const VALID_SPANISH_IBAN = 'ES91 2100 0418 4502 0005 1332';

async function loginAsAdmin(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

async function dismissToasts(page: Page) {
  await page.addLocatorHandler(
    page.locator('[data-sonner-toast]'),
    async () => {
      const close = page.locator('[data-sonner-toast] [data-close], [data-sonner-toast] button[aria-label="Close"]');
      await close.first().click({ timeout: 2000 }).catch(() => {});
    },
    { times: 10, noWaitAfter: true }
  );
}

test.describe('Withdrawal System - User Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('verified user can access withdraw page', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to withdraw page using href
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Should see the withdraw page (not KYC required message)
    await expect(page.getByTestId('withdraw-page')).toBeVisible();
    
    // Should show verified badge
    await expect(page.locator('text=Cuenta verificada')).toBeVisible();
    
    await page.screenshot({ path: 'withdraw-page-verified.jpeg', type: 'jpeg', quality: 20 });
  });

  test('withdraw form displays all required fields', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Check account selector is visible
    await expect(page.getByTestId('account-selector')).toBeVisible();
    
    // Check amount input is visible
    await expect(page.getByTestId('amount-input')).toBeVisible();
    
    // Check currency selector is visible
    await expect(page.getByTestId('currency-selector')).toBeVisible();
    
    // Check banking info fields
    await expect(page.getByTestId('account-holder-input')).toBeVisible();
    await expect(page.getByTestId('iban-input')).toBeVisible();
    
    // Check submit button
    await expect(page.getByTestId('withdraw-submit-btn')).toBeVisible();
  });

  test('IBAN validation accepts valid Spanish IBAN and auto-detects bank', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Enter valid Spanish IBAN
    await page.getByTestId('iban-input').fill(VALID_SPANISH_IBAN);
    
    // Should detect bank and country automatically
    await expect(page.locator('text=CaixaBank')).toBeVisible({ timeout: 5000 });
    
    // IBAN input should show green border
    await expect(page.getByTestId('iban-input')).toHaveClass(/border-emerald/, { timeout: 3000 });
    
    await page.screenshot({ path: 'iban-validation-success.jpeg', type: 'jpeg', quality: 20 });
  });

  test('status flow information is displayed', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Check status flow information is shown
    await expect(page.locator('text=Estados del Retiro')).toBeVisible();
    await expect(page.locator('text=Pendiente de Aprobación')).toBeVisible();
    await expect(page.locator('text=Procesando')).toBeVisible();
    await expect(page.locator('text=Transferencia en Proceso')).toBeVisible();
    await expect(page.locator('text=Completado')).toBeVisible();
  });

  test('can create withdrawal request with valid data', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Fill withdrawal form
    await page.getByTestId('account-holder-input').fill('Admin LionsBit');
    await page.getByTestId('iban-input').fill(VALID_SPANISH_IBAN);
    
    // Wait for IBAN validation
    await expect(page.getByTestId('iban-input')).toHaveClass(/border-emerald/, { timeout: 5000 });
    
    await page.getByTestId('amount-input').fill('5');
    
    // Submit button should be enabled
    await expect(page.getByTestId('withdraw-submit-btn')).toBeEnabled();
    
    // Submit the form
    await page.getByTestId('withdraw-submit-btn').click();
    
    // Should show success message
    await expect(page.locator('text=Solicitud de retiro enviada').or(page.locator('text=Solicitud Enviada'))).toBeVisible({ timeout: 10000 });
    
    await page.screenshot({ path: 'withdraw-success.jpeg', type: 'jpeg', quality: 20 });
  });
});

test.describe('Admin Withdrawal Management', () => {
  
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('admin can access withdrawals management page', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to admin withdrawals page
    await page.click('a[href="/admin/withdrawals"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Should see admin withdrawals page
    await expect(page.getByTestId('admin-withdrawals-page')).toBeVisible();
    await expect(page.locator('text=Gestión de Retiros')).toBeVisible();
    
    await page.screenshot({ path: 'admin-withdrawals-page.jpeg', type: 'jpeg', quality: 20 });
  });

  test('admin page shows withdrawal statistics cards', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/admin/withdrawals"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Check stats cards are visible
    await expect(page.locator('text=Pendientes')).toBeVisible();
    await expect(page.locator('text=Procesando')).toBeVisible();
    await expect(page.locator('text=En Transferencia')).toBeVisible();
    await expect(page.locator('text=Completados')).toBeVisible();
    await expect(page.locator('text=Rechazados')).toBeVisible();
  });

  test('admin page shows status filter tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/admin/withdrawals"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Check tabs are visible
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pendientes/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /En Proceso/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Completados/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Rechazados/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Todos/ })).toBeVisible();
  });

  test('admin can filter withdrawals by status', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('a[href="/admin/withdrawals"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Click on "Todos" tab
    await page.getByRole('tab', { name: /Todos/ }).click();
    await page.waitForLoadState('domcontentloaded');
    
    // Should show the table
    await expect(page.locator('table').or(page.locator('text=No hay retiros'))).toBeVisible();
    
    await page.screenshot({ path: 'admin-withdrawals-all.jpeg', type: 'jpeg', quality: 20 });
  });
});

test.describe('Withdrawal KYC Requirement', () => {
  
  test('unverified user sees KYC requirement message', async ({ page }) => {
    // Create new unverified user
    const uniqueId = Date.now().toString().slice(-6);
    const testEmail = `unverified_${uniqueId}@test.com`;
    
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Click register link
    await page.click('text=Crear una');
    await page.waitForLoadState('domcontentloaded');
    
    // Fill registration form - find inputs by placeholder
    await page.locator('input[placeholder*="nombre"], input[id*="name"]').first().fill(`Test User ${uniqueId}`);
    await page.fill('input[type="email"]', testEmail);
    
    // Find password fields
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('TestPass123!');
    await passwordInputs.nth(1).fill('TestPass123!');
    
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    
    // Navigate to withdraw
    await page.click('a[href="/withdraw"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Should see KYC required message
    await expect(page.getByTestId('withdraw-page-kyc-required')).toBeVisible();
    await expect(page.locator('text=Verificación de Identidad Requerida')).toBeVisible();
    
    // Should show button to go to KYC
    await expect(page.getByTestId('go-to-kyc-btn')).toBeVisible();
    
    await page.screenshot({ path: 'withdraw-kyc-required.jpeg', type: 'jpeg', quality: 20 });
  });
});
