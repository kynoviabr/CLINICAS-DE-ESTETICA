// Modelos de anamnese por categoria de tratamento (usados em Configurações e na implantação).

export type TreatmentCategory = {
  id: string;
  name: string;
  description?: string | null;
};

/** Pergunta da anamnese do tratamento: Sim/Não (com detalhe quando "Sim") ou resposta livre. */
export type TemplateQuestion = {
  text: string;
  type: 'yes_no' | 'text';
};

export type AnamneseTemplate = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  active: boolean;
  basic_questions: string[];
  /** Texto das perguntas (formato antigo; mantido em sincronia com `questions`). */
  specific_questions: string[];
  /** Perguntas com tipo. Modelos antigos não têm: use `templateQuestions()`. */
  questions?: TemplateQuestion[];
  /** Texto de ciência dos riscos que a paciente confirma ao responder. */
  risk_terms?: string;
  notes: string;
};

/** Resposta de uma pergunta do tratamento. */
export type TreatmentAnswer = { value: boolean | null; detail: string } | string;


export const ANAMNESE_TEMPLATES_KEY = 'anamnese_templates';

export const BASIC_HEALTH_QUESTIONS = [
  'Possui alergias? Se sim, quais?',
  'Possui doença crônica ou condição de saúde relevante?',
  'Faz uso contínuo de medicamentos?',
  'Usa suplementos, hormônios ou fitoterápicos?',
  'Já realizou cirurgias ou procedimentos recentes?',
  'Está gestante ou amamentando?',
  'Possui marca-passo, implantes metálicos ou próteses?',
  'Teve reação adversa a anestésicos, cosméticos, ácidos ou procedimentos estéticos?',
  'Possui histórico de queloide, cicatrização difícil ou infecções recorrentes?',
  'Qual é o principal objetivo com o tratamento?',
];

export function questionsForCategory(categoryName: string) {
  const normalized = categoryName.toLowerCase();
  if (normalized.includes('emagrec') || normalized.includes('nutri')) {
    return [
      'Qual peso atual, altura e objetivo de peso ou medidas?',
      'Há histórico de efeito sanfona, compulsão alimentar ou transtorno alimentar?',
      'Como é a rotina alimentar durante semana e fim de semana?',
      'Qual frequência de atividade física?',
      'Há alteração hormonal, tireoide, resistência à insulina ou uso de medicação para emagrecimento?',
      'Quais regiões ou medidas mais incomodam?',
      'Como está sono, ingestão de água e funcionamento intestinal?',
    ];
  }
  if (normalized.includes('facial') || normalized.includes('rejuven')) {
    return [
      'Qual é a principal queixa facial: manchas, acne, flacidez, rugas, textura ou poros?',
      'Qual rotina atual de skincare e uso de protetor solar?',
      'Usa ácidos, retinoides, clareadores ou medicações dermatológicas?',
      'Teve exposição solar intensa nos últimos 15 dias?',
      'Possui rosácea, melasma, dermatite, acne ativa ou sensibilidade cutânea?',
      'Já realizou procedimentos faciais anteriores? Quando e quais?',
      'Qual expectativa de resultado e prazo desejado?',
    ];
  }
  if (normalized.includes('sobrancel') || normalized.includes('cílio') || normalized.includes('cilio') || normalized.includes('micropigment')) {
    return [
      'Tem alergia a henna, tintas, pigmentos, cola ou esmalte?',
      'Usa lentes de contato ou tem irritação, conjuntivite ou cirurgia recente nos olhos?',
      'Já fez micropigmentação, extensão ou lifting antes? Teve alguma reação?',
      'Usa ácidos, retinoides ou isotretinoína na região?',
      'Tem queloide, herpes labial recorrente ou cicatrização difícil?',
      'Qual resultado espera (formato, cor, volume, curvatura)?',
      'Consegue seguir os cuidados pós (não molhar, não coçar, retorno de retoque)?',
    ];
  }
  if (normalized.includes('corporal') || normalized.includes('gordura') || normalized.includes('celulite') || normalized.includes('flacidez') || normalized.includes('massag') || normalized.includes('drenag')) {
    return [
      'Quais áreas corporais serão tratadas?',
      'Possui varizes, alterações circulatórias, linfedema ou retenção de líquidos?',
      'Há dor, sensibilidade, flacidez, celulite ou gordura localizada na região?',
      'Já realizou tratamentos corporais anteriores? Quais e quando?',
      'Há alteração recente de peso ou medidas?',
      'Pratica atividade física e segue plano alimentar?',
      'Possui contraindicação para calor, frio, pressão ou estímulos mecânicos?',
    ];
  }
  if (normalized.includes('injet')) {
    return [
      'Possui alergia conhecida a anestésicos, medicamentos ou substâncias injetáveis?',
      'Usa anticoagulantes, anti-inflamatórios ou medicação que aumente risco de sangramento?',
      'Possui doença autoimune, infecção ativa ou imunossupressão?',
      'Teve preenchimento, toxina botulínica, bioestimulador ou injetável recente?',
      'Há histórico de herpes, queloide, nódulos, assimetrias ou reações tardias?',
      'Qual área será tratada e qual resultado espera?',
      'Foi orientado sobre riscos, cuidados pós-procedimento e tempo de recuperação?',
    ];
  }
  if (normalized.includes('peeling')) {
    return [
      'Qual fototipo, sensibilidade e histórico de manchas?',
      'Usa ácidos, retinoides, isotretinoína ou clareadores?',
      'Teve exposição solar recente ou bronzeamento artificial?',
      'Possui herpes, feridas, dermatite, rosácea intensa ou acne inflamada?',
      'Já fez peeling antes? Qual tipo e qual reação teve?',
      'Consegue cumprir fotoproteção e cuidados pós-peeling?',
      'Qual objetivo principal: manchas, acne, textura, poros ou rejuvenescimento?',
    ];
  }
  if (normalized.includes('laser') || normalized.includes('tecnolog')) {
    return [
      'Qual equipamento ou tecnologia será utilizada?',
      'Possui marca-passo, implantes metálicos, próteses ou dispositivos eletrônicos implantados?',
      'Teve exposição solar ou bronzeamento recente?',
      'Usa medicação fotossensibilizante ou isotretinoína?',
      'Possui alterações de sensibilidade, cicatrização ou histórico de queimadura?',
      'Qual área será tratada e qual objetivo principal?',
      'Foi orientado sobre preparo, intervalos e cuidados pós-procedimento?',
    ];
  }
  if (normalized.includes('capilar') || normalized.includes('tricologia')) {
    return [
      'Há quanto tempo percebe queda, afinamento ou falhas capilares?',
      'Existe histórico familiar de alopecia?',
      'Teve estresse, cirurgia, parto, dieta restritiva ou doença recente?',
      'Usa medicações, vitaminas ou tratamentos tópicos para cabelo?',
      'Possui descamação, coceira, oleosidade excessiva ou dor no couro cabeludo?',
      'Já realizou exames laboratoriais recentes?',
      'Qual frequência de lavagem e quais produtos utiliza?',
    ];
  }
  return [
    'Qual região ou queixa principal será tratada?',
    'Já realizou esse tipo de tratamento antes?',
    'Houve intercorrência ou reação em tratamentos anteriores?',
    'Quais resultados espera e em qual prazo?',
    'Existe alguma limitação de rotina para seguir cuidados pós-procedimento?',
    'Foi orientado sobre riscos, contraindicações e cuidados necessários?',
  ];
}

// Perguntas que começam assim são de Sim/Não ("Possui...?", "Usa...?"); as demais pedem resposta livre.
const YES_NO_START = /^(possui|tem|usa|teve|há|ha|já|ja|está|esta|foi|consegue|existe|fuma|pratica|faz)\b/i;

/** Tipo sugerido para uma pergunta escrita em texto. */
export function guessQuestionType(text: string): TemplateQuestion['type'] {
  return YES_NO_START.test(text.trim()) ? 'yes_no' : 'text';
}

/** Perguntas do modelo com tipo (converte modelos antigos, que só tinham o texto). */
export function templateQuestions(template: Pick<AnamneseTemplate, 'questions' | 'specific_questions'>): TemplateQuestion[] {
  if (Array.isArray(template.questions) && template.questions.length > 0) {
    return template.questions.filter((q) => q && typeof q.text === 'string' && q.text.trim());
  }
  return (template.specific_questions || []).filter(Boolean).map((text) => ({ text, type: guessQuestionType(text) }));
}

/** Texto padrão de ciência de riscos de uma categoria. */
type RiskInfo = { como: string; riscos: string; contra: string; antes: string; depois: string };

// Informações de riscos por tipo de tratamento (padrão; a clínica pode reescrever em Configurações > Anamnese).
const RISKS: Array<{ match: string[]; info: RiskInfo }> = [
  { match: ['injet'], info: {
    como: 'Aplicação de produtos (como toxina botulínica, preenchedores com ácido hialurônico ou bioestimuladores) com agulha ou cânula, em pontos definidos pela profissional.',
    riscos: 'Dor, inchaço, vermelhidão e hematomas (manchas roxas) no local; assimetria; nódulos; resultado diferente do esperado. Raramente: alergia, infecção, necrose de pele ou alteração visual por obstrução de vaso, que exigem atendimento imediato.',
    contra: 'Gravidez e amamentação; infecção ou ferida no local; doenças neuromusculares; doenças autoimunes ativas; alergia a algum componente; uso de anticoagulantes sem liberação médica.',
    antes: 'Evitar álcool, anti-inflamatórios e suplementos que afinam o sangue (ômega 3, ginkgo) por 2 a 3 dias, se não houver orientação médica em contrário. Avisar sobre medicamentos e procedimentos recentes.',
    depois: 'Não massagear nem deitar sobre a área nas primeiras horas; evitar exercícios intensos, calor, sauna e álcool por 24 horas. Procurar a clínica imediatamente em caso de dor forte, pele pálida ou arroxeada ou alteração na visão.',
  } },
  { match: ['laser', 'tecnolog', 'luz pulsada', 'radiofrequ', 'ultrassom', 'criolip'], info: {
    como: 'Uso de equipamentos (laser, luz pulsada, radiofrequência, ultrassom, criolipólise e similares) que agem com luz, calor ou frio na pele e nos tecidos.',
    riscos: 'Vermelhidão, inchaço, ardor e sensibilidade; manchas escuras ou claras; bolhas ou queimaduras; crostas. Na criolipólise, dormência temporária e, raramente, aumento da gordura no local.',
    contra: 'Gravidez; pele bronzeada ou exposição recente ao sol; uso de isotretinoína (Roacutan) nos últimos 6 meses; marcapasso ou implantes metálicos na área (conforme o equipamento); câncer de pele, lesões ou infecção no local; doenças de fotossensibilidade.',
    antes: 'Não tomar sol nem usar autobronzeador por 15 a 30 dias; suspender ácidos na região conforme orientação; avisar sobre medicamentos que causam sensibilidade à luz.',
    depois: 'Protetor solar FPS 50 todos os dias e evitar sol; não esfregar nem arrancar crostas; hidratar a pele; evitar calor intenso nas primeiras 48 horas.',
  } },
  { match: ['peeling'], info: {
    como: 'Aplicação de ácidos ou técnicas de esfoliação que removem camadas superficiais da pele para renovar textura, manchas e acne.',
    riscos: 'Ardor, vermelhidão e descamação; sensibilidade; manchas escuras (principalmente com exposição ao sol); irritação ou alergia; em peelings mais profundos, crostas e risco de cicatriz.',
    contra: 'Gravidez e amamentação (para alguns ácidos); uso de isotretinoína nos últimos 6 meses; herpes ativo, feridas ou infecção no local; pele bronzeada; alergia a componentes.',
    antes: 'Suspender ácidos, esfoliantes e depilação na área por 3 a 7 dias; evitar sol; avisar se tem histórico de herpes ou manchas.',
    depois: 'Protetor solar FPS 50 e chapéu; não arrancar a pele que descama; usar só os produtos indicados pela profissional; evitar maquiagem, sauna e piscina nos primeiros dias.',
  } },
  { match: ['facial', 'rejuven', 'limpeza'], info: {
    como: 'Procedimentos na pele do rosto (limpeza, hidratação, microagulhamento, protocolos de rejuvenescimento) com produtos e técnicas definidos pela profissional.',
    riscos: 'Vermelhidão, sensibilidade e pequenas lesões temporárias; acne ou irritação após o procedimento; alergia a produtos; manchas com exposição ao sol.',
    contra: 'Lesões, herpes ou infecção ativa na pele; uso recente de isotretinoína (para microagulhamento); alergia conhecida a cosméticos; pele muito sensibilizada ou queimada de sol.',
    antes: 'Evitar ácidos e esfoliantes por 3 dias; não tomar sol; chegar sem maquiagem, se possível.',
    depois: 'Protetor solar diário; evitar maquiagem por 12 a 24 horas (ou conforme orientação); não espremer cravos e espinhas; manter a pele hidratada.',
  } },
  { match: ['corporal', 'gordura', 'celulite', 'flacidez', 'drenag', 'massag', 'modela'], info: {
    como: 'Protocolos para o corpo (massagens, drenagem, tecnologias, enzimas, protocolos para gordura, celulite e flacidez) feitos em sessões.',
    riscos: 'Dor ou sensibilidade, vermelhidão e hematomas leves; inchaço temporário; irritação na pele; resultados que variam de pessoa para pessoa e dependem de hábitos.',
    contra: 'Gravidez; trombose ou problemas de circulação graves; feridas ou infecção na área; câncer em tratamento; marcapasso ou metais na área (para algumas tecnologias); alergia a produtos aplicados.',
    antes: 'Beber água e manter uma alimentação equilibrada; avisar sobre cirurgias recentes, varizes e medicamentos.',
    depois: 'Beber bastante água; manter atividade física e alimentação orientadas; seguir os intervalos entre sessões indicados.',
  } },
  { match: ['emagrec', 'nutri'], info: {
    como: 'Acompanhamento e protocolos para emagrecimento e reeducação alimentar, que podem incluir orientação nutricional, procedimentos e, quando houver prescrição, medicamentos.',
    riscos: 'Mudanças no apetite e no intestino; cansaço ou tontura no início; efeitos colaterais de medicamentos, quando usados; perda de peso diferente da esperada.',
    contra: 'Gravidez e amamentação; transtornos alimentares; doenças que exijam acompanhamento médico específico sem liberação; uso de medicamentos sem prescrição.',
    antes: 'Informar doenças, exames recentes e todos os medicamentos e suplementos que usa.',
    depois: 'Seguir o plano alimentar e as orientações; avisar a clínica sobre qualquer mal-estar; não usar medicamentos por conta própria.',
  } },
  { match: ['sobrancel', 'cílio', 'cilio', 'micropigment'], info: {
    como: 'Procedimentos nas sobrancelhas e nos cílios (design, henna, micropigmentação, extensão ou lifting) com pigmentos, colas ou produtos específicos.',
    riscos: 'Vermelhidão, inchaço e sensibilidade; alergia a pigmentos, colas ou produtos; irritação nos olhos; cor ou formato diferente do esperado; na micropigmentação, risco de infecção e necessidade de retoque.',
    contra: 'Gravidez (para micropigmentação); infecção, irritação ou lesão nos olhos ou na pele da área; alergia conhecida a tintas ou colas; uso de isotretinoína (para micropigmentação).',
    antes: 'Não usar maquiagem nem lentes de contato no dia; avisar sobre alergias e procedimentos anteriores na área.',
    depois: 'Não molhar, coçar nem esfregar a área pelo tempo indicado; evitar sol, piscina e sauna; usar só os produtos orientados.',
  } },
  { match: ['capilar', 'tricolog'], info: {
    como: 'Tratamentos para o couro cabeludo e os fios (tricologia, terapias tópicas, microagulhamento, aplicação de ativos) feitos em sessões.',
    riscos: 'Sensibilidade, coceira ou vermelhidão no couro cabeludo; descamação; alergia a ativos; queda temporária dos fios no início de alguns protocolos.',
    contra: 'Feridas ou infecção no couro cabeludo; alergia a componentes; gravidez (para alguns ativos); doenças que exigem avaliação médica.',
    antes: 'Lavar o cabelo conforme orientação; avisar sobre química recente (coloração, alisamento) e medicamentos.',
    depois: 'Não lavar nem usar química pelo tempo indicado; seguir os produtos de uso em casa orientados.',
  } },
];

const GENERIC: RiskInfo = {
  como: 'Procedimento estético realizado pela profissional conforme avaliação e plano de tratamento.',
  riscos: 'Vermelhidão, inchaço, sensibilidade e desconforto temporários; alergia a produtos; resultado que varia de pessoa para pessoa.',
  contra: 'Gravidez e amamentação (conforme o procedimento); lesões ou infecção na área; alergia a componentes; doenças que exijam liberação médica.',
  antes: 'Informar doenças, alergias, medicamentos e procedimentos recentes.',
  depois: 'Seguir as orientações da profissional e procurar a clínica em caso de qualquer reação diferente do esperado.',
};

export function defaultRiskTerms(categoryName: string) {
  const n = (categoryName || '').toLowerCase();
  const info = RISKS.find((r) => r.match.some((m) => n.includes(m)))?.info || GENERIC;
  return [
    `Como funciona: ${info.como}`,
    `Riscos e efeitos possíveis: ${info.riscos}`,
    `Contraindicações: ${info.contra}`,
    `Cuidados antes: ${info.antes}`,
    `Cuidados depois: ${info.depois}`,
    `Declaro que li estas informações sobre ${categoryName}, que pude tirar minhas dúvidas com a profissional e que estou ciente dos riscos.`,
  ].join('\n\n');
}

/** Texto de riscos do modelo (ou o padrão da categoria). */
export function templateRiskTerms(template: Pick<AnamneseTemplate, 'risk_terms' | 'category_name'>) {
  return template.risk_terms?.trim() || defaultRiskTerms(template.category_name);
}

export function buildAnamneseTemplate(category: TreatmentCategory): AnamneseTemplate {
  const specific = questionsForCategory(category.name);
  return {
    id: `template-${category.id}`,
    name: `Anamnese ${category.name}`,
    category_id: category.id,
    category_name: category.name,
    active: true,
    basic_questions: BASIC_HEALTH_QUESTIONS,
    specific_questions: specific,
    questions: specific.map((text) => ({ text, type: guessQuestionType(text) })),
    risk_terms: defaultRiskTerms(category.name),
    notes: 'Dados básicos de saúde são comuns; perguntas específicas devem ser revisadas conforme o protocolo e profissional responsável.',
  };
}

/** A resposta está preenchida? (Sim/Não precisa de escolha; texto precisa de conteúdo.) */
export function isAnswered(question: TemplateQuestion, answer: TreatmentAnswer | undefined) {
  if (question.type === 'yes_no') return typeof answer === 'object' && answer !== null && answer.value !== null;
  return typeof answer === 'string' && answer.trim().length > 0;
}

/** Parte da área no form_data da anamnese: modelo usado e respostas por pergunta. */
export function buildAreaSection(template: AnamneseTemplate | null, answers: Record<string, string>) {
  if (!template) return {};
  return {
    template_id: template.id,
    template: { name: template.name, category: template.category_name },
    area_questions: Object.fromEntries(template.specific_questions.map((q) => [q, (answers[q] || '').trim()])),
  };
}

/** form_data de uma anamnese de tratamento (mesmo formato que o banco grava no envio por link). */
export function buildTreatmentFormData(
  template: AnamneseTemplate,
  answers: Record<string, TreatmentAnswer>,
  consent: { signature_name?: string; signature_date?: string },
) {
  return {
    template: { name: template.name, category: template.category_name },
    treatment_answers: answers,
    risk: { terms: templateRiskTerms(template), acknowledged: true },
    consent: { signature_name: consent.signature_name || null, signature_date: consent.signature_date || null },
  };
}

/** Perguntas Sim/Não do modelo ainda sem resposta. */
export function unansweredQuestions(template: AnamneseTemplate, answers: Record<string, TreatmentAnswer> | undefined) {
  return templateQuestions(template).filter((q) => q.type === 'yes_no' && !isAnswered(q, answers?.[q.text]));
}
