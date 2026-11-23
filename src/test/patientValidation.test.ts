import { describe, expect, it } from 'vitest';
import {
  formatCpf, formatPatientAddress, formatPhone, isValidCpf, isValidPhone, patientSaveErrorMessage, validatePatientFields,
} from '@/lib/patients/validation';

describe('CPF', () => {
  it('aceita CPF válido com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });
  it('recusa CPF com dígito errado, curto ou repetido', () => {
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('4481713824')).toBe(false); // 10 dígitos (caso real da homolog)
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
  it('formata enquanto digita', () => {
    expect(formatCpf('5299822')).toBe('529.982.2');
    expect(formatCpf('529982247259999')).toBe('529.982.247-25');
  });
});

describe('Telefone', () => {
  it('aceita celular e fixo com DDD', () => {
    expect(isValidPhone('13997021099')).toBe(true);
    expect(isValidPhone('(11) 3333-4444')).toBe(true);
    expect(isValidPhone('+55 13 99702-1099')).toBe(true);
  });
  it('recusa sem DDD, celular sem 9 e DDD inválido', () => {
    expect(isValidPhone('997021099')).toBe(false);
    expect(isValidPhone('13897021099')).toBe(false);
    expect(isValidPhone('0199702109')).toBe(false);
  });
  it('formata', () => {
    expect(formatPhone('13997021099')).toBe('(13) 99702-1099');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
  });
});

describe('Cadastro', () => {
  const base = { cpf: '52998224725', phone: '13997021099', address: '', address_number: '' };
  it('exige CPF e telefone', () => {
    expect(validatePatientFields({ ...base, cpf: '', phone: '' })).toEqual({ cpf: 'CPF é obrigatório.', phone: 'Telefone é obrigatório.' });
  });
  it('com endereço, exige número', () => {
    expect(validatePatientFields({ ...base, address: 'Rua A' }).address_number).toBeTruthy();
    expect(validatePatientFields({ ...base, address: 'Rua A', address_number: 'S/N' })).toEqual({});
  });
  it('monta endereço completo para o contrato', () => {
    expect(formatPatientAddress({
      address: 'Rua França Pinto, Enseada', address_number: '120', address_complement: 'Apto 31, Bloco B',
      city: 'Guarujá', state: 'SP', zip_code: '11440-510',
    })).toBe('Rua França Pinto, Enseada, 120, Apto 31, Bloco B, Guarujá/SP, CEP 11440-510');
    expect(formatPatientAddress({})).toBe('');
  });
  it('mensagem do bloqueio de CPF repetido', () => {
    expect(patientSaveErrorMessage({ code: '23505', hint: 'cpf_duplicado', message: 'CPF já cadastrado para outro cliente: Ana' }))
      .toBe('CPF já cadastrado para outro cliente: Ana');
  });
});
