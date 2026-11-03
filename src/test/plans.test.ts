import { describe, expect, it } from 'vitest';
import { MENU_PERMISSION_KEYS } from '@/lib/accessPermissions';
import { PERMISSION_MODULE, hasModule, permissionAllowedByPlan, settingsTabVisible } from '@/lib/plans';

const essencial = new Set(['core', 'crm', 'automation']);

describe('planos', () => {
  it('toda permissão de tela pertence a um módulo', () => {
    for (const key of MENU_PERMISSION_KEYS) expect(PERMISSION_MODULE[key]).toBeTruthy();
  });

  it('Essencial vê o núcleo e as interessadas, mas não metas nem sessões', () => {
    expect(permissionAllowedByPlan(essencial, 'appointments.view')).toBe(true);
    expect(permissionAllowedByPlan(essencial, 'crm.view')).toBe(true);
    expect(permissionAllowedByPlan(essencial, 'goals.view')).toBe(false);
    expect(permissionAllowedByPlan(essencial, 'sessions.view')).toBe(false);
    expect(permissionAllowedByPlan(essencial, 'whatsapp_ai.view')).toBe(false);
  });

  it('Essencial: menu com 9 itens', () => {
    expect(MENU_PERMISSION_KEYS.filter((k) => permissionAllowedByPlan(essencial, k))).toHaveLength(9);
  });

  it('abas de Configurações seguem o plano', () => {
    expect(settingsTabVisible(essencial, 'general')).toBe(true);
    expect(settingsTabVisible(essencial, 'goals')).toBe(false);
    expect(settingsTabVisible(essencial, 'groups-permissions')).toBe(false);
    expect(settingsTabVisible(essencial, 'crm-kanban')).toBe(true);
  });

  it('sem saber os módulos, não esconde nada', () => {
    expect(hasModule(null, 'performance')).toBe(true);
    expect(settingsTabVisible(null, 'goals')).toBe(true);
  });
});
