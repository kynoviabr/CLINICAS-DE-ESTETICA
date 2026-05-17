import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export type PaymentCondition = 'cash' | 'installments';
export type PaymentMethod = 'cash' | 'pix' | 'card' | 'boleto';
export type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'cabal' | 'diners' | 'outro';
export type PaymentConfig = Partial<Record<PaymentMethod, { amount: string; installments?: string; installmentAmount?: string; brand?: CardBrand; last4?: string }>>;

export const paymentConditionLabels: Record<PaymentCondition, string> = {
  cash: 'À vista',
  installments: 'Parcelado',
};

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão' },
  { value: 'boleto', label: 'Boleto' },
];

export const cardBrandOptions: Array<{ value: CardBrand; label: string }> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'Amex' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'cabal', label: 'Cabal' },
  { value: 'diners', label: 'Diners' },
  { value: 'outro', label: 'Outro' },
];

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
          <Label>Formas de pagamento (até 2)</Label>
          <span className="text-xs text-muted-foreground">{selectedPaymentMethods.length}/2</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {paymentMethodOptions.map((option) => {
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
            const option = paymentMethodOptions.find((item) => item.value === method);
            const isInstallmentMethod = method === 'card' || method === 'boleto';
            return (
              <div key={method} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{option?.label}</Label>
                <div className={`grid gap-2 ${isInstallmentMethod ? 'grid-cols-3' : 'grid-cols-1'}`}>
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
                  {isInstallmentMethod ? (
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
                        <p className="text-[11px] text-muted-foreground">Valor da parcela</p>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Valor da parcela"
                          value={paymentConfig[method]?.installmentAmount || ''}
                          onChange={(event) =>
                            setPaymentConfig((current) => ({
                              ...current,
                              [method]: {
                                amount: current[method]?.amount || '',
                                installments: current[method]?.installments || '',
                                installmentAmount: event.target.value,
                                brand: current[method]?.brand,
                                last4: current[method]?.last4,
                              },
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                {method === 'card' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Bandeira</p>
                      <Select
                        value={paymentConfig.card?.brand || ''}
                        onValueChange={(value) =>
                          setPaymentConfig((current) => ({
                            ...current,
                            card: {
                              amount: current.card?.amount || '',
                              installments: current.card?.installments || '',
                              installmentAmount: current.card?.installmentAmount || '',
                              brand: value as CardBrand,
                              last4: current.card?.last4 || '',
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Bandeira" />
                        </SelectTrigger>
                        <SelectContent>
                          {cardBrandOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">4 últimos dígitos</p>
                      <Input
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="1234"
                        value={paymentConfig.card?.last4 || ''}
                        onChange={(event) =>
                          setPaymentConfig((current) => ({
                            ...current,
                            card: {
                              amount: current.card?.amount || '',
                              installments: current.card?.installments || '',
                              installmentAmount: current.card?.installmentAmount || '',
                              brand: current.card?.brand,
                              last4: event.target.value.replace(/\D/g, '').slice(0, 4),
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
                <Input
                  placeholder={`Ex.: parcelas, chave pix, bandeira, observações de ${option?.label?.toLowerCase()}`}
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
