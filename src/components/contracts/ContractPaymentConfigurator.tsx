import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export type PaymentCondition = 'cash' | 'installments';
/** 'card' é o cartão antigo (sem dizer débito/crédito): só aparece em contratos/propostas já existentes. */
export type PaymentMethod = 'cash' | 'pix' | 'debit' | 'credit' | 'boleto' | 'transfer' | 'card';
export type PaymentConfig = Partial<Record<PaymentMethod, { amount: string; installments?: string; installmentAmount?: string }>>;

export const paymentConditionLabels: Record<PaymentCondition, string> = {
  cash: 'À vista',
  installments: 'Parcelado',
};

/** Nome de cada forma. O texto é lido pelo banco para gerar as parcelas: não mudar sem mudar o banco. */
export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  debit: 'Cartão de débito',
  credit: 'Cartão de crédito',
  boleto: 'Boleto',
  transfer: 'Transferência',
  card: 'Cartão',
};

/** Formas oferecidas ao combinar o pagamento (sem limite de quantidade). */
export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = (
  ['pix', 'credit', 'debit', 'cash', 'boleto', 'transfer'] as PaymentMethod[]
).map((value) => ({ value, label: PAYMENT_METHOD_NAMES[value] }));

/** Formas que podem ser parceladas. */
export const isInstallmentMethod = (method: PaymentMethod) => method === 'credit' || method === 'boleto' || method === 'card';

interface Props {
  paymentCondition: PaymentCondition;
  setPaymentCondition: (value: PaymentCondition) => void;
  selectedPaymentMethods: PaymentMethod[];
  togglePaymentMethod: (method: PaymentMethod, checked: boolean) => void;
  paymentConfig: PaymentConfig;
  setPaymentConfig: (updater: (current: PaymentConfig) => PaymentConfig) => void;
  paymentDetails: Partial<Record<PaymentMethod, string>>;
  setPaymentDetails: (updater: (current: Partial<Record<PaymentMethod, string>>) => Partial<Record<PaymentMethod, string>>) => void;
}

export function ContractPaymentConfigurator({
  paymentCondition,
  setPaymentCondition,
  selectedPaymentMethods,
  togglePaymentMethod,
  paymentConfig,
  setPaymentConfig,
  paymentDetails,
  setPaymentDetails,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border p-4 bg-card">
      <div className="space-y-2">
        <Label>Condição de pagamento</Label>
        <Select value={paymentCondition} onValueChange={(value) => setPaymentCondition(value as PaymentCondition)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a condição" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">À vista</SelectItem>
            <SelectItem value="installments">Parcelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Formas de pagamento</Label>
          <span className="text-xs text-muted-foreground">use quantas precisar</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...paymentMethodOptions, ...(selectedPaymentMethods.includes('card') ? [{ value: 'card' as PaymentMethod, label: PAYMENT_METHOD_NAMES.card }] : [])].map((option) => {
            const checked = selectedPaymentMethods.includes(option.value);
            return (
              <label key={option.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={checked} onCheckedChange={(next) => togglePaymentMethod(option.value, Boolean(next))} />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>

      {selectedPaymentMethods.length > 0 && (
        <div className="space-y-3">
          <Label>Detalhes por forma selecionada</Label>
          {selectedPaymentMethods.map((method) => {
            const option = { value: method, label: PAYMENT_METHOD_NAMES[method] ?? method };
            const installable = isInstallmentMethod(method);
            return (
              <div key={method} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{option?.label}</Label>
                <div className={`grid gap-2 ${installable ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Valor</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Valor"
                      value={paymentConfig[method]?.amount || ''}
                      onChange={(event) =>
                        setPaymentConfig((current) => ({
                          ...current,
                          [method]: {
                            amount: event.target.value,
                            installments: current[method]?.installments || '',
                            installmentAmount: current[method]?.installmentAmount || '',
                          },
                        }))
                      }
                    />
                  </div>
                  {installable ? (
                    <>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Número de parcelas</p>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Parcelas"
                          value={paymentConfig[method]?.installments || ''}
                          onChange={(event) =>
                            setPaymentConfig((current) => ({
                              ...current,
                              [method]: {
                                amount: current[method]?.amount || '',
                                installments: event.target.value,
                                installmentAmount: current[method]?.installmentAmount || '',
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Valor da parcela opcional</p>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Calculado se vazio"
                          value={paymentConfig[method]?.installmentAmount || ''}
                          onChange={(event) =>
                            setPaymentConfig((current) => ({
                              ...current,
                              [method]: {
                                amount: current[method]?.amount || '',
                                installments: current[method]?.installments || '',
                                installmentAmount: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                <Input
                  placeholder={`Ex.: parcelas, chave pix, observações de ${option?.label?.toLowerCase()}`}
                  value={paymentDetails[method] || ''}
                  onChange={(event) =>
                    setPaymentDetails((current) => ({
                      ...current,
                      [method]: event.target.value,
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
