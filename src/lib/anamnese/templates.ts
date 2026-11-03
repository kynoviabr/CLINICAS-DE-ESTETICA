// Modelos de anamnese por categoria de tratamento (usados em Configurações e na implantação).

export type TreatmentCategory = {
  id: string;
  name: string;
  description?: string | null;
};

export type AnamneseTemplate = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  active: boolean;
  basic_questions: string[];
  specific_questions: string[];
  notes: string;
};


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
  if (normalized.includes('corporal') || normalized.includes('gordura')) {
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

export function buildAnamneseTemplate(category: TreatmentCategory): AnamneseTemplate {
  return {
    id: `template-${category.id}`,
    name: `Anamnese ${category.name}`,
    category_id: category.id,
    category_name: category.name,
    active: true,
    basic_questions: BASIC_HEALTH_QUESTIONS,
    specific_questions: questionsForCategory(category.name),
    notes: 'Dados básicos de saúde são comuns; perguntas específicas devem ser revisadas conforme o protocolo e profissional responsável.',
  };
}
