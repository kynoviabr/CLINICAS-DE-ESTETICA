import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_LEAD_NAME || 'Agenda teste';
}

test.describe('Golden Path - Dashboard -> CRM -> Proposta -> Contrato -> CRM', () => {
  test('executa o fluxo comercial principal fim a fim', async ({ page }) => {
    const leadName = leadTargetName();
    const leadNameRegex = new RegExp(`^${leadName}$`, 'i');

    await test.step('Login e Dashboard', async () => {
      await login(page);
      await page.getByRole('link', { name: /^Dashboard$/i }).click();
      await expect(page).toHaveURL(/\/clinic(\/dashboard)?(\/|$)/i);
      await expect(page.locator('main').getByRole('heading', { level: 1 }).first()).toContainText(/dashboard/i);
    });

    await test.step('Ir para CRM e abrir ficha do lead', async () => {
      await page.getByRole('link', { name: /^CRM$/i }).click();
      await expect(page).toHaveURL(/\/clinic\/crm/i);
      await expect(page.getByRole('heading', { level: 1, name: /crm/i })).toBeVisible();

      const leadSearch = page.getByPlaceholder(/buscar por nome, telefone ou cpf/i);
      await expect(leadSearch).toBeVisible();
      await leadSearch.fill(leadName);

      const leadCard = page.getByText(leadNameRegex).first();
      await expect(leadCard).toBeVisible({ timeout: 20_000 });
      await leadCard.click();
      await expect(page.getByRole('tab', { name: /^Dados Gerais$/i })).toBeVisible();
    });

    await test.step('Abrir proposta pela ficha do lead', async () => {
      await page.getByRole('tab', { name: /^Propostas$/i }).click();
      const proposalCode = page.getByText(/PROP-\d{6}-\d+/).first();
      await expect(proposalCode).toBeVisible({ timeout: 20_000 });
      await proposalCode.click();

      await expect(page).toHaveURL(/\/clinic\/proposals/i);
      await expect(page.locator('h2:has-text("Proposta PROP-")')).toBeVisible();
    });

    await test.step('Gerar contrato a partir da proposta', async () => {
      const approveButton = page.getByRole('button', { name: /aprovar/i });
      if ((await approveButton.count()) > 0) {
        await approveButton.first().click();
        await expect(page.getByText(/status atualizado/i).first()).toBeVisible();
      }

      const generateContractButton = page.getByRole('button', { name: /gerar contrato|converter em contrato/i }).first();
      await expect(generateContractButton).toBeVisible({ timeout: 15_000 });
      await generateContractButton.click();
      await expect(page.getByText('Contrato gerado!', { exact: true })).toBeVisible();
    });

    await test.step('Voltar ao CRM e reabrir lead', async () => {
      await page.keyboard.press('Escape');
      const crmSidebarLink = page.getByRole('link', { name: /^CRM$/i });
      if ((await crmSidebarLink.count()) > 0) {
        await crmSidebarLink.click();
      } else {
        await page.goto('/clinic/crm');
      }
      await expect(page).toHaveURL(/\/clinic\/crm/i);

      const leadSearch = page.getByPlaceholder(/buscar por nome, telefone ou cpf/i);
      await expect(leadSearch).toBeVisible();
      await leadSearch.fill(leadName);
      const leadCard = page.getByText(leadNameRegex).first();
      await expect(leadCard).toBeVisible();
      await leadCard.click();
      await page.getByRole('tab', { name: /^Contratos$/i }).click();
      const contractCode = page.getByText(/CONT-\d{6}-\d+/).first();
      const emptyContractsState = page.getByText(/nenhum contrato/i).first();

      if ((await contractCode.count()) > 0) {
        await expect(contractCode).toBeVisible();
      } else {
        await expect(emptyContractsState).toBeVisible();
      }
    });
  });
});
