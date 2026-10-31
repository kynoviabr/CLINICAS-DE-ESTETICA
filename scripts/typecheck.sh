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
