import { describe, it, expect } from 'vitest';
import { TransportLayer } from '../../layers/TransportLayer';

describe('TransportLayer', () => {
  const transport = new TransportLayer();

  describe('encode', () => {
    it('char único gera exatamente 8 bits', () => {
      expect(transport.encode('A')).toMatch(/^[01]{8}$/);
    });
    it('múltiplos chars geram N×8 bits', () => {
      expect(transport.encode('AB')).toMatch(/^[01]{16}$/);
    });
    it('string vazia retorna vazio', () => {
      expect(transport.encode('')).toBe('');
    });
    it('comprimento é múltiplo de 8', () => {
      expect(transport.encode('ABC').length % 8).toBe(0);
    });
    it('apenas 0s e 1s', () => {
      expect(transport.encode('Hello')).toMatch(/^[01]+$/);
    });
    it('char nulo codificado como 00000000', () => {
      expect(transport.encode('\0')).toBe('00000000');
    });
    it('espaço codificado como 00100000', () => {
      expect(transport.encode(' ')).toBe('00100000');
    });
    it('"A" codificado como 01000001', () => {
      expect(transport.encode('A')).toBe('01000001');
    });
  });

  describe('decode', () => {
    it('decodifica char único', () => {
      expect(transport.decode('01000001')).toBe('A');
    });
    it('decodifica múltiplos chars', () => {
      expect(transport.decode('0100000101000010')).toBe('AB');
    });
    it('string vazia retorna vazio', () => {
      expect(transport.decode('')).toBe('');
    });
    it('byte parcial (7 bits) é descartado', () => {
      expect(transport.decode('0100000')).toBe('');
    });
    it('round-trip encode → decode', () => {
      const str = 'Hello, World!';
      expect(transport.decode(transport.encode(str))).toBe(str);
    });
    it('round-trip com caracteres especiais', () => {
      const str = '!@#$%';
      expect(transport.decode(transport.encode(str))).toBe(str);
    });
  });
});
