import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

function leadTargetName() {
  return process.env.E2E_AGENDA_LEAD_NAME || process.env.E2E_LEAD_NAME || 'E2E Agenda Seed';
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeInput(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function toTimeLabel(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function plusMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

async function openAppointmentDialogByStartTime(
  page: import('@playwright/test').Page,
  leadName: string,
  startTimeLabel: string,
) {
  const appointmentDialog = page.getByRole('dialog', { name: /^Agendamento$/i });
  const candidateRows = page.locator('div.p-4.rounded-lg.border.cursor-pointer').filter({
    hasText: new RegExp(`${leadName}.*${startTimeLabel}|${startTimeLabel}.*${leadName}`, 'i'),
  });
  const count = await candidateRows.count();
  for (let i = 0; i < count; i += 1) {
    const row = candidateRows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.waitForTimeout(250);
    if (await appointmentDialog.isVisible()) return appointmentDialog;
  }
  throw new Error(`Não foi possível abrir o modal do agendamento para o horário inicial ${startTimeLabel}.`);
}

function nextBusinessDate(baseDaysAhead = 14, hour = 14, minute = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + baseDaysAhead);
  date.setHours(hour, minute, 0, 0);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return date;
}

function buildUniqueStartDate() {
  const nonce = Date.now();
  const extraDays = 45 + (nonce % 20);
  const hour = 8 + (Math.floor(nonce / 1000) % 9); // 08..16
  const minute = (Math.floor(nonce / 1000) % 12) * 5; // 00..55
  return nextBusinessDate(extraDays, hour, minute);
}

test.describe('Fluxo E2E - Agenda', () => {
  test('agenda, confirma, remarca e cancela avaliação', async ({ page }) => {
    const preferredLeadName = leadTargetName();
    let selectedLeadName = preferredLeadName;
    let createdStart = buildUniqueStartDate();

    await login(page);
    await page.getByRole('link', { name: /^Agenda$/i }).click();
    await expect(page).toHaveURL(/\/clinic\/appointments/i);

    await page.getByRole('button', { name: /novo agendamento/i }).click();
    const createDialog = page.getByRole('dialog').filter({ hasText: /novo agendamento/i });
    await expect(createDialog).toBeVisible();

    const comboboxes = createDialog.locator('button[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: /avaliação de lead/i }).click();

    await comboboxes.nth(1).click();
    const preferredLeadOption = page.getByRole('option', { name: new RegExp(`^${preferredLeadName}$`, 'i') }).first();
    await expect(preferredLeadOption).toBeVisible();
    selectedLeadName = (await preferredLeadOption.innerText()).trim() || preferredLeadName;
    await preferredLeadOption.click();

    if ((await comboboxes.count()) >= 4) {
      await comboboxes.nth(3).click();
      await page.getByRole('option').filter({ hasText: /\S+/ }).first().click();
    }

    const dateInput = createDialog.locator('input[type="date"]');
    const timeInput = createDialog.locator('input[type="time"]');
    const durationInput = createDialog.locator('input[type="number"]');
    const submitButton = createDialog.getByRole('button', { name: /agendar avaliação/i });

    let created = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const attemptStart = new Date(createdStart.getTime() + attempt * 30 * 60 * 1000);
      await dateInput.fill(toDateInput(attemptStart));
      await timeInput.fill(toTimeInput(attemptStart));
      await durationInput.fill('60');
      await submitButton.click();
      await page.waitForTimeout(1200);

      if (!(await createDialog.isVisible())) {
        created = true;
        createdStart = attemptStart;
        break;
      }
    }

    if (!created) {
      throw new Error('Não foi possível criar novo agendamento para validar o fluxo da Agenda.');
    }

    const dayTab = page.getByRole('tab', { name: /^Dia$/i });
    if ((await dayTab.count()) > 0) await dayTab.click();
    const dayButton = page.getByRole('button', { name: /^Dia$/i });
    if ((await dayButton.count()) > 0) await dayButton.click();

    const createdTimeLabel = toTimeLabel(createdStart);
    const createdEndTimeLabel = toTimeLabel(plusMinutes(createdStart, 60));
    const createdRangeText = new RegExp(`^${createdTimeLabel}\\s-\\s${createdEndTimeLabel}$`);
    const createdRange = page.getByText(createdRangeText).first();
    await expect(createdRange).toBeVisible({ timeout: 20_000 });
    let appointmentDialog = await openAppointmentDialogByStartTime(page, selectedLeadName, createdTimeLabel);
    await expect(appointmentDialog).toBeVisible();
    const confirmButton = appointmentDialog.getByRole('button', { name: /^Confirmar$/i });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.click();
      await page.waitForTimeout(800);
      appointmentDialog = await openAppointmentDialogByStartTime(page, selectedLeadName, createdTimeLabel);
      await expect(appointmentDialog).toBeVisible();
    }

    const rescheduleButton = appointmentDialog.getByRole('button', { name: /remarcar/i });
    await expect(rescheduleButton).toHaveCount(1);
    await rescheduleButton.scrollIntoViewIfNeeded();
    await rescheduleButton.click();

    const remapDialog = page.getByRole('dialog').filter({ hasText: /remarcar agendamento/i });
    await expect(remapDialog).toBeVisible();
    await remapDialog.locator('textarea').first().fill('Teste E2E de remarcação.');

    let rescheduledStart = new Date(createdStart.getTime() + 60 * 60 * 1000);
    let rescheduled = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const attemptReschedule = new Date(rescheduledStart.getTime() + attempt * 60 * 60 * 1000);
      await remapDialog.locator('input[type="date"]').fill(toDateInput(attemptReschedule));
      await remapDialog.locator('input[type="time"]').fill(toTimeInput(attemptReschedule));
      await remapDialog.locator('input[type="number"]').fill('60');
      await remapDialog.getByRole('button', { name: /confirmar remarcação/i }).click();
      await page.waitForTimeout(1200);

      if (!(await remapDialog.isVisible())) {
        rescheduled = true;
        rescheduledStart = attemptReschedule;
        break;
      }
    }

    if (!rescheduled) {
      throw new Error('Não foi possível remarcar o agendamento no fluxo E2E.');
    }

    const rescheduledTimeLabel = toTimeLabel(rescheduledStart);
    const rescheduledEndTimeLabel = toTimeLabel(plusMinutes(rescheduledStart, 60));
    const rescheduledRangeText = new RegExp(`^${rescheduledTimeLabel}\\s-\\s${rescheduledEndTimeLabel}$`);
    const rescheduledRange = page.getByText(rescheduledRangeText).first();
    await expect(rescheduledRange).toBeVisible({ timeout: 20_000 });
    const reopenedDialog = await openAppointmentDialogByStartTime(page, selectedLeadName, rescheduledTimeLabel);
    await expect(reopenedDialog).toBeVisible();
    const cancelAppointmentButton = reopenedDialog.getByRole('button', { name: /cancelar/i });
    await expect(cancelAppointmentButton).toHaveCount(1);
    await cancelAppointmentButton.scrollIntoViewIfNeeded();
    await cancelAppointmentButton.click();
    const cancelDialog = page.getByRole('dialog').filter({ hasText: /cancelar agendamento/i });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.locator('textarea').first().fill('Teste E2E de cancelamento.');
    await cancelDialog.getByRole('button', { name: /confirmar cancelamento/i }).click();
    await expect(page.getByText('Agenda atualizada', { exact: true })).toBeVisible();
  });
});
