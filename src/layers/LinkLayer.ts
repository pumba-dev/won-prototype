/**
 * Camada de Enlace — WON
 *
 * Responsável pela estruturação dos dados em quadros (frames):
 *  TX  – recebe o fluxo de bits do Transporte, segmenta em símbolos de
 *         N bits e monta a sequência de quadros com o protocolo de controle
 *         (sync → [dados, guarda, dados, guarda, …] → fim)
 *
 *  RX  – mantém uma máquina de estados que interpreta cada símbolo recebido
 *         da camada Física, extrai os bits de dados e sinaliza fim de
 *         transmissão quando detecta o quadro de encerramento
 *
 * Quadros de controle:
 *  • sync  (#0000FF) — exibido antes do início da transmissão
 *  • guard (#0000FF) — separa quadros de dados consecutivos
 *  • end   (#ffffff) — sinaliza fim da mensagem completa
 *  Quadros de dados carregam os bits modulados (grade colorida).
 */

// ── Tipos de quadro ──────────────────────────────────────────────────────────

export type FrameType = "sync" | "guard" | "data" | "end";

export interface DataFrame {
  type: "data";
  bits: number[];
}

export interface ControlFrame {
  type: Exclude<FrameType, "data">;
}

export type Frame = DataFrame | ControlFrame;

// ── Estado da máquina RX ─────────────────────────────────────────────────────

export interface LinkRxState {
  /** Indica se o próximo símbolo colorido é um novo quadro de dados. */
  awaitingNewSymbol: boolean;
  /** Acumula todos os bits recebidos ao longo da transmissão. */
  collectedBits: number[];
  /** Sinalizado quando o quadro de fim é detectado. */
  done: boolean;
}

// ── Classe principal ─────────────────────────────────────────────────────────

export class LinkLayer {
  // ── Constantes de protocolo ────────────────────────────────────────────────

  /** Duração de cada símbolo em milissegundos. */
  static readonly SYMBOL_LIFE_MS = 1000;

  /** Cor do quadro de guarda / sync (azul). */
  static readonly GUARD_COLOR = "#0000FF";

  /** Cor do quadro de fim de mensagem (branco). */
  static readonly END_COLOR = "#ffffff";

  /** Cor do quadro de sincronização inicial (azul, igual ao guarda). */
  static readonly SYNC_COLOR = "#0000FF";

  /** Habilita recuperação de bits perdidos com valores aleatórios. */
  static readonly LOST_BIT_RECOVER = false;

  // ── TX ────────────────────────────────────────────────────────────────────

  /**
   * Segmenta o fluxo de bits em quadros e monta a sequência de transmissão:
   *   data[0] → guard → data[1] → guard → … → data[n] → guard → end
   *
   * O último chunk é preenchido com zeros à direita (padding) se necessário.
   */
  buildFrameSequence(bits: string, bitsPerSymbol: number): Frame[] {
    const total = Math.ceil(bits.length / bitsPerSymbol);
    const frames: Frame[] = [];

    for (let i = 0; i < total; i++) {
      const slice = bits
        .slice(i * bitsPerSymbol, (i + 1) * bitsPerSymbol)
        .padEnd(bitsPerSymbol, "0");

      frames.push({ type: "data", bits: slice.split("").map(Number) });
      frames.push({ type: "guard" });
    }

    frames.push({ type: "end" });
    return frames;
  }

  /** Retorna a cor de renderização de um quadro de controle. */
  getControlColor(type: Exclude<FrameType, "data">): string {
    switch (type) {
      case "sync":
        return LinkLayer.SYNC_COLOR;
      case "guard":
        return LinkLayer.GUARD_COLOR;
      case "end":
        return LinkLayer.END_COLOR;
    }
  }

  // ── RX ────────────────────────────────────────────────────────────────────

  /** Cria o estado inicial da máquina de estados receptora. */
  createRxState(): LinkRxState {
    return { awaitingNewSymbol: true, collectedBits: [], done: false };
  }

  /**
   * Processa o resultado de um símbolo recebido pela camada Física e
   * atualiza o estado da máquina de estados.
   *
   * Transições:
   *  blue   → aguarda próximo quadro de dados (guarda detectado)
   *  white  → transmissão encerrada (fim detectado)
   *  null/black → sem transição (símbolo não reconhecido)
   *  cores  → se awaitingNewSymbol, acumula bits; senão, ignora (mesmo símbolo)
   */
  processReceivedSymbol(
    color: string | null,
    rectangleColors: number[],
    state: LinkRxState,
    modulation: number,
  ): LinkRxState {
    if (color === "blue") {
      return { ...state, awaitingNewSymbol: true };
    }

    if (color === "white") {
      return { ...state, done: true };
    }

    if (!state.awaitingNewSymbol) {
      return state; // ainda no mesmo símbolo de dados, aguarda guarda
    }

    const recovered = this.recoverLostBits([...rectangleColors], modulation);
    return {
      awaitingNewSymbol: false,
      collectedBits: [...state.collectedBits, ...recovered],
      done: false,
    };
  }

  /** Converte o array de bits acumulado em string binária para o Transporte. */
  assembleBits(bits: number[]): string {
    return bits.join("");
  }

  /**
   * Complementa bits faltantes com valores aleatórios (se habilitado).
   * Útil quando a câmera não consegue ler todos os retângulos do símbolo.
   */
  recoverLostBits(bits: number[], expected: number): number[] {
    if (!LinkLayer.LOST_BIT_RECOVER || bits.length >= expected) return bits;
    while (bits.length < expected) bits.push(Math.round(Math.random()));
    return bits;
  }
}
