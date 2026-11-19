import {
  PAYMENT_METHOD_NAMES,
  isInstallmentMethod,
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';

// Forma de pagamento combinada na proposta, guardada no fim do campo notes.
export type PaymentPresetSnapshot = {
  condition: PaymentCondition;
  methods: PaymentMethod[];
  config: PaymentConfig;
  details: Partial<Record<PaymentMethod, string>>;
};

export const PAYMENT_PRESET_MARKER = '[PAGAMENTO_PRESET]';

export const sanitizePaymentSnapshot = (snapshot?: PaymentPresetSnapshot | null): PaymentPresetSnapshot | null => {
  if (!snapshot) return null;
  const methods = [...new Set((snapshot.methods || []).filter((method): method is PaymentMethod => method in PAYMENT_METHOD_NAMES))];
  if (methods.length === 0) return null;
  const condition: PaymentCondition = snapshot.condition === 'installments' ? 'installments' : 'cash';
  const details: Partial<Record<PaymentMethod, string>> = {};
  const config: PaymentConfig = {};

  methods.forEach((method) => {
    details[method] = snapshot.details?.[method] || '';
    config[method] = {
      amount: snapshot.config?.[method]?.amount || '',
      installments: snapshot.config?.[method]?.installments || '',
      installmentAmount: snapshot.config?.[method]?.installmentAmount || '',
    };
  });

  return { condition, methods, details, config };
};

export const parseProposalNotesPayload = (rawNotes?: string | null): { plainNotes: string; paymentPreset: PaymentPresetSnapshot | null } => {
  const noteText = rawNotes || '';
  const escapedMarker = PAYMENT_PRESET_MARKER.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const regex = new RegExp(`(?:\\r?\\n)*${escapedMarker}([A-Za-z0-9+/=]+)\\s*$`);
  const match = noteText.match(regex);
  if (!match) return { plainNotes: noteText, paymentPreset: null };

  let paymentPreset: PaymentPresetSnapshot | null = null;
  try {
    const decoded = decodeURIComponent(escape(atob(match[1])));
    paymentPreset = sanitizePaymentSnapshot(JSON.parse(decoded) as PaymentPresetSnapshot);
  } catch {
    paymentPreset = null;
  }

  const plainNotes = noteText.replace(regex, '').trim();
  return { plainNotes, paymentPreset };
};

export const composeProposalNotesPayload = (plainNotes: string, paymentPreset?: PaymentPresetSnapshot | null) => {
  const cleanNotes = plainNotes.trim();
  const sanitizedPreset = sanitizePaymentSnapshot(paymentPreset);
  if (!sanitizedPreset) return cleanNotes || null;

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sanitizedPreset))));
  const markerLine = `${PAYMENT_PRESET_MARKER}${encoded}`;
  return cleanNotes ? `${cleanNotes}\n\n${markerLine}` : markerLine;
};

/** Resumo legível da forma de pagamento combinada (impressão, PDF e mensagens). */
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const buildPaymentPresetSummary = (preset?: PaymentPresetSnapshot | null) => {
  if (!preset || preset.methods.length === 0) return '';
  const methodsText = preset.methods
    .map((method) => {
      const option = PAYMENT_METHOD_NAMES[method] || method;
      const amount = Number(preset.config?.[method]?.amount || 0);
      const installments = Number(preset.config?.[method]?.installments || 0);
      const installmentAmount = Number(preset.config?.[method]?.installmentAmount || 0);
      if (isInstallmentMethod(method)) {
        const count = installments || 1;
        return `${option}: ${brl(amount)} · ${count}x de ${brl(installmentAmount || amount / count)}`;
      }
      return `${option}: ${brl(amount)}`;
    })
    .join(' | ');
  return `Condição: ${paymentConditionLabels[preset.condition]} | ${methodsText}`;
};
