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
- Antecedência mínima para remarcar ou cancelar sem perder o sinal (padrão: 24 h).
- Validade do crédito depois de remarcar ou cancelar no prazo (padrão: 90 dias).
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
- No mesmo passo, campo opcional **"Quem pagou"** (vem com o nome da cliente; muda se foi outra pessoa, ex.: a mãe).
- O sistema gera o **recibo** e oferece **Enviar recibo pelo WhatsApp** (ver "Recibo do sinal").
- **Prazo vencido sem pagamento**: aviso no **Meu dia** ("Sinal não pago: Ana, amanhã 14h") com
  **Cobrar de novo** / **Liberar horário**. Não libera sozinho na versão 1.

### 5. Abatimento, falta e Financeiro
- Ao gerar proposta, contrato ou cobrar sessão avulsa: *"Sinal pago R$ 100: abater?"* (já marcado). Entra como
  parcela de entrada **já paga**.
- Atendimento marcado como **Faltou** → crédito vira **Sinal retido**; no DRE aparece como receita própria.
- Financeiro: o sinal conta como recebido no dia em que foi pago.

## Recibo do sinal

Gerado ao confirmar o recebimento. Vai para quem pagou pelo WhatsApp (PDF anexado + link) e fica disponível no
mesmo link do Pix, que passa a mostrar "Sinal confirmado" e **Baixar recibo**. Também fica na ficha da cliente.

- **Número**: sequencial por clínica, ex.: `RS-2026-0001`.
- **Papel timbrado** da clínica (o mesmo das propostas e contratos: logo, razão social, CNPJ/CPF, endereço,
  telefone).
- **Valor por extenso** junto do número.
- Sem assinatura manuscrita: "Emitido eletronicamente", com quem confirmou e quando.

### Texto do recibo

Os campos entre chaves vêm do sistema. Os prazos são os da configuração da clínica.

> **RECIBO DE SINAL Nº {numero}**
>
> **{razão social da clínica}**, inscrita no {CNPJ/CPF} sob o nº {documento}, com endereço em {endereço},
> declara que recebeu de **{nome de quem pagou}**{, CPF {cpf}, se informado} a quantia de
> **R$ {valor} ({valor por extenso})**, paga via Pix em {data do pagamento}, a título de **sinal para garantia
> de reserva de horário**, conforme abaixo:
>
> - **Cliente atendida:** {nome da cliente}
> - **Atendimento reservado:** {avaliação | nome do procedimento}
> - **Data e horário:** {dia da semana}, {dd/mm/aaaa}, às {hh:mm}
> - **Profissional:** {nome da profissional}
>
> **Condições do sinal**, aceitas pela cliente em {data e hora do aceite}:
>
> 1. **Abatimento.** O valor deste sinal será integralmente abatido do valor do atendimento reservado ou do
>    tratamento contratado a partir dele. O sinal não é uma cobrança a mais.
> 2. **Comparecimento.** Comparecendo no horário reservado, o sinal é usado conforme o item 1.
> 3. **Remarcação ou cancelamento com antecedência.** Avisando a clínica com pelo menos {24} horas de
>    antecedência, a cliente pode remarcar o atendimento. O sinal fica como crédito para o novo horário,
>    válido por {90} dias.
> 4. **Falta ou cancelamento fora do prazo.** Não comparecendo, ou cancelando com menos de {24} horas de
>    antecedência, o sinal não será devolvido. Ele compensa a reserva do horário e da profissional, que deixou
>    de ser oferecido a outras clientes.
> 5. **Cancelamento pela clínica.** Se a clínica cancelar ou não puder realizar o atendimento, a cliente escolhe
>    entre remarcar, mantendo o crédito, ou receber o valor de volta integralmente.
> 6. **Contraindicação.** Se, na avaliação, a profissional indicar que o procedimento não é recomendado para a
>    cliente, o sinal será devolvido integralmente ou mantido como crédito para outro tratamento, à escolha da
>    cliente.
> 7. **Natureza do sinal.** O pagamento do sinal não obriga a cliente a contratar outros tratamentos além do
>    atendimento reservado.
>
> Este sinal tem natureza de arras confirmatórias, nos termos dos arts. 417 e 418 do Código Civil.
>
> {cidade}, {data de emissão}.
>
> *Recibo emitido eletronicamente por {clínica}, confirmado por {nome de quem confirmou} em {data e hora}.*
> *Dúvidas: {WhatsApp da clínica}.*

### Mensagem do WhatsApp (com o PDF anexado)

> Olá, {primeiro nome}! Recebemos seu sinal de R$ {valor} 💚
> Seu horário está **confirmado**: {dia da semana}, {dd/mm}, às {hh:mm}, {avaliação | procedimento}.
>
> Segue o recibo. O valor será abatido do seu atendimento. Se precisar remarcar, avise com pelo menos
> {24} horas de antecedência e o sinal fica como crédito para o novo horário.
>
> Até lá!

### Por que o texto é justo para os dois lados

- **Para a clínica**: a falta sem aviso não fica no prejuízo; o horário reservado tem valor e a regra foi
  aceita antes do pagamento.
- **Para a cliente**: o sinal não é um custo extra (é abatido), quem avisa a tempo não perde nada, e ela fica
  protegida quando o problema não é dela (a clínica cancelou ou o procedimento não é indicado).
- O item 5 segue a regra do Código Civil de que quem recebeu o sinal e não cumpriu devolve o valor. Na versão
  1 a devolução é simples, sem o valor em dobro. Esta escolha deve ser confirmada com o advogado da clínica.

> **Antes de publicar**: pedir a um advogado que revise o texto padrão. Cada clínica pode ajustar os prazos (e,
> se quiser, o texto) em Configurações › Pagamentos.

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
  aceite da política (jsonb), pago em / confirmado por, **quem pagou** (nome, CPF opcional),
  **número e PDF do recibo**, abatido em (contrato/proposta/parcela), observação.
- Numeração do recibo: sequência por clínica (mesmo padrão do número das propostas).
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

- Versão 1: 3 a 4 dias (+1 dia com o recibo em PDF).
- Agendamento online com sinal: +1 a 2 dias.
