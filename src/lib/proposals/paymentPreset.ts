import {
  paymentMethodOptions,
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
  const methods = (snapshot.methods || []).filter((method): method is PaymentMethod =>
    paymentMethodOptions.some((option) => option.value === method)
  ).slice(0, 2);
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
  const regex = new RegExp(`\\n?${PAYMENT_PRESET_MARKER}([A-Za-z0-9+/=]+)\\s*$`);
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
