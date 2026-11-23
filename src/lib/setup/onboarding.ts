// Primeiros passos de uma clínica nova: o que já está pronto e o que falta, calculado a partir dos
// dados reais (não de marcações manuais). Usado no "Meu dia" e na implantação guiada.

export type OnboardingFacts = {
  hasClinicData: boolean;      // nome + CNPJ/CPF
  hasBrand: boolean;           // logo ou cor própria
  hasHours: boolean;           // dias e horários de atendimento de alguma profissional
  treatments: number;          // tratamentos ativos
  hasContract: boolean;        // contrato padrão ativo
  whatsappConnected: boolean;  // WhatsApp oficial ligado (opcional)
  patients: number;
  appointments: number;
};

export type OnboardingItem = {
  id: 'clinica' | 'marca' | 'horarios' | 'tratamentos' | 'contrato' | 'whatsapp' | 'paciente' | 'agendamento';
  title: string;
  why: string;                 // por que isso importa, em uma frase
  action: string;              // texto do botão
  href: string;
  done: boolean;
  optional?: boolean;
};

export function onboardingItems(f: OnboardingFacts): OnboardingItem[] {
  return [
    {
      id: 'clinica', title: 'Dados da clínica', done: f.hasClinicData,
      why: 'Nome, CNPJ e endereço saem nas propostas e nos contratos.',
      action: 'Preencher dados', href: '/clinic/implantacao?passo=clinica',
    },
    {
      id: 'marca', title: 'Logo e cor da clínica', done: f.hasBrand,
      why: 'O sistema, as propostas e o portal da paciente ficam com a cara da sua clínica.',
      action: 'Escolher marca', href: '/clinic/implantacao?passo=marca',
    },
    {
      id: 'horarios', title: 'Dias e horários de atendimento', done: f.hasHours,
      why: 'Sem horários a agenda não oferece vagas, nem para a equipe nem para a IA.',
      action: 'Definir horários', href: '/clinic/implantacao?passo=atendimento',
    },
    {
      id: 'tratamentos', title: 'Tratamentos e preços', done: f.treatments > 0,
      why: 'É com eles que você monta propostas e marca sessões.',
      action: 'Escolher tratamentos', href: '/clinic/implantacao?passo=tratamentos',
    },
    {
      id: 'contrato', title: 'Contrato padrão', done: f.hasContract,
      why: 'Cada venda gera o contrato preenchido para a cliente assinar pelo celular.',
      action: 'Revisar contrato', href: '/clinic/settings?aba=contract-template',
    },
    {
      id: 'whatsapp', title: 'WhatsApp da clínica', done: f.whatsappConnected, optional: true,
      why: 'Lembretes automáticos e a IA respondendo clientes no número oficial.',
      action: 'Conectar WhatsApp', href: '/clinic/settings?aba=whatsapp',
    },
    {
      id: 'paciente', title: 'Primeira cliente cadastrada', done: f.patients > 0,
      why: 'Cadastre uma cliente real (ou você mesma, para testar).',
      action: 'Cadastrar cliente', href: '/clinic/patients',
    },
    {
      id: 'agendamento', title: 'Primeiro atendimento marcado', done: f.appointments > 0,
      why: 'Com o primeiro horário na agenda, a clínica está rodando.',
      action: 'Marcar atendimento', href: '/clinic/appointments?openNew=1',
    },
  ];
}

/** Progresso (opcionais não contam) e o próximo passo obrigatório a fazer. */
export function onboardingProgress(items: OnboardingItem[]) {
  const required = items.filter((i) => !i.optional);
  const done = required.filter((i) => i.done).length;
  return {
    done,
    total: required.length,
    percent: required.length ? Math.round((done / required.length) * 100) : 100,
    next: required.find((i) => !i.done) || items.find((i) => !i.done) || null,
    complete: done === required.length,
  };
}

/** Cores sugeridas na implantação (tons usados em estética), com nome para a pessoa reconhecer. */
export const BRAND_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Verde-sálvia', hex: '#1a7a6d' },
  { name: 'Rosa', hex: '#d9668f' },
  { name: 'Nude', hex: '#b07d62' },
  { name: 'Lilás', hex: '#7c5cbf' },
  { name: 'Azul', hex: '#2f6fb3' },
  { name: 'Dourado', hex: '#b38b2d' },
  { name: 'Vinho', hex: '#8c2f4b' },
  { name: 'Grafite', hex: '#3d4451' },
];
