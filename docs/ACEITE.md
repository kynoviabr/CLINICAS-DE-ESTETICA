# Aceite eletrônico, PDF e impressão de documentos

Status: etapa 1 (Baixar PDF e Imprimir) implementada; etapas 2 a 6 pendentes.

Etapa 1, onde está:
- `src/lib/documents/output.ts`: PDF e impressão (quadro escondido no computador; PDF + menu de
  compartilhar no app do iPhone e no Safari do iPhone). `src/components/documents/DocumentOutputButtons.tsx`.
- Proposta (tela, venda nova e link da cliente), contrato (tela e link), anamnese (detalhe) e recibo do
  sinal (agendamento e link da cliente).
- `src/lib/contractPDF.ts`: corrigido o PDF em branco (o html2pdf copiava o "fora da tela" junto) e
  acrescentado "Página X de Y".
- Até a folha de assinatura (etapa 2), proposta, contrato e anamnese levam um quadro "assinado
  eletronicamente" no fim, com nome, data e código de integridade.

## Objetivo

Todo documento que a cliente precisa aceitar pode ser aceito de forma eletrônica, com prova guardada:
quem aceitou, quando, de onde, em qual aparelho e qual texto exato. Todo documento também pode ser
baixado em PDF e impresso, com uma folha de assinatura no fim.

Base legal: assinatura eletrônica simples (Lei 14.063/2020; MP 2.200-2/2001, art. 10, § 2º), válida
entre as partes que aceitam o meio. Não usa certificado ICP-Brasil.

## Documentos cobertos

| Documento | Quem aceita | Hoje | Passa a ter |
|---|---|---|---|
| Proposta | Cliente | Aceite pelo link com identidade, IP, aparelho, código de integridade e cópia | Folha de assinatura no PDF, aparelho legível, botões PDF e Imprimir padronizados |
| Contrato | Cliente | Assinatura pelo link, mesmas provas | Folha de assinatura no PDF, aparelho legível, botões padronizados |
| Anamnese (link) | Cliente | Nome, "concordo", IP, aparelho | Código de integridade, telefone de envio, folha no PDF, PDF e Imprimir |
| Anamnese na clínica | Cliente | Sem prova da cliente | Aceite pelo celular dela (link na hora) ou assinatura com o dedo no aparelho da clínica |
| Condições do sinal | Cliente | "Li e concordo", IP, aparelho | Código de integridade e telefone de envio |
| Recibo do sinal | Clínica emite, cliente dá ciência | PDF sem ciência | "Recebi e estou de acordo" opcional, PDF e Imprimir |
| Cadastro do lead | Lead | Consentimento, IP, aparelho | Código de integridade |
| Termos de consentimento (futuros) | Cliente | Não existem | Entram no mesmo mecanismo |

## Meios de aceite

### 1. "De acordo" pelo link (principal)

A clínica envia o link pelo WhatsApp. A cliente abre o documento inteiro, confirma a identidade
(data de nascimento ou três primeiros números do CPF, como já é feito na proposta e no contrato),
digita o nome completo e toca em **Li e estou de acordo**.

Provas registradas:

- nome digitado e qual dado conferiu a identidade;
- data e hora pelo relógio do servidor (não do celular), mostradas no horário de Brasília;
- IP de quem abriu (primeiro endereço de `x-forwarded-for`);
- aparelho: texto original (`user-agent`) e versão legível, por exemplo "iPhone · iOS 18 · Safari";
- telefone para o qual o link foi enviado;
- código de integridade SHA-256 do texto aceito e cópia desse texto;
- localização aproximada, só se a cliente permitir no navegador (opcional, nunca obrigatória).

Limitação: o Marco Civil recomenda guardar a porta lógica junto do IP. O Supabase não repassa a porta,
então guardamos só o IP.

### 2. "De acordo" respondido no WhatsApp (alternativa)

A clínica envia o documento (PDF ou texto) pelo canal da Aura com a instrução: "Responda DE ACORDO
para confirmar". A resposta chega pelo `aura-webhook`. O sistema liga a resposta ao documento
pendente daquele telefone e registra:

- telefone que respondeu, data e hora da mensagem e número da mensagem no WhatsApp;
- texto exato da resposta;
- código de integridade do documento enviado.

O WhatsApp não informa IP nem aparelho. Essa prova é mais fraca que a do link, e a tela e a folha de
assinatura dizem claramente qual meio foi usado. Só vale quando o documento foi enviado pelo canal
da Aura (envio manual pelo WhatsApp do celular não gera prova automática).

### 3. Na clínica

- **Link na hora:** a equipe mostra um QR Code; a cliente abre no próprio celular e aceita como no
  item 1 (prova mais forte).
- **Assinatura com o dedo:** no tablet ou celular da clínica, a cliente desenha a assinatura. Fica
  guardada a imagem, data e hora, aparelho da clínica e quem da equipe estava logado.

## Folha de assinatura

Última página de todo PDF de documento aceito:

- nome do documento, número e código de integridade;
- para cada aceite: nome, dado de identidade conferido, meio (link, WhatsApp ou presencial), data e
  hora de Brasília, IP, aparelho legível, telefone, localização se houver;
- código de verificação curto e o endereço onde a autenticidade pode ser conferida;
- frase: "Documento assinado eletronicamente nos termos da Lei 14.063/2020 e da MP 2.200-2/2001,
  art. 10, § 2º."

Documento ainda não aceito sai com a marca "Aguardando aceite" no lugar da folha.

## PDF e impressão

Todo documento tem os mesmos dois botões, na tela da clínica e na página pública da cliente:

- **Baixar PDF:** gera o PDF com a folha de assinatura.
- **Imprimir:** abre a impressão do documento já com a folha de assinatura.

Regras:

- Uma só função de PDF e impressão para todos os documentos (hoje cada tela faz do seu jeito:
  contrato e proposta imprimem, anamnese e recibo não).
- Layout de impressão A4, margens fixas, cabeçalho com dados da clínica, número de página.
- **No app do iPhone** a impressão do navegador não funciona dentro do app. Lá, "Imprimir" gera o PDF e
  abre a folha de compartilhar do iOS, que tem a opção Imprimir (AirPrint).

## Banco de dados

Uma tabela única para os aceites novos, sem apagar as atuais:

`document_acceptances`: id, clinic_id, patient_id, lead_id, document_kind (proposal, contract,
anamnese, deposit_policy, deposit_receipt, lead_signup, consent_term), document_id, method (link,
whatsapp, in_person_link, in_person_drawn), signer_name, verified_by, ip, user_agent, device_label,
phone, geo (jsonb, opcional), whatsapp_message_id, signature_image_path, document_hash, snapshot,
verification_code (único), staff_user_id, accepted_at.

- Leitura só para a equipe da clínica (RLS); escrita só por funções no servidor.
- Proposta e contrato continuam gravando nas tabelas atuais e também nesta, para a folha de
  assinatura e a conferência terem uma fonte só.
- Função pública `verify_document(code)`: devolve só o nome do documento, a data do aceite e se o código
  de integridade confere (sem dados pessoais).

## Ordem de entrega

1. Botões Baixar PDF e Imprimir padronizados em todos os documentos, com o caminho do iPhone.
2. Tabela de aceites, aparelho legível e folha de assinatura nos PDFs.
3. Anamnese, sinal, recibo e cadastro gravando o aceite completo.
4. Aceite na clínica (QR Code e assinatura com o dedo).
5. "De acordo" pelo WhatsApp da Aura.
6. Página de conferência de autenticidade.
