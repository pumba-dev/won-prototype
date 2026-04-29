import { describe, it, expect } from 'vitest';
import { LinkLayer } from '../../layers/LinkLayer';

describe('LinkLayer', () => {
  const link = new LinkLayer();

  describe('constantes estáticas', () => {
    it('SYMBOL_LIFE_MS é número positivo', () => {
      expect(typeof LinkLayer.SYMBOL_LIFE_MS).toBe('number');
      expect(LinkLayer.SYMBOL_LIFE_MS).toBeGreaterThan(0);
    });
    it('GUARD_COLOR é string hex de 6 dígitos', () => {
      expect(LinkLayer.GUARD_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
    it('END_COLOR é string hex de 6 dígitos', () => {
      expect(LinkLayer.END_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
    it('SYNC_COLOR é string hex de 6 dígitos', () => {
      expect(LinkLayer.SYNC_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
    it('LOST_BIT_RECOVER é booleano', () => {
      expect(typeof LinkLayer.LOST_BIT_RECOVER).toBe('boolean');
    });
  });

  describe('buildFrameSequence', () => {
    it('primeiro quadro é do tipo data', () => {
      const frames = link.buildFrameSequence('10110011', 8);
      expect(frames[0].type).toBe('data');
    });
    it('último quadro é do tipo end', () => {
      const frames = link.buildFrameSequence('10110011', 8);
      expect(frames[frames.length - 1].type).toBe('end');
    });
    it('alterna data → guard entre símbolos', () => {
      const frames = link.buildFrameSequence('1011001110110011', 8);
      expect(frames[0].type).toBe('data');
      expect(frames[1].type).toBe('guard');
      expect(frames[2].type).toBe('data');
      expect(frames[3].type).toBe('guard');
    });
    it('bits do quadro de dados têm comprimento igual a bitsPerSymbol', () => {
      const frames = link.buildFrameSequence('10110011', 4);
      const dataFrames = frames.filter(f => f.type === 'data');
      dataFrames.forEach(f => {
        expect((f as any).bits).toHaveLength(4);
      });
    });
    it('aplica padding de zeros quando bits insuficientes', () => {
      const frames = link.buildFrameSequence('101', 8);
      const data = frames.find(f => f.type === 'data') as any;
      expect(data.bits).toHaveLength(8);
      expect(data.bits.slice(3)).toEqual([0, 0, 0, 0, 0]);
    });
    it('gera 2 quadros de dados para 16 bits com bitsPerSymbol=8', () => {
      const frames = link.buildFrameSequence('1011001110110011', 8);
      const dataCount = frames.filter(f => f.type === 'data').length;
      expect(dataCount).toBe(2);
    });
    it('bits são array de números 0 e 1', () => {
      const frames = link.buildFrameSequence('10110011', 8);
      const data = frames[0] as any;
      expect(data.bits.every((b: number) => b === 0 || b === 1)).toBe(true);
    });
  });

  describe('getControlColor', () => {
    it('sync retorna SYNC_COLOR', () => {
      expect(link.getControlColor('sync')).toBe(LinkLayer.SYNC_COLOR);
    });
    it('guard retorna GUARD_COLOR', () => {
      expect(link.getControlColor('guard')).toBe(LinkLayer.GUARD_COLOR);
    });
    it('end retorna END_COLOR', () => {
      expect(link.getControlColor('end')).toBe(LinkLayer.END_COLOR);
    });
  });

  describe('createRxState', () => {
    it('awaitingNewSymbol começa true', () => {
      expect(link.createRxState().awaitingNewSymbol).toBe(true);
    });
    it('collectedBits começa vazio', () => {
      expect(link.createRxState().collectedBits).toEqual([]);
    });
    it('done começa false', () => {
      expect(link.createRxState().done).toBe(false);
    });
  });

  describe('processReceivedSymbol', () => {
    it('cor "blue" seta awaitingNewSymbol=true', () => {
      const state = { awaitingNewSymbol: false, collectedBits: [], done: false };
      const next = link.processReceivedSymbol('blue', [], state, 4);
      expect(next.awaitingNewSymbol).toBe(true);
    });
    it('cor "blue" não altera done', () => {
      const state = { awaitingNewSymbol: false, collectedBits: [], done: false };
      const next = link.processReceivedSymbol('blue', [], state, 4);
      expect(next.done).toBe(false);
    });
    it('cor "white" seta done=true', () => {
      const state = link.createRxState();
      const next = link.processReceivedSymbol('white', [], state, 4);
      expect(next.done).toBe(true);
    });
    it('mesmo símbolo ignorado quando awaitingNewSymbol=false', () => {
      const state = { awaitingNewSymbol: false, collectedBits: [1], done: false };
      const next = link.processReceivedSymbol('red', [0, 1], state, 2);
      expect(next).toBe(state);
    });
    it('novo símbolo acumula bits e seta awaitingNewSymbol=false', () => {
      const state = link.createRxState();
      const next = link.processReceivedSymbol('red', [0, 1, 1, 0], state, 4);
      expect(next.collectedBits).toEqual([0, 1, 1, 0]);
      expect(next.awaitingNewSymbol).toBe(false);
    });
    it('bits acumulam entre símbolos consecutivos', () => {
      let state = link.createRxState();
      state = link.processReceivedSymbol('green', [1, 0], state, 2);
      state = link.processReceivedSymbol('blue', [], state, 2);
      state = link.processReceivedSymbol('green', [0, 1], state, 2);
      expect(state.collectedBits).toEqual([1, 0, 0, 1]);
    });
    it('null não muda estado quando awaitingNewSymbol=false', () => {
      const state = { awaitingNewSymbol: false, collectedBits: [1], done: false };
      const next = link.processReceivedSymbol(null, [], state, 4);
      expect(next).toBe(state);
    });
  });

  describe('assembleBits', () => {
    it('junta array de bits em string binária', () => {
      expect(link.assembleBits([1, 0, 1, 1])).toBe('1011');
    });
    it('array vazio retorna string vazia', () => {
      expect(link.assembleBits([])).toBe('');
    });
    it('single bit', () => {
      expect(link.assembleBits([0])).toBe('0');
    });
  });

  describe('recoverLostBits', () => {
    it('retorna sem modificação quando LOST_BIT_RECOVER=false', () => {
      const bits = [0, 1];
      const result = link.recoverLostBits(bits, 4);
      expect(result).toBe(bits);
    });
    it('retorna sem modificação quando len >= expected', () => {
      const bits = [0, 1, 1, 0];
      expect(link.recoverLostBits(bits, 4)).toEqual([0, 1, 1, 0]);
    });
    it('não encurta array já completo', () => {
      const bits = [1, 1, 1, 1, 1];
      expect(link.recoverLostBits(bits, 4)).toHaveLength(5);
    });
  });
});
