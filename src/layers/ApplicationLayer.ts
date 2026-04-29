/**
 * Camada de Aplicação — WON
 *
 * Representa a fronteira com o usuário:
 *  TX  – recebe o texto digitado e o prepara para a camada de Transporte
 *  RX  – recebe o texto decodificado da camada de Transporte e o formata
 *         para exibição na tela do receptor
 *
 * Em protocolo real esta camada lida com codificação de caracteres (UTF-8),
 * compressão, criptografia, etc. Aqui ela garante consistência de encoding
 * e serve de ponto de extensão futuro.
 */
export class ApplicationLayer {
  // ── TX ────────────────────────────────────────────────────────────────────

  /** Prepara o payload do usuário para ser entregue ao Transporte. */
  prepareForTransmission(text: string): string {
    return text;
  }

  // ── RX ────────────────────────────────────────────────────────────────────

  /** Formata a mensagem decodificada para exibição ao usuário. */
  formatReceivedMessage(rawText: string): string {
    return rawText.trim();
  }
}
