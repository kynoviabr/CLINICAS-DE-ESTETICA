/** Conselhos profissionais (modelos). A clínica não precisa cadastrar antes: escolher no profissional já cria. */
export const CLASS_ENTITY_TEMPLATES = [
  { abbreviation: 'CRM', name: 'Conselho Regional de Medicina', linked_professionals: 'Médicos, dermatologistas, nutrólogos, endocrinologistas, cirurgiões plásticos e responsáveis técnicos médicos', description: 'Conselho profissional regional da medicina.' },
  { abbreviation: 'CFM', name: 'Conselho Federal de Medicina', linked_professionals: 'Órgão federal que regulamenta a medicina no Brasil', description: 'Órgão federal regulador da medicina.' },
  { abbreviation: 'CRBM', name: 'Conselho Regional de Biomedicina', linked_professionals: 'Biomédicos estetas, biomédicos habilitados em procedimentos estéticos', description: 'Conselho profissional regional da biomedicina.' },
  { abbreviation: 'CFBM', name: 'Conselho Federal de Biomedicina', linked_professionals: 'Órgão federal da biomedicina', description: 'Órgão federal regulador da biomedicina.' },
  { abbreviation: 'CREFITO', name: 'Conselho Regional de Fisioterapia e Terapia Ocupacional', linked_professionals: 'Fisioterapeutas dermato-funcionais, fisioterapeutas atuantes em estética corporal e reabilitação', description: 'Conselho regional de fisioterapia e terapia ocupacional.' },
  { abbreviation: 'COFFITO', name: 'Conselho Federal de Fisioterapia e Terapia Ocupacional', linked_professionals: 'Órgão federal da fisioterapia e terapia ocupacional', description: 'Órgão federal regulador da fisioterapia e terapia ocupacional.' },
  { abbreviation: 'COREN', name: 'Conselho Regional de Enfermagem', linked_professionals: 'Enfermeiros, técnicos e auxiliares de enfermagem', description: 'Conselho regional da enfermagem.' },
  { abbreviation: 'COFEN', name: 'Conselho Federal de Enfermagem', linked_professionals: 'Órgão federal da enfermagem', description: 'Órgão federal regulador da enfermagem.' },
  { abbreviation: 'CRO', name: 'Conselho Regional de Odontologia', linked_professionals: 'Cirurgiões-dentistas, harmonização orofacial, estética facial odontológica', description: 'Conselho regional da odontologia.' },
  { abbreviation: 'CFO', name: 'Conselho Federal de Odontologia', linked_professionals: 'Órgão federal da odontologia', description: 'Órgão federal regulador da odontologia.' },
  { abbreviation: 'CRN', name: 'Conselho Regional de Nutricionistas', linked_professionals: 'Nutricionistas, profissionais de emagrecimento, reeducação alimentar e acompanhamento nutricional', description: 'Conselho regional da nutrição.' },
  { abbreviation: 'CFN', name: 'Conselho Federal de Nutricionistas', linked_professionals: 'Órgão federal da nutrição', description: 'Órgão federal regulador da nutrição.' },
  { abbreviation: 'CRF', name: 'Conselho Regional de Farmácia', linked_professionals: 'Farmacêuticos estetas, farmacêuticos responsáveis por manipulação, cosméticos ou procedimentos permitidos', description: 'Conselho regional da farmácia.' },
  { abbreviation: 'CFF', name: 'Conselho Federal de Farmácia', linked_professionals: 'Órgão federal da farmácia', description: 'Órgão federal regulador da farmácia.' },
  { abbreviation: 'CREF', name: 'Conselho Regional de Educação Física', linked_professionals: 'Profissionais de educação física, personal trainers, acompanhamento físico e programas de emagrecimento', description: 'Conselho regional da educação física.' },
  { abbreviation: 'CONFEF', name: 'Conselho Federal de Educação Física', linked_professionals: 'Órgão federal da educação física', description: 'Órgão federal regulador da educação física.' },
  { abbreviation: 'CRP', name: 'Conselho Regional de Psicologia', linked_professionals: 'Psicólogos, apoio comportamental, compulsão alimentar, autoestima e acompanhamento emocional', description: 'Conselho regional da psicologia.' },
  { abbreviation: 'CFP', name: 'Conselho Federal de Psicologia', linked_professionals: 'Órgão federal da psicologia', description: 'Órgão federal regulador da psicologia.' },
  { abbreviation: 'CRA', name: 'Conselho Regional de Administração', linked_professionals: 'Administradores, gestores administrativos, consultores de gestão, quando registrados', description: 'Conselho regional da administração.' },
  { abbreviation: 'CFA', name: 'Conselho Federal de Administração', linked_professionals: 'Órgão federal da administração', description: 'Órgão federal regulador da administração.' },
] as const;

export type ClassEntityTemplate = (typeof CLASS_ENTITY_TEMPLATES)[number];

/** No cadastro do profissional: só os conselhos regionais (os federais não registram profissional). */
export const REGIONAL_TEMPLATES = CLASS_ENTITY_TEMPLATES.filter((t) => t.abbreviation.startsWith('CR') || t.abbreviation === 'COREN');

/** Valor do campo: id da entidade da clínica, 'tpl:SIGLA' (modelo ainda não cadastrado) ou 'none'. */
export const NO_ENTITY = 'none';
export const templateValue = (abbreviation: string) => `tpl:${abbreviation}`;
export const templateFromValue = (value: string) =>
  value.startsWith('tpl:') ? CLASS_ENTITY_TEMPLATES.find((t) => t.abbreviation === value.slice(4)) ?? null : null;

/** Modelos regionais que a clínica ainda não tem cadastrados (pela sigla). */
export function missingTemplates(existingAbbreviations: string[]) {
  const have = new Set(existingAbbreviations.map((a) => a.toUpperCase()));
  return REGIONAL_TEMPLATES.filter((t) => !have.has(t.abbreviation));
}
