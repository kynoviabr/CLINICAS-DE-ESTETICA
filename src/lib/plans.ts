import type { MenuPermissionKey } from '@/lib/accessPermissions';

// Módulos que um plano liga. Espelha public.plans e public.permission_module no banco.
export const MODULE_KEYS = [
  'core',
  'crm',
  'automation',
  'clinical',
  'performance',
  'governance',
  'aura',
  'white_label',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const PERMISSION_MODULE: Record<MenuPermissionKey, ModuleKey> = {
  'dashboard.view': 'core',
  'crm.view': 'crm',
  'patients.view': 'core',
  'treatments.view': 'core',
  'proposals.view': 'core',
  'contracts.view': 'core',
  'finance_contracts.view': 'core',
  'goals.view': 'performance',
  'appointments.view': 'core',
  'sessions.view': 'clinical',
  'evolution.view': 'clinical',
  'photos.view': 'clinical',
  'feedback.view': 'clinical',
  'reports.view': 'performance',
  'settings.view': 'core',
};

// Abas e sub-abas de Configurações que dependem de módulo (as demais são do núcleo).
export const SETTINGS_TAB_MODULE: Record<string, ModuleKey> = {
  roles: 'governance',
  entities: 'clinical',
  costs: 'governance',
  'crm-kanban': 'crm',
  goals: 'performance',
  'groups-permissions': 'governance',
  'patient-app-access': 'clinical',
};

/** null = módulos ainda desconhecidos (ou banco sem planos): não esconde nada. */
export type ModuleSet = ReadonlySet<string> | null;

export function hasModule(modules: ModuleSet, module: ModuleKey): boolean {
  return modules === null || modules.has(module);
}

export function permissionAllowedByPlan(modules: ModuleSet, key: MenuPermissionKey): boolean {
  return hasModule(modules, PERMISSION_MODULE[key]);
}

export function settingsTabVisible(modules: ModuleSet, tab: string): boolean {
  const module = SETTINGS_TAB_MODULE[tab];
  return !module || hasModule(modules, module);
}

/** Plano enxuto (Essencial): sem os módulos de gestão comercial. Usa o "Meu dia" como início. */
export function isLeanPlan(modules: ModuleSet): boolean {
  return modules !== null && !modules.has('performance');
}
