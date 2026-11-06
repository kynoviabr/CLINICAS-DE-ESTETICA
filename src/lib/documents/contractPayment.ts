import { PAYMENT_METHOD_NAMES, isInstallmentMethod, type PaymentConfig, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formas de pagamento por extenso para o contrato: "Pix: R$ 600,00; Cartão de crédito: R$ 1.200,00 em 3x de R$ 400,00". */
export function describePaymentMethods(methods: PaymentMethod[], config: PaymentConfig): string {
  return methods.map((m) => {
    const amount = Number(config[m]?.amount || 0);
    const n = Number(config[m]?.installments || 0);
    const each = Number(config[m]?.installmentAmount || 0) || (n > 0 ? amount / n : amount);
    const base = `${PAYMENT_METHOD_NAMES[m] ?? m}: ${brl(amount)}`;
    return isInstallmentMethod(m) && n > 1 ? `${base} em ${n}x de ${brl(each)}` : base;
  }).join('; ');
}

/** Vencimentos: à vista na data do contrato ou 1ª parcela na data e as demais a cada mês. */
export function describeDueDates(methods: PaymentMethod[], config: PaymentConfig, contractDate: string): string {
  const parcelado = methods.some((m) => isInstallmentMethod(m) && Number(config[m]?.installments || 0) > 1);
  return parcelado
    ? `à vista ou 1ª parcela em ${contractDate}; demais parcelas no mesmo dia dos meses seguintes`
    : `à vista, em ${contractDate}`;
}
