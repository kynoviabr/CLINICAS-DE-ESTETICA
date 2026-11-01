#!/bin/bash
# Cria (ou recria) os dados de teste na HOMOLOG do Clinova:
# 2 clínicas, 22 contas de equipe, 10 tratamentos e 10 clientes por clínica.
# Só funciona na homolog. A senha de teste é digitada aqui e não fica salva.
#
# Uso: bash scripts/seed-homolog/seed-homolog.sh
set -euo pipefail

HOMOLOG_REF="majqksguuwmjhuuwjltj"
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI não encontrado. Instale e faça 'supabase login' antes." >&2
  exit 1
fi

linked_ref="$(cat "$REPO_ROOT/supabase/.temp/project-ref" 2>/dev/null || true)"
if [ "$linked_ref" != "$HOMOLOG_REF" ]; then
  echo "Esta pasta não está ligada à homolog (ligada a: '${linked_ref:-nenhum}')." >&2
  echo "Rode antes: supabase link --project-ref $HOMOLOG_REF" >&2
  exit 1
fi

echo "Este script grava dados de teste SOMENTE na homolog ($HOMOLOG_REF)."
echo "Ele recria as clínicas 'Vive Estética (teste)' e 'Eras Estética (teste)'."
read -r -p "Digite HOMOLOG para continuar: " confirm
if [ "$confirm" != "HOMOLOG" ]; then
  echo "Cancelado."
  exit 1
fi

read -r -s -p "Senha de teste para todas as contas (mín. 8, com letra e número): " senha
echo
read -r -s -p "Repita a senha: " senha2
echo
if [ "$senha" != "$senha2" ]; then
  echo "As senhas não conferem." >&2
  exit 1
fi
if [ "${#senha}" -lt 8 ] || ! [[ "$senha" =~ [A-Za-z] ]] || ! [[ "$senha" =~ [0-9] ]]; then
  echo "A senha precisa ter pelo menos 8 caracteres, com letra e número." >&2
  exit 1
fi

senha_sql=$(printf '%s' "$senha" | sed "s/'/''/g")
unset senha senha2

tmp=$(mktemp)
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT

{
  printf "SELECT set_config('clinova_seed.senha', '%s', false) IS NOT NULL AS ok;\n" "$senha_sql"
  cat 01_equipe.sql 02_clinicas.sql
  echo "SELECT set_config('clinova_seed.senha', '', false) IS NOT NULL AS ok;"
  cat 03_resumo.sql
} > "$tmp"
unset senha_sql

echo "Gravando na homolog..."
supabase db query --linked --workdir "$REPO_ROOT" -f "$tmp"
echo "Pronto. A lista de contas está em scripts/seed-homolog/CONTAS.md"
