import DOMPurify from 'dompurify';

export type ContractTemplateData = {
  clinic: {
    name: string;
    cnpj: string;
    address: string;
    city: string;
    state: string;
    phone: string;
    email: string;
  };
  patient: {
    name: string;
    cpf: string;
    birth_date: string;
    address: string;
  };
  payer?: {
    name: string;
    cpf: string;
    birth_date: string;
  };
  contract: {
    number: string;
    date: string;
    start_date: string;
    end_date: string;
  };
  treatments: {
    summary: string;
    total_sessions: number;
  };
  payment: {
    total_value: string;
    condition: string;
    methods: string;
    installments: number;
    due_dates: string;
  };
  proposal: {
    number: string;
  };
  anamnesis: {
    number: string;
  };
};

export type RenderResult = {
  html: string;
  missingRequired: string[];
  unknownPlaceholders: string[];
  warnings: string[];
};

export type ContractTemplateInput = {
  [K in keyof ContractTemplateData]?: ContractTemplateData[K] extends object
    ? Partial<ContractTemplateData[K]>
    : ContractTemplateData[K];
};

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'u'],
  ALLOWED_ATTR: ['class', 'rowspan', 'colspan'],
  ALLOW_DATA_ATTR: false,
};

export const sanitizeContractTemplate = (html: string) => DOMPurify.sanitize(html, SANITIZE_OPTIONS);

// Flatten an object into a flat dictionary of keys e.g. "clinic.name": "Clinica X"
const flattenObject = (ob: object, prefix = ''): Record<string, unknown> => {
  const record = ob as Record<string, unknown>;
  return Object.keys(ob).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof record[k] === 'object' && record[k] !== null && !Array.isArray(record[k])) {
      Object.assign(acc, flattenObject(record[k] as object, pre + k));
    } else {
      acc[pre + k] = record[k];
    }
    return acc;
  }, {} as Record<string, unknown>);
};

const REQUIRED_PLACEHOLDERS = [
  'clinic.name', 'clinic.cnpj', 
  'patient.name', 'patient.cpf',
  'contract.number', 'contract.date',
  'treatments.summary', 'treatments.total_sessions',
  'payment.total_value'
];

// Replaces all {{keys}} and handles {{#if payer}} ... {{/if}}
export function renderContractTemplate(html: string, data: ContractTemplateInput): RenderResult {
  const result: RenderResult = {
    html: '',
    missingRequired: [],
    unknownPlaceholders: [],
    warnings: []
  };

  const flatData = flattenObject(data);

  // Process conditional block {{#if payer}} ... {{/if}}
  // We only support simple boolean checks for 'payer' or similar top-level properties.
  let processedHtml = html.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    // If the data has this key (e.g. payer) and it's truthy (meaning an object was passed), render content
    if (data[key as keyof ContractTemplateData]) {
      return content;
    }
    return '';
  });

  // Extract all placeholders {{...}}
  const placeholderRegex = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
  let match;
  const foundPlaceholders = new Set<string>();
  while ((match = placeholderRegex.exec(processedHtml)) !== null) {
    foundPlaceholders.add(match[1]);
  }

  // Check required
  for (const req of REQUIRED_PLACEHOLDERS) {
    const value = flatData[req];
    if (foundPlaceholders.has(req) && (value === undefined || value === null || String(value).trim() === '')) {
      result.missingRequired.push(req);
    }
  }

  // Check unknown (Record<string, unknown>thing not in flatData and not in a known list)
  const knownKeys = new Set([
    ...REQUIRED_PLACEHOLDERS,
    'clinic.address', 'clinic.city', 'clinic.state', 'clinic.phone', 'clinic.email',
    'patient.birth_date', 'patient.address',
    'payer.name', 'payer.cpf', 'payer.birth_date',
    'contract.start_date', 'contract.end_date',
    'payment.condition', 'payment.methods', 'payment.installments', 'payment.due_dates',
    'proposal.number', 'anamnesis.number'
  ]);
  
  for (const placeholder of foundPlaceholders) {
    if (!knownKeys.has(placeholder)) {
      result.unknownPlaceholders.push(placeholder);
    }
  }

  // Replace placeholders
  processedHtml = processedHtml.replace(placeholderRegex, (match, key) => {
    const val = flatData[key];
    if (val === undefined || val === null) return '';
    // Escape HTML to prevent injection
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  });

  // Sanitize the final HTML
  // We allow basic formatting tags, but NO script, object, iframe, style, or dangerous attributes.
  result.html = sanitizeContractTemplate(processedHtml);

  return result;
}
