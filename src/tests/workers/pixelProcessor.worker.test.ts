// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante que global.self e global.ImageData sejam definidos
// ANTES que o módulo do worker seja avaliado (imports ES são hoistados)
const mockSelf = vi.hoisted(() => {
  const s: any = {};
  (global as any).self = s;
  (global as any).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  return s;
});

import '../../workers/pixelProcessor.worker';

function makeBuffer(width: number, height: number, fill?: (buf: Uint8ClampedArray) => void): ArrayBuffer {
  const buf = new Uint8ClampedArray(width * height * 4);
  if (fill) fill(buf);
  return buf.buffer;
}

function callOnMessage(data: object) {
  mockSelf.onmessage({ data });
}

describe('pixelProcessor.worker', () => {
  beforeEach(() => {
    mockSelf.postMessage = vi.fn();
  });

  describe('resposta base', () => {
    it('responde com type="frameResult"', () => {
      callOnMessage({
        type: 'processFrame',
        buffer: makeBuffer(4, 4),
        width: 4,
        height: 4,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage).toHaveBeenCalledOnce();
      expect(mockSelf.postMessage.mock.calls[0][0].type).toBe('frameResult');
    });

    it('resposta contém centerColor e rectangleColors', () => {
      callOnMessage({
        type: 'processFrame',
        buffer: makeBuffer(4, 4),
        width: 4,
        height: 4,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      const res = mockSelf.postMessage.mock.calls[0][0];
      expect(res).toHaveProperty('centerColor');
      expect(res).toHaveProperty('rectangleColors');
      expect(Array.isArray(res.rectangleColors)).toBe(true);
    });

    it('funciona com preProcess=true (filtro mediana aplicado)', () => {
      callOnMessage({
        type: 'processFrame',
        buffer: makeBuffer(6, 6),
        width: 6,
        height: 6,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: true,
      });
      expect(mockSelf.postMessage).toHaveBeenCalledOnce();
      expect(mockSelf.postMessage.mock.calls[0][0].type).toBe('frameResult');
    });
  });

  describe('detectCenterColor', () => {
    it('detecta "white" quando pixels centrais são brancos (RGB > threshold)', () => {
      const buffer = makeBuffer(5, 5, buf => buf.fill(255));
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: 5,
        height: 5,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].centerColor).toBe('white');
    });

    it('detecta "black" quando pixels centrais são pretos (RGB < threshold)', () => {
      // Todos zeros (preto), alpha=255
      const buffer = makeBuffer(5, 5, buf => {
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: 5,
        height: 5,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].centerColor).toBe('black');
    });

    it('detecta "blue" quando canal azul domina no centro', () => {
      const w = 5, h = 5;
      const buffer = makeBuffer(w, h, buf => {
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 0;       // R
          buf[i + 1] = 0;   // G
          buf[i + 2] = 255; // B
          buf[i + 3] = 255; // A
        }
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: w,
        height: h,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].centerColor).toBe('blue');
    });

    it('detecta "red" quando canal vermelho domina no centro', () => {
      const w = 5, h = 5;
      const buffer = makeBuffer(w, h, buf => {
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 255;     // R
          buf[i + 1] = 0;   // G
          buf[i + 2] = 0;   // B
          buf[i + 3] = 255; // A
        }
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: w,
        height: h,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].centerColor).toBe('red');
    });

    it('detecta "green" quando canal verde domina no centro', () => {
      const w = 5, h = 5;
      const buffer = makeBuffer(w, h, buf => {
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 0;       // R
          buf[i + 1] = 255; // G
          buf[i + 2] = 0;   // B
          buf[i + 3] = 255; // A
        }
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: w,
        height: h,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].centerColor).toBe('green');
    });
  });

  describe('detectRectangles', () => {
    it('rectangleColors é array vazio para imagem preta', () => {
      const buffer = makeBuffer(4, 4, buf => {
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: 4,
        height: 4,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      expect(mockSelf.postMessage.mock.calls[0][0].rectangleColors).toEqual([]);
    });

    it('detecta bit=0 (vermelho) na imagem', () => {
      const w = 4, h = 1;
      const buffer = makeBuffer(w, h, buf => {
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 255;     // R
          buf[i + 1] = 0;   // G
          buf[i + 2] = 0;   // B
          buf[i + 3] = 255;
        }
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: w,
        height: h,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      const { rectangleColors } = mockSelf.postMessage.mock.calls[0][0];
      expect(rectangleColors).toContain(0);
    });

    it('detecta bit=1 (verde) na imagem', () => {
      const w = 4, h = 1;
      const buffer = makeBuffer(w, h, buf => {
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 0;       // R
          buf[i + 1] = 255; // G
          buf[i + 2] = 0;   // B
          buf[i + 3] = 255;
        }
      });
      callOnMessage({
        type: 'processFrame',
        buffer,
        width: w,
        height: h,
        kernelSize: 3,
        colorThreshold: 150,
        preProcess: false,
      });
      const { rectangleColors } = mockSelf.postMessage.mock.calls[0][0];
      expect(rectangleColors).toContain(1);
    });
  });
});
