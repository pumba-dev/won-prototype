// setup.ts — Mocks globais para testes
import { vi } from 'vitest';

// Canvas mock
export const mockCtx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(),
  get fillStyle() { return this._fillStyle; },
  set fillStyle(val) { this._fillStyle = val; },
  _fillStyle: '',
};
export const mockCanvas = {
  getContext: vi.fn(() => mockCtx),
  width: 100,
  height: 100,
};


if (typeof global.document !== 'undefined') {
  global.document.createElement = vi.fn((tag) => {
    if (tag === 'canvas') return mockCanvas;
    return {};
  });
  global.document.getElementById = vi.fn((id) => {
    if (id === 'transmitter-symbol') return mockCanvas;
    return null;
  });
}

// Web Worker mock
export let lastWorkerInstance: any = null;
export class MockWorker {
  onmessage: any;
  onerror: any;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { lastWorkerInstance = this; }
  simulateMessage(data: any) {
    if (this.onmessage) this.onmessage({ data });
  }
  simulateError(msg: any) {
    if (this.onerror) this.onerror({ message: msg });
  }
}
global.Worker = MockWorker as any;

// navigator.mediaDevices mock
export const mockStream = {};
export const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  configurable: true,
});
