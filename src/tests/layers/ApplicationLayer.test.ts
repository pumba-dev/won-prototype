import { describe, it, expect } from 'vitest';
import { ApplicationLayer } from '../../layers/ApplicationLayer';

describe('ApplicationLayer', () => {
  const app = new ApplicationLayer();

  describe('prepareForTransmission', () => {
    it('retorna a mesma string (identidade)', () => {
      expect(app.prepareForTransmission('abc')).toBe('abc');
    });
    it('string vazia', () => {
      expect(app.prepareForTransmission('')).toBe('');
    });
    it('preserva whitespaces internos', () => {
      expect(app.prepareForTransmission(' a b\t')).toBe(' a b\t');
    });
    it('preserva unicode', () => {
      expect(app.prepareForTransmission('áéí')).toBe('áéí');
    });
  });

  describe('formatReceivedMessage', () => {
    it('trim em ambos os lados', () => {
      expect(app.formatReceivedMessage('  abc  ')).toBe('abc');
    });
    it('remove tabs e newlines das bordas', () => {
      expect(app.formatReceivedMessage('\tabc\n')).toBe('abc');
    });
    it('só whitespace retorna vazio', () => {
      expect(app.formatReceivedMessage('   ')).toBe('');
    });
    it('string vazia retorna vazio', () => {
      expect(app.formatReceivedMessage('')).toBe('');
    });
    it('preserva whitespace interno', () => {
      expect(app.formatReceivedMessage('a b')).toBe('a b');
    });
  });
});
