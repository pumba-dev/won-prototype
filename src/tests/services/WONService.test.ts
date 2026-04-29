import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WONService from '../../services/WONService';
import { PhysicalLayer } from '../../layers/PhysicalLayer';

describe('WONService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (WONService as any)._physical = null;
    WONService.demoRunning = false;
    WONService.moduRunning = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    WONService.moduRunning = false;
    WONService.demoRunning = false;
  });

  describe('flags estáticas', () => {
    it('demoRunning começa false', () => {
      expect(WONService.demoRunning).toBe(false);
    });
    it('moduRunning começa false', () => {
      expect(WONService.moduRunning).toBe(false);
    });
  });

  describe('startVideoRecording', () => {
    it('não lança erro com videoElem null', () => {
      expect(() => WONService.startVideoRecording(null)).not.toThrow();
    });
    it('chama PhysicalLayer.startCamera quando videoElem fornecido', () => {
      const spy = vi.spyOn(PhysicalLayer.prototype, 'startCamera').mockImplementation(() => {});
      const mockVideo = { srcObject: null } as unknown as HTMLVideoElement;
      WONService.startVideoRecording(mockVideo);
      expect(spy).toHaveBeenCalledWith(mockVideo);
    });
  });

  describe('startDemodulation', () => {
    it('retorna undefined quando videoElem é null', async () => {
      const result = await WONService.startDemodulation(
        4,
        null,
        { x: 0, y: 0, width: 100, height: 100 },
      );
      expect(result).toBeUndefined();
    });
    it('não altera demoRunning quando videoElem é null', async () => {
      await WONService.startDemodulation(4, null, { x: 0, y: 0, width: 100, height: 100 });
      expect(WONService.demoRunning).toBe(false);
    });
  });

  describe('drawConfigSymbol', () => {
    it('delega para PhysicalLayer.drawControlSymbol com a cor correta', () => {
      const spy = vi.spyOn(PhysicalLayer.prototype, 'drawControlSymbol').mockImplementation(() => {});
      WONService.drawConfigSymbol('#ff0000');
      expect(spy).toHaveBeenCalledWith('#ff0000');
    });
    it('não lança erro', () => {
      vi.spyOn(PhysicalLayer.prototype, 'drawControlSymbol').mockImplementation(() => {});
      expect(() => WONService.drawConfigSymbol('#0000FF')).not.toThrow();
    });
  });

  describe('startModulation', () => {
    it('seta moduRunning=true ao iniciar', async () => {
      vi.useFakeTimers();
      vi.spyOn(PhysicalLayer.prototype, 'drawDataSymbol').mockImplementation(() => {});
      vi.spyOn(PhysicalLayer.prototype, 'drawControlSymbol').mockImplementation(() => {});

      WONService.startModulation('A', '8');
      expect(WONService.moduRunning).toBe(true);

      WONService.moduRunning = false;
      await vi.runAllTimersAsync();
    });

    it('chama drawDataSymbol para quadros de dados', async () => {
      vi.useFakeTimers();
      const drawData = vi.spyOn(PhysicalLayer.prototype, 'drawDataSymbol').mockImplementation(() => {});
      vi.spyOn(PhysicalLayer.prototype, 'drawControlSymbol').mockImplementation(() => {});

      const promise = WONService.startModulation('A', '8');
      WONService.moduRunning = false;
      await vi.runAllTimersAsync();
      await promise;

      expect(drawData).toHaveBeenCalled();
    });

    it('codifica o texto corretamente antes de transmitir', async () => {
      vi.useFakeTimers();
      const drawData = vi.spyOn(PhysicalLayer.prototype, 'drawDataSymbol').mockImplementation(() => {});
      vi.spyOn(PhysicalLayer.prototype, 'drawControlSymbol').mockImplementation(() => {});

      const promise = WONService.startModulation('A', '8');
      WONService.moduRunning = false;
      await vi.runAllTimersAsync();
      await promise;

      // 'A' → charCode 65 → 01000001
      expect(drawData).toHaveBeenCalledWith(8, [0, 1, 0, 0, 0, 0, 0, 1]);
    });
  });
});
