# Sinal para garantir o horário (Pix)

Status: **especificado, não implementado** (decidido em 22/11/2026).

A clínica pode cobrar um valor simbólico para garantir um horário: avaliação ou procedimento, de lead ou de
cliente antiga. A cliente paga por Pix (QR Code ou "copia e cola"). O valor é abatido do tratamento; se ela
faltar, não é devolvido.

## Decisões

| Pergunta | Decisão |
|---|---|
| Chave Pix | **Uma por clínica** |
| Confirmação do pagamento | **Manual na versão 1** (a Dra vê no banco e toca em "Recebi o sinal") |
| Quem paga sinal | **Todos**: lead, avaliação, cliente antiga, procedimento avulso |
| Onde se cobra | **Agenda manual** (a clínica marca o horário), com a pergunta "Cobrar sinal? Sim/Não" |
| Agendamento online | **Depois**, reaproveitando a versão 1 |

## Ideia central: o sinal é um crédito da cliente

- **Pagou** → a cliente tem R$ X de crédito na clínica.
- **Veio** → o crédito é **abatido** da proposta, do contrato ou da sessão avulsa (entra como entrada já paga).
- **Faltou** → o crédito vira **sinal retido** (receita da clínica).
- **Remarcou** → o crédito acompanha o novo horário.
- **Cancelou** → a Dra escolhe: manter o crédito (padrão), reter ou devolver (o Pix de volta é feito no banco; o
  sistema só registra).

Assim o dinheiro nunca some nem é contado duas vezes.

## Versão 1

### 1. Configuração (Configurações › Pagamentos), uma vez
- Chave Pix, nome e cidade do recebedor (vão dentro do código Pix).
- Valor padrão do sinal: um para avaliação e outro para procedimento (fixo em R$).
- Prazo para pagar (ex.: 24 h).
- Texto da política, com sugestão pronta:
  *"O sinal é abatido do seu tratamento. Em caso de falta, ou cancelamento com menos de 24 h, ele não é devolvido."*
- "Cobrar sinal por padrão": Sim/Não (como a pergunta já vem marcada no agendamento).

### 2. No agendamento (agenda)
- Pergunta **"Cobrar sinal? Sim / Não"**, com o valor padrão preenchido e editável.
- Com Sim: o horário fica **"Aguardando sinal"** (cor própria na agenda) e aparece **Enviar pelo WhatsApp**
  (mensagem pronta + link).
- Em horário já marcado: botão **Cobrar sinal** no detalhe do agendamento.

### 3. Página da cliente (link público, sem login, uso único)
- Clínica, dia, horário, tratamento e valor do sinal.
- **QR Code** e botão **Copiar código Pix**.
- Política + caixa **"Li e concordo"** (gravada com data, hora, IP e navegador, como o consentimento do cadastro).
- Depois de pagar: "Pronto! A clínica confirma assim que o Pix cair."

### 4. Confirmação (manual)
- A Dra toca em **Recebi o sinal** → horário **Confirmado**; o valor entra no Financeiro como Pix, marcado "Sinal".
- **Prazo vencido sem pagamento**: aviso no **Meu dia** ("Sinal não pago: Ana, amanhã 14h") com
  **Cobrar de novo** / **Liberar horário**. Não libera sozinho na versão 1.

### 5. Abatimento, falta e Financeiro
- Ao gerar proposta, contrato ou cobrar sessão avulsa: *"Sinal pago R$ 100: abater?"* (já marcado). Entra como
  parcela de entrada **já paga**.
- Atendimento marcado como **Faltou** → crédito vira **Sinal retido**; no DRE aparece como receita própria.
- Financeiro: o sinal conta como recebido no dia em que foi pago.

## Pix sem custo (BR Code estático)

O código "copia e cola" segue o padrão EMV do Banco Central (BR Code): chave, nome, cidade, valor e um
identificador (txid) do agendamento, com CRC16 no final. O sistema monta o código e desenha o QR Code sem
banco, sem contrato e sem taxa. Limitação: o sistema não sabe sozinho que o dinheiro caiu, por isso a
confirmação é manual.

O dinheiro vai direto para a conta da clínica; o sistema nunca toca nele.

## Modelo de dados (proposta)

- `clinic_settings`: chave Pix, nome, cidade, valores padrão, prazo, texto da política, "cobrar por padrão".
- `appointment_deposits`: clínica, agendamento, cliente (lead ou paciente), valor, status
  (`aguardando` → `pago` → `abatido` | `retido` | `devolvido` | `cancelado`), prazo, token do link (hash),
  aceite da política (jsonb), pago em / por, abatido em (contrato/proposta/parcela), observação.
- Agendamento: status visual "Aguardando sinal" derivado do sinal em aberto.
- Página pública: RPCs `SECURITY DEFINER` por token (mesmo padrão do cadastro do lead e da anamnese).

## Cuidados

- **Política aceita antes do pagamento.** O CDC aceita reter o sinal na falta quando a regra foi informada antes
  e o valor é razoável; o aceite com data e hora é a prova.
- **Valor simbólico.** Sinal alto vira discussão.
- **LGPD**: a página mostra só o primeiro nome, o horário e o valor; nada de CPF ou dados de saúde.

## Depois da versão 1

1. **Agendamento online** (`/agendar`): a cliente escolhe o horário, o sistema segura o horário por alguns
   minutos e mostra o Pix na hora. A confirmação continua manual.
2. **Aura** enviando o link do sinal sozinha ao marcar pelo WhatsApp.
3. **Confirmação automática** por intermediário (Asaas, Mercado Pago, Efí, Inter…), com Pix dinâmico e aviso
   de pagamento. Tem taxa (~1%); vale quando o volume justificar.

## Estimativa

- Versão 1: 3 a 4 dias.
- Agendamento online com sinal: +1 a 2 dias.
