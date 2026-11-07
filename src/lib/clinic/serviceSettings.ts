/** Formulário de Configurações > Atendimento ↔ tabela clinic_service_settings e horário da clínica. */

export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const PAYMENT_OPTIONS = [
  { value: 'pix', label: 'Pix' },
  { value: 'debito', label: 'Cartão de débito' },
  { value: 'credito', label: 'Cartão de crédito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
];

export const PARKING_OPTIONS = [
  { value: 'unknown', label: 'Não informar' },
  { value: 'none', label: 'Não tem' },
  { value: 'free', label: 'Gratuito' },
  { value: 'paid', label: 'Pago' },
  { value: 'partner', label: 'Conveniado' },
];

export const PRICE_DISPLAY_OPTIONS = [
  { value: 'exact', label: 'Informar o preço' },
  { value: 'from', label: 'Dizer "a partir de" e convidar para avaliação' },
  { value: 'hidden', label: 'Não informar (só após avaliação)' },
];

export type ServiceForm = {
  payment_methods: string[];
  max_installments: string;
  installments_min_value: string;
  payment_notes: string;
  parking: string;
  parking_notes: string;
  accepts_insurance: boolean;
  insurance_plans: string; // separado por vírgula
  insurance_notes: string;
  offers_evaluation: boolean;
  evaluation_free: boolean;
  evaluation_minutes: string;
  evaluation_price: string;
  min_notice_hours: string;
  booking_horizon_days: string;
  buffer_minutes: string;
  reschedule_notice_hours: string;
  price_display: string;
  policies: string;
  notes: string;
  faq: { question: string; answer: string }[];
};

export function defaultServiceForm(): ServiceForm {
  return {
    payment_methods: [], max_installments: '', installments_min_value: '', payment_notes: '',
    parking: 'unknown', parking_notes: '', accepts_insurance: false, insurance_plans: '', insurance_notes: '',
    offers_evaluation: true, evaluation_free: true, evaluation_minutes: '30', evaluation_price: '',
    min_notice_hours: '1', booking_horizon_days: '30', buffer_minutes: '0', reschedule_notice_hours: '',
    price_display: 'exact', policies: '', notes: '', faq: [],
  };
}

type Row = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function rowToForm(r: Row): ServiceForm {
  const d = defaultServiceForm();
  if (!r) return d;
  return {
    payment_methods: Array.isArray(r.payment_methods) ? (r.payment_methods as string[]) : [],
    max_installments: str(r.max_installments),
    installments_min_value: str(r.installments_min_value),
    payment_notes: str(r.payment_notes),
    parking: str(r.parking) || 'unknown',
    parking_notes: str(r.parking_notes),
    accepts_insurance: !!r.accepts_insurance,
    insurance_plans: Array.isArray(r.insurance_plans) ? (r.insurance_plans as string[]).join(', ') : '',
    insurance_notes: str(r.insurance_notes),
    offers_evaluation: r.offers_evaluation !== false,
    evaluation_free: r.evaluation_free !== false,
    evaluation_minutes: str(r.evaluation_minutes) || d.evaluation_minutes,
    evaluation_price: str(r.evaluation_price),
    min_notice_hours: r.min_notice_minutes === null || r.min_notice_minutes === undefined ? d.min_notice_hours : String(Number(r.min_notice_minutes) / 60),
    booking_horizon_days: str(r.booking_horizon_days) || d.booking_horizon_days,
    buffer_minutes: str(r.buffer_minutes) || '0',
    reschedule_notice_hours: str(r.reschedule_notice_hours),
    price_display: str(r.price_display) || 'exact',
    policies: str(r.policies),
    notes: str(r.notes),
    faq: Array.isArray(r.faq) ? (r.faq as { question: string; answer: string }[]) : [],
  };
}

export function formToRow(f: ServiceForm) {
  return {
    payment_methods: f.payment_methods,
    max_installments: f.payment_methods.includes('credito') ? num(f.max_installments) : null,
    installments_min_value: f.payment_methods.includes('credito') ? num(f.installments_min_value) : null,
    payment_notes: f.payment_notes.trim() || null,
    parking: f.parking,
    parking_notes: f.parking_notes.trim() || null,
    accepts_insurance: f.accepts_insurance,
    insurance_plans: f.accepts_insurance ? f.insurance_plans.split(',').map((x) => x.trim()).filter(Boolean) : [],
    insurance_notes: f.insurance_notes.trim() || null,
    offers_evaluation: f.offers_evaluation,
    evaluation_free: f.evaluation_free,
    evaluation_minutes: num(f.evaluation_minutes) ?? 30,
    evaluation_price: f.evaluation_free ? null : num(f.evaluation_price),
    min_notice_minutes: Math.round((num(f.min_notice_hours) ?? 1) * 60),
    booking_horizon_days: num(f.booking_horizon_days) ?? 30,
    buffer_minutes: num(f.buffer_minutes) ?? 0,
    reschedule_notice_hours: num(f.reschedule_notice_hours),
    price_display: f.price_display,
    policies: f.policies.trim() || null,
    notes: f.notes.trim() || null,
    faq: f.faq.filter((x) => x.question.trim() && x.answer.trim()),
  };
}

export type HoursByDay = Record<number, { opens: string; closes: string }[]>;

export function hoursFromRows(rows: { day_of_week: number; opens_at: unknown; closes_at: unknown }[]): HoursByDay {
  const out: HoursByDay = {};
  for (const r of rows) (out[r.day_of_week] ||= []).push({ opens: String(r.opens_at).slice(0, 5), closes: String(r.closes_at).slice(0, 5) });
  return out;
}

/** Fecha antes de abrir ou intervalos que se sobrepõem no mesmo dia. */
export function validateHours(h: HoursByDay): string | null {
  for (const [day, list] of Object.entries(h)) {
    const sorted = [...list].sort((a, b) => a.opens.localeCompare(b.opens));
    for (let i = 0; i < sorted.length; i++) {
      if (!sorted[i].opens || !sorted[i].closes || sorted[i].closes <= sorted[i].opens) return `${DAY_NAMES[Number(day)]}: o horário de fechar precisa ser depois do de abrir.`;
      if (i > 0 && sorted[i].opens < sorted[i - 1].closes) return `${DAY_NAMES[Number(day)]}: os intervalos se sobrepõem.`;
    }
  }
  return null;
}
