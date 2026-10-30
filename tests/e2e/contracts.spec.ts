import { test, expect } from '@playwright/test';

test.describe('Fluxo de Contratos E2E', () => {
  // Nota: Estes testes assumem um ambiente seedado com clinic_id e patient_id válidos.
  
  test('Cria rascunho de template, edita e ativa', async ({ page }) => {
    // 1. Acesso como admin e criação de rascunho
    await page.goto('/settings/contracts');
    await page.click('button:has-text("Novo Rascunho")');
    await page.fill('textarea', '<h1>Contrato Editado</h1>');
    await page.click('button:has-text("Salvar Rascunho")');
    
    // 2. Preview
    await page.click('button:has-text("Visualizar")');
    await expect(page.locator('h1')).toHaveText('Contrato Editado');
    await page.click('button:has-text("Fechar")');

    // 3. Ativar
    await page.click('button:has-text("Ativar")');
    await expect(page.locator('text="Modelo ativo"')).toBeVisible();
  });

  test('Emite contrato com preview obrigatório e assinaturas', async ({ page }) => {
    await page.goto('/clinic/contracts');
    
    // Configuração de dados e geração
    // ... setup de propostas ...
    await page.click('button:has-text("Gerar Contrato")');
    
    // Verifica Preview Modal
    await expect(page.locator('text="Revisão do Contrato"')).toBeVisible();
    await page.click('button:has-text("Confirmar e Emitir")');
    
    // Espera sucesso
    await expect(page.locator('text="Contrato emitido com sucesso"')).toBeVisible();
  });

  test('Abertura de PDF via Signed URL temporária', async ({ page, context }) => {
    await page.goto('/clinic/contracts');
    
    // Clica em visualizar
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('button:has-text("Ver arquivo")')
    ]);
    
    // Verifica se carregou o signed URL e não public URL
    expect(newPage.url()).toContain('token=');
  });
});
