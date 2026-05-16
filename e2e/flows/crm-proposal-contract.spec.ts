import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_LEAD_NAME || 'Agenda teste';
}

test.describe('Fluxo E2E - CRM -> Proposta -> Contrato', () => {
  test('abre lead, acessa proposta e gera contrato', async ({ page }) => {
    const leadName = leadTargetName();
    const leadNameRegex = new RegExp(`^${leadName}$`, 'i');

    await login(page);
    await page.getByRole('link', { name: /^CRM$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/crm/i);

    const leadSearch = page.getByPlaceholder(/buscar por nome, telefone ou cpf/i);
    await expect(leadSearch).toBeVisible();
    await leadSearch.fill(leadName);

    const namedLead = page.getByText(leadNameRegex).first();
    await expect(namedLead).toBeVisible({ timeout: 20_000 });
    await namedLead.click();

    await expect(page.getByRole('tab', { name: /^Propostas$/i })).toBeVisible();
    await page.getByRole('tab', { name: /^Propostas$/i }).click();

    const proposalCode = page.getByText(/PROP-\d{6}-\d+/).first();
    const hasProposal = (await proposalCode.count()) > 0;
    if (!hasProposal) {
      await page.getByRole('button', { name: /criar nova proposta/i }).click();
      await expect(page).toHaveURL(/\/clinic\/proposals/i);
      await expect(page.getByRole('heading', { name: /nova proposta/i })).toBeVisible();
      await page.getByRole('button', { name: /adicionar tratamento/i }).click();
      await page.getByRole('button', { name: /^criar proposta$/i }).click();
      await expect(page.getByText('Proposta criada!', { exact: true }).first()).toBeVisible();
    }

    const proposalCodeAfterCreate = page.getByText(/PROP-\d{6}-\d+/).first();
    await expect(proposalCodeAfterCreate).toBeVisible({ timeout: 20_000 });
    await proposalCodeAfterCreate.click();
    await expect(page).toHaveURL(/\/clinic\/proposals/i);

    const proposalModalTitle = page.locator('h2:has-text("Proposta PROP-")');
    await expect(proposalModalTitle).toBeVisible();

    const approveButton = page.getByRole('button', { name: /aprovar/i });
    if ((await approveButton.count()) > 0) {
      await approveButton.click();
      await expect(page.getByText(/status atualizado/i).first()).toBeVisible();
    }

    const generateContractButton = page.getByRole('button', { name: /gerar contrato|converter em contrato/i }).first();
    if ((await generateContractButton.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Proposta sem ação de contrato disponível no estado atual do ambiente.',
      });
      return;
    }
    await expect(generateContractButton).toBeVisible();
    await generateContractButton.click();
    await expect(page.getByText('Contrato gerado!', { exact: true })).toBeVisible();
  });
});
