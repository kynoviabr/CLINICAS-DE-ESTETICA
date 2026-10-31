# Backup do banco

O workflow `.github/workflows/backup.yml` roda a cada 4 horas (e manualmente em Actions → "Backup do banco" → Run workflow). Ele gera um arquivo `clinova-<data>.tar.gz.gpg` na pasta "Backups Clinova" do Google Drive e apaga os arquivos com mais de 30 dias.

Cada arquivo contém:

- `public.dump`: schema e dados do app (formato custom do `pg_dump`).
- `auth-storage.dump`: usuários (`auth.users`, `auth.identities`) e metadados dos arquivos (`storage.objects`).

Os arquivos enviados ao Storage (fotos, PDFs, logos) não estão neste backup.

## Restaurar

1. Baixe o arquivo do Drive e abra:

```bash
gpg -d clinova-<data>.tar.gz.gpg > clinova.tar.gz     # pede a BACKUP_PASSPHRASE
mkdir restore && tar -xzf clinova.tar.gz -C restore
```

2. Num projeto Supabase novo, aplique a estrutura pelas migrations (inclui policies de Storage):

```bash
supabase link --project-ref <novo-ref>
supabase db push
```

3. Restaure só os dados, usuários primeiro:

```bash
export PGOPTIONS="-c session_replication_role=replica"   # evita triggers e checagens de FK durante a carga
pg_restore --data-only --no-owner -d "$DB_URL" restore/auth-storage.dump
pg_restore --data-only --no-owner -d "$DB_URL" restore/public.dump
```

`$DB_URL` é a URI do pooler (session mode) do projeto novo, com a senha do banco.
