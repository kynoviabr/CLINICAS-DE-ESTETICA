#!/usr/bin/env bash
# Catraca de tipos: o número de erros do TypeScript só pode cair.
# Quando cair, atualize .typecheck-baseline com o novo número.
set -uo pipefail
cd "$(dirname "$0")/.."
baseline=$(cat .typecheck-baseline)
out=$(npx tsc -p tsconfig.app.json --noEmit 2>&1)
count=$(grep -c "error TS" <<<"$out" || true)
# Nome inexistente quebra a tela em produção: nunca é aceito.
if grep -E "error TS(2304|2552)" <<<"$out"; then
  echo "Há nomes não definidos (quebram a tela ao renderizar)."
  exit 1
fi
echo "erros de tipo: $count (limite: $baseline)"
if (( count > baseline )); then
  echo "Esta mudança adicionou erros de tipo:"
  grep "error TS" <<<"$out" | tail -n $((count - baseline))
  exit 1
fi
if (( count < baseline )); then
  echo "Menos erros que o limite: atualize .typecheck-baseline para $count."
fi

# Catraca do modo rigoroso (strict): o app inteiro é conferido; fora de src/pages não pode haver erro,
# e em src/pages o número só pode cair (atualize .typecheck-strict-baseline quando cair).
strict_baseline=$(cat .typecheck-strict-baseline)
strict_out=$(npx tsc -p tsconfig.strict.json 2>&1)
strict_count=$(grep -c "error TS" <<<"$strict_out" || true)
outside=$(grep "error TS" <<<"$strict_out" | grep -v "^src/pages/" || true)
if [ -n "$outside" ]; then
  echo "Modo rigoroso: erros fora de src/pages (lá já está limpo):"
  echo "$outside"
  exit 1
fi
echo "modo rigoroso: $strict_count erros em src/pages (limite: $strict_baseline)"
if (( strict_count > strict_baseline )); then
  echo "Esta mudança adicionou erros no modo rigoroso:"
  grep "error TS" <<<"$strict_out" | tail -n $((strict_count - strict_baseline))
  exit 1
fi
if (( strict_count < strict_baseline )); then
  echo "Menos erros que o limite: atualize .typecheck-strict-baseline para $strict_count."
fi
