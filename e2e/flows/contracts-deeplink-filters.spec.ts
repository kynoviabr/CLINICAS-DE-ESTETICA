import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Fluxo E2E - Contratos (deep link de filtros)', () => {
  test('abre contratos com filtros via query string', async ({ page }) => {
    await login(page);

    await page.goto('/clinic/contracts?status=overdue');
    await expect(page).toHaveURL(/\/clinic\/contracts\?status=overdue/i);
    await expect(page.getByRole('heading', { level: 1, name: /contratos/i })).toBeVisible();
    await expect(page.locator('button[role="combobox"]').nth(0)).toContainText(/revisar documento/i);

    await page.goto('/clinic/contracts?quick=pending_signature');
    await expect(page).toHaveURL(/\/clinic\/contracts\?quick=pending_signature/i);
    await expect(page.getByRole('button', { name: /assinatura pendente/i })).toBeVisible();
  });
});
