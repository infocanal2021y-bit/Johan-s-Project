import { test, expect, Page } from '@playwright/test';

// Admin credentials
const ADMIN_EMAIL = "johanspotify67@gmail.com";
const ADMIN_PASSWORD = "LionsBit2026!";

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

test.describe('Settings Page - Login History', () => {
  
  test('Settings page displays login history', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate via URL
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    
    // Check page loaded
    await expect(page.getByText('Account Settings')).toBeVisible();
    await expect(page.getByText('Recent Login Activity')).toBeVisible();
    
    // Should show current session badge
    await expect(page.getByText('Current Session')).toBeVisible();
  });
  
  test('Settings page displays account information', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    
    await expect(page.getByText('Account Information')).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
    await expect(page.getByText(/Johan/i)).toBeVisible();
  });
});

test.describe('Settings Page - Change Password', () => {
  
  test('Change password form is visible', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    
    await expect(page.getByText('Change Password')).toBeVisible();
    
    // Check password fields exist
    const currentPwField = page.getByLabel('Current Password');
    const newPwField = page.getByLabel('New Password');
    const confirmPwField = page.getByLabel('Confirm New Password');
    
    await expect(currentPwField).toBeVisible();
    await expect(newPwField).toBeVisible();
    await expect(confirmPwField).toBeVisible();
    
    await expect(page.getByRole('button', { name: /Update Password/i })).toBeVisible();
  });
  
  test('Change password shows error for mismatched passwords', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    
    // Fill mismatched passwords
    await page.getByLabel('Current Password').fill('CurrentPass123!');
    await page.getByLabel('New Password').fill('NewPass123!');
    await page.getByLabel('Confirm New Password').fill('DifferentPass123!');
    
    await page.getByRole('button', { name: /Update Password/i }).click();
    
    // Should show error toast
    await expect(page.getByText(/do not match/i)).toBeVisible();
  });
});

test.describe('Support Page - User Tickets', () => {
  
  test('Support page loads and displays support center', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    
    await expect(page.getByText('Support Center')).toBeVisible();
    await expect(page.getByText('My Tickets')).toBeVisible();
    await expect(page.getByRole('button', { name: /New Ticket/i })).toBeVisible();
  });
  
  test('User can open create ticket dialog', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    
    await page.getByRole('button', { name: /New Ticket/i }).click();
    
    // Dialog should appear
    await expect(page.getByText('Create Support Ticket')).toBeVisible();
    await expect(page.getByText('Category')).toBeVisible();
    await expect(page.getByText('Subject')).toBeVisible();
    await expect(page.getByText('Message')).toBeVisible();
    await expect(page.getByRole('button', { name: /Submit Ticket/i })).toBeVisible();
  });
  
  test('User can create a support ticket', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    
    await page.getByRole('button', { name: /New Ticket/i }).click();
    
    const uniqueSubject = `TEST_TICKET_${Date.now()}`;
    
    // Fill form - use placeholder for inputs within dialog
    await page.getByPlaceholder('Brief description of your issue').fill(uniqueSubject);
    await page.getByPlaceholder('Describe your issue in detail...').fill('This is a test ticket message for E2E testing automated tests');
    
    await page.getByRole('button', { name: /Submit Ticket/i }).click();
    
    // Wait for dialog to close
    await expect(page.getByText('Create Support Ticket')).not.toBeVisible();
    
    // Ticket should appear in list
    await expect(page.getByText(uniqueSubject)).toBeVisible();
  });
  
  test('User can view and reply to ticket', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    
    // Create a ticket first
    await page.getByRole('button', { name: /New Ticket/i }).click();
    const uniqueSubject = `VIEW_REPLY_TEST_${Date.now()}`;
    await page.getByPlaceholder('Brief description of your issue').fill(uniqueSubject);
    await page.getByPlaceholder('Describe your issue in detail...').fill('Test message for viewing and replying');
    await page.getByRole('button', { name: /Submit Ticket/i }).click();
    
    // Wait for dialog to close
    await expect(page.getByText('Create Support Ticket')).not.toBeVisible();
    
    // Click on ticket to view
    await page.getByText(uniqueSubject).click();
    
    // Dialog should open with ticket details
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(uniqueSubject)).toBeVisible();
    
    // Reply
    const replyText = `Reply_${Date.now()}`;
    await page.getByPlaceholder('Type your reply...').fill(replyText);
    
    // Click send button (it's a button after the input in the dialog)
    const dialogInput = page.getByPlaceholder('Type your reply...');
    const sendBtn = dialogInput.locator('..').getByRole('button');
    await sendBtn.click();
    
    // Reply should appear
    await expect(page.getByText(replyText)).toBeVisible();
  });
});

test.describe('Admin Support Page', () => {
  
  test('Admin can access support tickets page', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/support', { waitUntil: 'domcontentloaded' });
    
    await expect(page.getByText('Support Tickets').first()).toBeVisible();
    await expect(page.getByText('All Tickets')).toBeVisible();
    
    // Stats cards should be visible
    await expect(page.getByText('Open').first()).toBeVisible();
    await expect(page.getByText('In Progress').first()).toBeVisible();
    await expect(page.getByText('Resolved').first()).toBeVisible();
  });
  
  test('Admin can see ticket list with table headers', async ({ page }) => {
    await loginAsAdmin(page);
    
    await page.goto('/admin/support', { waitUntil: 'domcontentloaded' });
    
    // Table headers
    await expect(page.getByRole('columnheader', { name: /Ticket/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /User/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Subject/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();
  });
});

test.describe('Navigation - SPA Routes', () => {
  
  test('Sidebar shows all navigation links for admin user', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Desktop sidebar
    const sidebar = page.locator('aside.hidden.lg\\:block');
    
    // User links
    await expect(sidebar.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/accounts"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/transactions"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/transfer"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/withdraw"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/kyc"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/support"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/settings"]')).toBeVisible();
    
    // Admin links - verify they exist in sidebar
    await expect(sidebar.locator('a[href="/admin"]')).toBeVisible();
  });
  
  test('Direct navigation to pages works correctly', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to Settings
    await page.goto('/settings');
    await expect(page.getByText('Account Settings')).toBeVisible();
    
    // Navigate to Support
    await page.goto('/support');
    await expect(page.getByText('Support Center')).toBeVisible();
    
    // Navigate to Admin Support
    await page.goto('/admin/support');
    await expect(page.getByText('All Tickets')).toBeVisible();
    
    // Back to Dashboard
    await page.goto('/dashboard');
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
  });
});
