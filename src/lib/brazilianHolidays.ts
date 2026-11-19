/**
 * Feriados nacionais e pontos facultativos oficiais do Brasil
 * Fonte oficial: Portarias do Ministério da Gestão e da Inovação em Serviços Públicos / Gov.br
 * Leis nº 10.607/2002, nº 6.802/1980 e nº 14.759/2023 (Dia Nacional de Zumbi e da Consciência Negra).
 */

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  reason: string;
  type: 'feriado' | 'facultativo';
}

/**
 * Algoritmo oficial de Meeus/Jones/Butcher para cálculo do Domingo de Páscoa (Calendário Gregoriano)
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysToUtcDate(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatUtcIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getBrazilianHolidays(year: number): HolidayEntry[] {
  const easter = getEasterSunday(year);

  // Datas móveis baseadas na Páscoa
  const carnavalSegunda = addDaysToUtcDate(easter, -48);
  const carnavalTerca = addDaysToUtcDate(easter, -47);
  const quartaCinzas = addDaysToUtcDate(easter, -46);
  const paixaoCristo = addDaysToUtcDate(easter, -2);
  const corpusChristi = addDaysToUtcDate(easter, 60);

  const holidays: HolidayEntry[] = [
    // Feriados Nacionais Fixos (Leis nº 10.607/2002 e 6.802/1980)
    { date: `${year}-01-01`, reason: 'Confraternização Universal (Ano Novo)', type: 'feriado' },
    
    // Carnaval (Ponto facultativo oficial gov.br)
    { date: formatUtcIsoDate(carnavalSegunda), reason: 'Carnaval (segunda-feira)', type: 'facultativo' },
    { date: formatUtcIsoDate(carnavalTerca), reason: 'Carnaval (terça-feira)', type: 'facultativo' },
    { date: formatUtcIsoDate(quartaCinzas), reason: 'Quarta-feira de Cinzas', type: 'facultativo' },

    // Sexta-feira Santa (Feriado Nacional)
    { date: formatUtcIsoDate(paixaoCristo), reason: 'Paixão de Cristo (Sexta-feira Santa)', type: 'feriado' },

    // Tiradentes (Feriado Nacional)
    { date: `${year}-04-21`, reason: 'Tiradentes', type: 'feriado' },

    // Dia do Trabalho (Feriado Nacional)
    { date: `${year}-05-01`, reason: 'Dia Mundial do Trabalho', type: 'feriado' },

    // Corpus Christi (Ponto facultativo oficial gov.br)
    { date: formatUtcIsoDate(corpusChristi), reason: 'Corpus Christi', type: 'facultativo' },

    // Independência do Brasil (Feriado Nacional)
    { date: `${year}-09-07`, reason: 'Independência do Brasil', type: 'feriado' },

    // Padroeira do Brasil (Feriado Nacional)
    { date: `${year}-10-12`, reason: 'Nossa Senhora Aparecida', type: 'feriado' },

    // Finados (Feriado Nacional)
    { date: `${year}-11-02`, reason: 'Finados', type: 'feriado' },

    // Proclamação da República (Feriado Nacional)
    { date: `${year}-11-15`, reason: 'Proclamação da República', type: 'feriado' },

    // Dia Nacional de Zumbi e da Consciência Negra (Lei nº 14.759/2023 - Feriado Nacional)
    { date: `${year}-11-20`, reason: 'Dia Nacional de Zumbi e da Consciência Negra', type: 'feriado' },

    // Véspera de Natal (Ponto facultativo gov.br)
    { date: `${year}-12-24`, reason: 'Véspera de Natal', type: 'facultativo' },

    // Natal (Feriado Nacional)
    { date: `${year}-12-25`, reason: 'Natal', type: 'feriado' },

    // Véspera de Ano Novo (Ponto facultativo gov.br)
    { date: `${year}-12-31`, reason: 'Véspera de Ano Novo', type: 'facultativo' },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
