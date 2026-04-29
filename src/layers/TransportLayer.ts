/**
 * Camada de Transporte — WON
 *
 * Responsável pela transformação semântica dos dados:
 *  TX  – converte texto (string) em fluxo contínuo de bits (binary string)
 *  RX  – junta os segmentos de bits recebidos da camada de Enlace e
 *         reconstrói o texto original
 *
 * Cada caractere é representado por 8 bits (ASCII / Latin-1).
 */
export class TransportLayer {
  // ── TX ────────────────────────────────────────────────────────────────────

  /** Codifica texto em fluxo de bits (uma string de '0' e '1'). */
  encode(text: string): string {
    return text
      .split("")
      .map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
      .join("");
  }

  // ── RX ────────────────────────────────────────────────────────────────────

  /**
   * Decodifica o fluxo de bits acumulado pela camada de Enlace de volta
   * para texto legível.
   */
  decode(binaryString: string): string {
    const bytes = binaryString.match(/.{8}/g) ?? [];
    return bytes
      .map((byte) => String.fromCharCode(parseInt(byte, 2)))
      .join("");
  }
}
