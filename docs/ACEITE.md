# Aceite eletrônico, PDF e impressão de documentos

Status: etapas 1 (Baixar PDF e Imprimir), 2 (registro dos aceites e folha de assinatura), 3 (anamnese, sinal, recibo e cadastro no registro), 4 (aceite na clínica), 5 (DE ACORDO pelo WhatsApp) e 6 (conferência de autenticidade) implementadas.

Etapa 1, onde está:
- `src/lib/documents/output.ts`: PDF e impressão (quadro escondido no computador; PDF + menu de
  compartilhar no app do iPhone e no Safari do iPhone). `src/components/documents/DocumentOutputButtons.tsx`.
- Proposta (tela, venda nova e link da cliente), contrato (tela e link), anamnese (detalhe) e recibo do
  sinal (agendamento e link da cliente).
- `src/lib/contractPDF.ts`: corrigido o PDF em branco (o html2pdf copiava o "fora da tela" junto) e
  acrescentado "Página X de Y".

Etapa 2, onde está:
- `supabase/migrations/20261224100000_registro_aceites.sql`: tabela `document_acceptances` com código
  de verificação; gatilhos copiam cada aceite de proposta e assinatura de contrato; `document_acceptance_sheet`
  entrega a folha a quem tem o link do documento.
- `src/lib/documents/signatureSheet.ts` (folha de assinatura, horário de Brasília com segundos),
  `src/lib/documents/device.ts` (aparelho legível) e `src/lib/documents/acceptances.ts` (leitura).
- Folha no fim de proposta, contrato, anamnese (a partir do registro do envio) e recibo do sinal
  (confirmação da clínica e aceite das condições pela cliente).

Etapa 3, onde está:
- `supabase/migrations/20261225100000_aceites_anamnese_sinal_cadastro.sql`: gatilhos copiam para o
  registro a anamnese respondida pelo link (identidade: data de nascimento), o "Li e concordo" do sinal e o
  consentimento do cadastro do lead, com código de integridade e telefone do cadastro; aceites antigos
  foram trazidos. `deposit_receipt_ack` grava o "Recebi e estou de acordo" do recibo (opcional, no link do
  recibo). `document_acceptance_sheet('deposit', token)` entrega condições e recibo à cliente.
- Folha da anamnese e do recibo passam a usar o registro (com código de verificação); sem registro, usam
  as provas antigas.
- O telefone guardado é o do cadastro da cliente: o sistema ainda não registra para qual número o link
  foi enviado.

Etapa 4, onde está:
- `supabase/migrations/20261226100000_aceite_presencial.sql`: links de proposta, contrato e anamnese
  ganham `in_person`; `mark_link_in_person` marca o link mostrado em QR Code e o aceite sai como
  "Na clínica, pelo celular da própria cliente". `sign_in_person` registra a assinatura desenhada no
  aparelho da clínica (nome conferido com o cadastro, documento conferido pela equipe, imagem, aparelho,
  equipe logada) e tem o mesmo efeito do aceite pelo link (proposta aceita, contrato assinado).
- A imagem da assinatura fica no próprio registro (`signature_image`, PNG em base64), e não no
  armazenamento de arquivos, para sair no PDF da clínica e no link da cliente sem acesso extra.
- `src/components/signing/SignaturePad.tsx` e `InPersonSignDialog.tsx`; botões "Assinar na clínica" no
  contrato, na proposta e na anamnese preenchida pela clínica; QR Code no envio do link da anamnese.

Etapa 5, onde está:
- `supabase/migrations/20261227100000_aceite_whatsapp.sql`: `whatsapp_acceptance_requests` guarda cada pedido
  (documento, código de integridade do que foi enviado, mensagem exata, código de 4 dígitos).
  `create_whatsapp_acceptance` cria o pedido e devolve a mensagem; o app envia pela função `whatsapp`
  (`send_text`). Um gatilho em `whatsapp_messages` reconhece a resposta ("DE ACORDO", "Estou de acordo",
  "Sim, de acordo 1234", "Concordo"; "Não estou de acordo" não conta) e registra o aceite com telefone,
  data e hora da mensagem, número da mensagem e texto exato (`document_acceptances.whatsapp_reply`).
- Regras: a conversa precisa ser do telefone do cadastro; só dá para enviar dentro da janela de 24h do
  WhatsApp (fora dela, a equipe manda antes um modelo aprovado); com o código, só vale o pedido daquele
  código; sem código, só quando há um único pedido aberto na conversa; se o documento mudou depois do
  envio, o aceite não é registrado e a equipe é avisada. Pedido vence em 15 dias.
- Vale para proposta e contrato (a cliente lê o documento inteiro pelo link antes de responder).
- `aura-webhook` responde à cliente confirmando o registro, com o código de verificação.
- Botão "Pedir DE ACORDO no WhatsApp" no contrato e na proposta (`WhatsappAcceptanceButton.tsx`).

Etapa 6, onde está:
- `supabase/migrations/20261228100000_conferir_documento.sql`: `verify_document(código, sha256 opcional)`,
  pública. Devolve só o nome do documento, a clínica, a data e o meio do aceite, as iniciais de quem aceitou
  e se o documento guardado hoje é o mesmo que foi aceito (recalcula o código de integridade). Se a pessoa
  colar o SHA-256 do PDF, diz se é igual ao do registro.
- Página pública `/verificar` e `/verificar/CÓDIGO` (`src/pages/PublicVerifyPage.tsx`). A folha de
  assinatura traz o endereço de conferência de cada aceite.
- O código de verificação tem 10 caracteres hexadecimais (cerca de um trilhão de combinações) e a
  página não mostra dados pessoais, então tentar códigos ao acaso não revela nada útil.

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
