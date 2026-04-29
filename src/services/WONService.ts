import { ApplicationLayer } from "../layers/ApplicationLayer";
import { TransportLayer } from "../layers/TransportLayer";
import { LinkLayer } from "../layers/LinkLayer";
import type { DataFrame } from "../layers/LinkLayer";
import { PhysicalLayer } from "../layers/PhysicalLayer";
import type { CropCoord } from "../layers/PhysicalLayer";

/**
 * WONService — Orquestrador do protocolo WON
 *
 * Coordena o fluxo de dados entre as 4 camadas, mantendo a API pública
 * estática que os componentes Vue já utilizam.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Aplicação   ApplicationLayer  texto digitado / texto exibido       │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Transporte  TransportLayer    texto ↔ fluxo de bits                │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Enlace      LinkLayer         bits ↔ quadros + protocolo de framing│
 * │                                máquina de estados RX                │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Física      PhysicalLayer     quadros → símbolos visuais (canvas)  │
 * │                                câmera → quadros (Web Worker)        │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export default class WONService {
  // ── Flags de controle (lidos/escritos pelos componentes Vue) ──────────────
  public static demoRunning = false;
  public static moduRunning = false;

  // ── Instâncias das camadas (lazy init) ────────────────────────────────────
  private static readonly _app = new ApplicationLayer();
  private static readonly _transport = new TransportLayer();
  private static readonly _link = new LinkLayer();
  private static _physical: PhysicalLayer | null = null;

  private static get physical(): PhysicalLayer {
    if (!WONService._physical) {
      WONService._physical = new PhysicalLayer();
    }
    return WONService._physical;
  }

  // ── TX — Transmissão ─────────────────────────────────────────────────────

  /**
   * Fluxo TX completo:
   *   Aplicação → prepara texto
   *   Transporte → codifica em bits
   *   Enlace     → monta sequência de quadros
   *   Física     → renderiza cada quadro no canvas, com temporização
   *
   * Retransmite em loop até `moduRunning = false`.
   */
  public static async startModulation(
    payload: string,
    modulation: string
  ): Promise<void> {
    const bitsPerSymbol = parseInt(modulation, 10);

    // Aplicação → Transporte
    const text = WONService._app.prepareForTransmission(payload);
    const bits = WONService._transport.encode(text);

    // Transporte → Enlace: monta sequência de quadros para uma mensagem
    const frames = WONService._link.buildFrameSequence(bits, bitsPerSymbol);

    WONService.moduRunning = true;

    while (WONService.moduRunning) {
      // Enlace → Física: transmite cada quadro com temporização
      for (const frame of frames) {
        if (!WONService.moduRunning) break;

        if (frame.type === "data") {
          WONService.physical.drawDataSymbol(
            bitsPerSymbol,
            (frame as DataFrame).bits
          );
        } else {
          WONService.physical.drawControlSymbol(
            WONService._link.getControlColor(frame.type)
          );
        }

        await sleep(LinkLayer.SYMBOL_LIFE_MS);
      }

      if (!WONService.moduRunning) break;

      // Pausa extra após o quadro de fim antes de retransmitir
      await sleep(LinkLayer.SYMBOL_LIFE_MS * 3);
    }
  }

  // ── RX — Recepção ─────────────────────────────────────────────────────────

  /**
   * Fluxo RX completo:
   *   Física     → captura frame de vídeo, processa no worker (sem travar UI)
   *   Enlace     → máquina de estados interpreta o símbolo e acumula bits
   *   Transporte → decodifica bits em texto
   *   Aplicação  → formata para exibição
   */
  public static async startDemodulation(
    modulation: number,
    videoElem: HTMLVideoElement | null,
    signalCoord: CropCoord
  ): Promise<string | undefined> {
    if (!videoElem) return undefined;

    WONService.demoRunning = true;

    // Enlace: inicializa máquina de estados do receptor
    let rxState = WONService._link.createRxState();

    while (WONService.demoRunning) {
      // Física: captura e processa frame no Web Worker
      const frame = WONService.physical.captureFrame(videoElem, signalCoord);

      if (!frame) {
        await sleep(100);
        continue;
      }

      const result = await WONService.physical.processFrame(frame);

      console.log("Center Color:", result.centerColor);

      // Enlace: atualiza máquina de estados com o símbolo recebido
      rxState = WONService._link.processReceivedSymbol(
        result.centerColor,
        result.rectangleColors,
        rxState,
        modulation
      );

      if (rxState.done) break;

      await sleep(LinkLayer.SYMBOL_LIFE_MS / 4);
    }

    WONService.demoRunning = false;

    // Enlace → Transporte → Aplicação
    const bitsString = WONService._link.assembleBits(rxState.collectedBits);
    const decoded = WONService._transport.decode(bitsString);
    return WONService._app.formatReceivedMessage(decoded);
  }

  // ── Câmera ────────────────────────────────────────────────────────────────

  /** Inicializa a câmera (Física). */
  public static startVideoRecording(
    videoElem: HTMLVideoElement | null
  ): void {
    if (!videoElem) return;
    WONService.physical.startCamera(videoElem);
  }

  // ── Símbolos de controle — chamado diretamente pelo ModulationModal ───────

  /**
   * Exibe um símbolo de cor sólida no canvas (sync/guarda/fim).
   * Usado pelo ModulationModal antes do início da transmissão.
   */
  public static drawConfigSymbol(color: string): void {
    WONService.physical.drawControlSymbol(color);
  }
}

// ─── Utilitário ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
