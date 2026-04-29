import type {
  ProcessRequest,
  ProcessResponse,
} from "../workers/pixelProcessor.worker";

/**
 * Camada Física — WON
 *
 * Responsável pela conversão entre quadros (frames) e sinais físicos:
 *
 *  TX  – recebe quadros da camada de Enlace e os renderiza como símbolos
 *         visuais no canvas (grade colorida para dados, cor sólida para controle)
 *
 *  RX  – inicializa a câmera, captura frames de vídeo, aplica filtro
 *         de ruído sal-e-pimenta no Web Worker (sem travar a UI) e
 *         retorna o resultado de detecção de cor/retângulos para o Enlace
 *
 * Cores dos bits:
 *  bit 0 → Vermelho (#FF0000)
 *  bit 1 → Verde    (#00FF00)
 */

export interface CropCoord {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameResult {
  /** Cor detectada no centro do frame (para identificar quadros de controle). */
  centerColor: string | null;
  /** Array de bits detectados nos retângulos coloridos (quadros de dados). */
  rectangleColors: number[];
}

export class PhysicalLayer {
  // ── Constantes ────────────────────────────────────────────────────────────

  static readonly BIT_0_COLOR = "#FF0000"; // Vermelho → bit 0
  static readonly BIT_1_COLOR = "#00FF00"; // Verde    → bit 1
  static readonly BORDER_SIZE = 35; // Largura da borda de guarda (px)
  static readonly COLOR_THRESHOLD = 150; // Limiar RGB para detecção de cor
  static readonly KERNEL_SIZE = 4; // Tamanho do kernel do filtro mediana
  static readonly PRE_PROCESS = true; // Aplica filtro antes da detecção

  // ── Worker (thread separada para processamento de pixels) ─────────────────

  private worker: Worker;
  private pendingResolve: ((r: FrameResult) => void) | null = null;
  private pendingReject: ((e: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(
      new URL("../workers/pixelProcessor.worker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      if (this.pendingResolve) {
        this.pendingResolve({
          centerColor: e.data.centerColor,
          rectangleColors: e.data.rectangleColors,
        });
        this.pendingResolve = null;
        this.pendingReject = null;
      }
    };

    this.worker.onerror = (e: ErrorEvent) => {
      if (this.pendingReject) {
        this.pendingReject(new Error(e.message));
        this.pendingResolve = null;
        this.pendingReject = null;
      }
    };
  }

  // ── TX — Renderização de símbolos ─────────────────────────────────────────

  /**
   * Desenha um símbolo de dados no canvas do transmissor.
   * Cada bit do quadro corresponde a um retângulo colorido na grade.
   */
  drawDataSymbol(modulation: number, bits: number[]): void {
    const canvas = document.getElementById(
      "transmitter-symbol"
    ) as HTMLCanvasElement | null;
    const container = document.getElementById("body__transmitter");
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = PhysicalLayer.BORDER_SIZE;

    if (modulation === 1) {
      ctx.fillStyle = this.getBitColor(bits[0] as 0 | 1);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (modulation === 2) {
      const w = canvas.width / 2;
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = this.getBitColor(bits[i] as 0 | 1);
        ctx.fillRect(i * w, 0, w, canvas.height);
        ctx.strokeRect(i * w, 0, w, canvas.height);
      }
      return;
    }

    const n = Math.sqrt(modulation);
    const pw = canvas.width / n;
    const ph = canvas.height / n;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const bit = bits[row * n + col] as 0 | 1;
        ctx.fillStyle = this.getBitColor(bit);
        ctx.fillRect(col * pw, row * ph, pw, ph);
        ctx.strokeRect(col * pw, row * ph, pw, ph);
      }
    }
  }

  /**
   * Desenha um símbolo de controle (cor sólida) no canvas do transmissor.
   * Usado para quadros de sync, guarda e fim.
   */
  drawControlSymbol(color: string): void {
    const canvas = document.getElementById(
      "transmitter-symbol"
    ) as HTMLCanvasElement | null;
    const container = document.getElementById("body__transmitter");
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  // ── RX — Câmera e processamento de imagem ─────────────────────────────────

  /** Inicializa a câmera, preferindo a traseira em dispositivos móveis. */
  startCamera(videoElem: HTMLVideoElement): void {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("getUserMedia não suportado neste dispositivo.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })
      .then((stream) => {
        videoElem.srcObject = stream;
      })
      .catch(() => {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            videoElem.srcObject = stream;
          })
          .catch((err) => console.error("Erro ao acessar câmera:", err));
      });
  }

  /**
   * Captura um frame da câmera e recorta a área de sinal indicada.
   * Retorna null se o elemento de vídeo não estiver pronto.
   */
  captureFrame(
    videoElem: HTMLVideoElement,
    coord?: CropCoord
  ): ImageData | null {
    const x = coord?.x ?? 0;
    const y = coord?.y ?? 0;
    const w = coord?.width ?? videoElem.videoWidth;
    const h = coord?.height ?? videoElem.videoHeight;

    if (w <= 0 || h <= 0) return null;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;

    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(videoElem, x, y, w, h, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  /**
   * Processa um frame no Web Worker (não bloqueia a thread principal).
   *
   * Passos executados no worker:
   *  1. Filtro mediana (sal-e-pimenta) — reduz ruído óptico
   *  2. Detecção da cor central — identifica quadros de controle
   *  3. Detecção de retângulos — extrai bits dos quadros de dados
   *
   * O ArrayBuffer é transferido (zero-copy) para o worker.
   */
  processFrame(imageData: ImageData): Promise<FrameResult> {
    return new Promise<FrameResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      const request: ProcessRequest = {
        type: "processFrame",
        buffer: imageData.data.buffer,
        width: imageData.width,
        height: imageData.height,
        kernelSize: PhysicalLayer.KERNEL_SIZE,
        colorThreshold: PhysicalLayer.COLOR_THRESHOLD,
        preProcess: PhysicalLayer.PRE_PROCESS,
      };

      this.worker.postMessage(request, [request.buffer]);
    });
  }

  /** Encerra o worker ao destruir a instância. */
  terminate(): void {
    this.worker.terminate();
  }

  // ── Privado ───────────────────────────────────────────────────────────────

  private getBitColor(bit: 0 | 1): string {
    return bit === 0 ? PhysicalLayer.BIT_0_COLOR : PhysicalLayer.BIT_1_COLOR;
  }
}
