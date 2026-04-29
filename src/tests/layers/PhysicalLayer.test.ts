import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicalLayer } from '../../layers/PhysicalLayer';
import { mockCanvas, mockCtx, lastWorkerInstance, mockGetUserMedia } from '../setup';

const mockContainer = { clientWidth: 200, clientHeight: 200 };

describe('PhysicalLayer', () => {
  let layer: PhysicalLayer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'transmitter-symbol') return mockCanvas as unknown as HTMLElement;
      if (id === 'body__transmitter') return mockContainer as unknown as HTMLElement;
      return null;
    });
    layer = new PhysicalLayer();
  });

  describe('constructor', () => {
    it('cria instância sem erros', () => {
      expect(layer).toBeDefined();
    });
    it('cria um Web Worker', () => {
      expect(lastWorkerInstance).not.toBeNull();
    });
  });

  describe('constantes estáticas', () => {
    it('BIT_0_COLOR é vermelho', () => {
      expect(PhysicalLayer.BIT_0_COLOR).toBe('#FF0000');
    });
    it('BIT_1_COLOR é verde', () => {
      expect(PhysicalLayer.BIT_1_COLOR).toBe('#00FF00');
    });
    it('BORDER_SIZE é número positivo', () => {
      expect(PhysicalLayer.BORDER_SIZE).toBeGreaterThan(0);
    });
  });

  describe('drawDataSymbol', () => {
    it('modulation=1: chama fillRect uma vez', () => {
      layer.drawDataSymbol(1, [0]);
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(1);
    });
    it('modulation=1, bit=0: usa BIT_0_COLOR', () => {
      layer.drawDataSymbol(1, [0]);
      expect(mockCtx._fillStyle).toBe(PhysicalLayer.BIT_0_COLOR);
    });
    it('modulation=1, bit=1: usa BIT_1_COLOR', () => {
      layer.drawDataSymbol(1, [1]);
      expect(mockCtx._fillStyle).toBe(PhysicalLayer.BIT_1_COLOR);
    });
    it('modulation=2: chama fillRect duas vezes', () => {
      layer.drawDataSymbol(2, [0, 1]);
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(2);
    });
    it('modulation=4: chama fillRect quatro vezes', () => {
      layer.drawDataSymbol(4, [0, 1, 0, 1]);
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(4);
    });
    it('não lança erro quando canvas não existe', () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      expect(() => layer.drawDataSymbol(1, [0])).not.toThrow();
    });
  });

  describe('drawControlSymbol', () => {
    it('preenche o canvas com a cor fornecida', () => {
      layer.drawControlSymbol('#0000FF');
      expect(mockCtx._fillStyle).toBe('#0000FF');
    });
    it('chama fillRect uma vez', () => {
      layer.drawControlSymbol('#ffffff');
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(1);
    });
    it('não lança erro quando canvas não existe', () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      expect(() => layer.drawControlSymbol('#fff')).not.toThrow();
    });
  });

  describe('captureFrame', () => {
    const mockVideo = { videoWidth: 100, videoHeight: 100 } as HTMLVideoElement;

    it('retorna null quando videoWidth=0', () => {
      const emptyVideo = { videoWidth: 0, videoHeight: 100 } as HTMLVideoElement;
      expect(layer.captureFrame(emptyVideo)).toBeNull();
    });
    it('retorna null quando videoHeight=0', () => {
      const emptyVideo = { videoWidth: 100, videoHeight: 0 } as HTMLVideoElement;
      expect(layer.captureFrame(emptyVideo)).toBeNull();
    });
    it('retorna null quando coord.width=0', () => {
      expect(layer.captureFrame(mockVideo, { x: 0, y: 0, width: 0, height: 100 })).toBeNull();
    });
    it('chama drawImage com as coordenadas fornecidas', () => {
      const fakeImageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
      mockCtx.getImageData.mockReturnValue(fakeImageData);
      layer.captureFrame(mockVideo, { x: 10, y: 20, width: 50, height: 60 });
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockVideo, 10, 20, 50, 60, 0, 0, 50, 60);
    });
    it('retorna o resultado de getImageData', () => {
      const fakeImageData = { data: new Uint8ClampedArray(400), width: 100, height: 100 };
      mockCtx.getImageData.mockReturnValue(fakeImageData);
      const result = layer.captureFrame(mockVideo, { x: 0, y: 0, width: 100, height: 100 });
      expect(result).toBe(fakeImageData);
    });
  });

  describe('processFrame', () => {
    // ImageData não é global no jsdom — usamos um plain object compatível com a interface
    const fakeImageData = () =>
      ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData);

    it('retorna uma Promise', () => {
      expect(layer.processFrame(fakeImageData())).toBeInstanceOf(Promise);
    });
    it('resolve com centerColor e rectangleColors quando worker responde', async () => {
      const promise = layer.processFrame(fakeImageData());
      lastWorkerInstance.simulateMessage({
        type: 'frameResult',
        centerColor: 'blue',
        rectangleColors: [0, 1],
      });
      const result = await promise;
      expect(result.centerColor).toBe('blue');
      expect(result.rectangleColors).toEqual([0, 1]);
    });
    it('rejeita quando worker lança erro', async () => {
      const promise = layer.processFrame(fakeImageData());
      lastWorkerInstance.simulateError('falha no processamento');
      await expect(promise).rejects.toThrow('falha no processamento');
    });
    it('envia mensagem ao worker via postMessage', () => {
      layer.processFrame(fakeImageData());
      expect(lastWorkerInstance.postMessage).toHaveBeenCalledOnce();
    });
  });

  describe('terminate', () => {
    it('chama terminate no worker', () => {
      layer.terminate();
      expect(lastWorkerInstance.terminate).toHaveBeenCalledOnce();
    });
  });

  describe('startCamera', () => {
    it('chama navigator.mediaDevices.getUserMedia', async () => {
      const mockVideo = { srcObject: null } as unknown as HTMLVideoElement;
      layer.startCamera(mockVideo);
      await Promise.resolve();
      expect(mockGetUserMedia).toHaveBeenCalled();
    });
    it('solicita câmera traseira (facingMode environment)', async () => {
      const mockVideo = { srcObject: null } as unknown as HTMLVideoElement;
      layer.startCamera(mockVideo);
      await Promise.resolve();
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
        }),
      );
    });
  });
});
