# Enlace Óptico Sem Fio (WON Prototype)

![GitHub repo size](https://img.shields.io/github/repo-size/pumba-dev/wireless-optical-network-prototype?style=for-the-badge)
![GitHub language count](https://img.shields.io/github/languages/count/pumba-dev/wireless-optical-network-prototype?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/pumba-dev/wireless-optical-network-prototype?style=for-the-badge)
![GitHub forks](https://img.shields.io/github/forks/pumba-dev/wireless-optical-network-prototype?style=for-the-badge)
![Bitbucket open pull requests](https://img.shields.io/github/issues-pr/pumba-dev/wireless-optical-network-prototype?style=for-the-badge)

![Página Inicial da Aplicação Web](./src/assets/homepage.png)

> Prototipagem de um enlace óptico sem fio utilizando um monitor como transmissor e uma câmera como receptor. O objetivo é experimentar os desafios da camada física na transmissão de dados e identificar técnicas para mitigar seus efeitos. Mais informações no relatório [Protótipo de Rede WON](./src/assets/Protótipo%20de%20Rede%20WON.pdf).

---

## Tecnologias

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vue](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vue.js&logoColor=4FC08D)
![SASS](https://img.shields.io/badge/Sass-CC6699?style=for-the-badge&logo=sass&logoColor=white)
![Ant Design](https://img.shields.io/badge/Ant%20Design-1890FF?style=for-the-badge&logo=antdesign&logoColor=white)

---

## Como Funciona

O sistema transmite mensagens de texto de um dispositivo para outro **visualmente**, usando cores exibidas na tela como canal de comunicação. O transmissor (TX) exibe sequências de quadros coloridos no monitor; o receptor (RX) captura esses quadros pela câmera e reconstrói a mensagem original.

O protocolo é organizado em **quatro camadas**, cada uma com responsabilidades bem definidas, inspiradas no modelo OSI:

```text
┌─────────────────────────────────────────────────────┐
│  Camada 4 — Aplicação   (ApplicationLayer.ts)       │
│  Prepara e formata a mensagem do usuário             │
├─────────────────────────────────────────────────────┤
│  Camada 3 — Transporte  (TransportLayer.ts)          │
│  Converte texto ↔ fluxo binário (ASCII 8 bits)       │
├─────────────────────────────────────────────────────┤
│  Camada 2 — Enlace      (LinkLayer.ts)               │
│  Divide bits em quadros com protocolo de controle    │
├─────────────────────────────────────────────────────┤
│  Camada 1 — Física      (PhysicalLayer.ts)           │
│  Renderiza quadros no canvas / captura pela câmera   │
└─────────────────────────────────────────────────────┘
```

---

## Arquitetura de Camadas

### Camada 4 — Aplicação

**Responsabilidade:** fronteira entre o usuário e o protocolo.

- **TX:** recebe o texto digitado e o repassa sem modificações para a camada de transporte.
- **RX:** aplica `trim()` na mensagem reconstruída antes de exibir ao usuário.

Esta camada é um ponto de extensão: filtros, compressão ou recodificação de caracteres (UTF-8) poderiam ser adicionados aqui sem alterar as camadas inferiores.

---

### Camada 3 — Transporte

**Responsabilidade:** representar a mensagem como um fluxo de bits.

**Codificação (TX):**

Cada caractere é convertido para seu código ASCII e representado em 8 bits:

```text
"A"  →  65  →  "01000001"
"AB" →  "0100000101000010"
```

**Decodificação (RX):**

O fluxo binário é fatiado em grupos de 8 bits; cada grupo é interpretado como um código ASCII:

```text
"01000001 01000010" → [65, 66] → "AB"
```

Grupos com menos de 8 bits são descartados (bits perdidos na transmissão).

---

### Camada 2 — Enlace

**Responsabilidade:** estruturar o fluxo de bits em quadros e controlar a sincronização.

#### Tipos de Quadro

| Tipo    | Cor              | Hex       | Propósito                        |
|---------|------------------|-----------|----------------------------------|
| `data`  | Vermelho / Verde | —         | Carrega bits de dados            |
| `guard` | Azul             | `#0000FF` | Separador entre quadros de dados |
| `end`   | Branco           | `#ffffff` | Sinaliza fim da transmissão      |
| `sync`  | Azul             | `#0000FF` | Inicialização da sincronização   |

#### Protocolo de Transmissão (TX)

O fluxo de bits é dividido em grupos de N bits (definido pela modulação) e encapsulado na seguinte sequência:

```text
[sync] [guard] [data₁] [guard] [data₂] [guard] ... [dataN] [end]
```

Cada quadro de dados é exibido por **1000 ms** no monitor. Quadros `guard` e `end` são exibidos pelo mesmo período para garantir que a câmera os detecte.

Exemplo para a mensagem `"Hi"` com modulação de 4 bits/símbolo:

```text
bits:     0 1 0 0 1 0 0 0 0 1 1 0 1 0 0 0
frames:   [0100] guard [1000] guard [0110] guard [1000] end
```

#### Máquina de Estados do Receptor (RX)

O receptor mantém um estado com três variáveis:

```typescript
{
  awaitingNewSymbol: boolean,  // aguardando próximo quadro de dados?
  collectedBits: number[],     // bits acumulados
  done: boolean                // quadro "end" detectado?
}
```

Transições de estado ao receber cada cor detectada:

```text
Cor azul (guard)  →  awaitingNewSymbol = true   (pronto para o próximo dado)
Cor vermelha/verde + awaitingNewSymbol = true
                  →  acumula bits, awaitingNewSymbol = false
Cor vermelha/verde + awaitingNewSymbol = false
                  →  ignora (mesmo símbolo ainda na tela)
Cor branca (end)  →  done = true                (encerra a recepção)
```

Essa lógica garante que cada quadro de dados seja lido **exatamente uma vez**, mesmo que a câmera capture múltiplos frames do mesmo símbolo.

---

### Camada 1 — Física

**Responsabilidade:** converter quadros em imagens visuais (TX) e processar os frames da câmera (RX).

#### Representação dos Bits

Cada bit é representado por uma cor sólida em um retângulo na tela:

| Bit | Cor      | Hex       |
|-----|----------|-----------|
| `0` | Vermelho | `#FF0000` |
| `1` | Verde    | `#00FF00` |

#### Modulação

A modulação define quantos bits são transmitidos por símbolo (quadro de dados), organizando o canvas em uma grade N×N:

| Modulação | Grade  | Bits/símbolo |
|-----------|--------|--------------|
| 1         | 1×1    | 1            |
| 2         | 1×2    | 2            |
| 4         | 2×2    | 4            |
| 9         | 3×3    | 9            |
| 16        | 4×4    | 16           |

Uma **borda de guarda de 35 px** em torno de toda a grade serve como margem de segurança para o processamento de imagem no receptor.

#### Captura e Processamento (RX)

A câmera captura continuamente o canvas do transmissor. A cada ciclo de captura:

1. O frame de vídeo é recortado na região do sinal.
2. O `ImageData` é enviado a um **Web Worker** para processamento sem bloquear a UI.
3. O Worker retorna a cor central (detecta `guard`/`end`) e as cores de cada retângulo da grade (detecta bits).
4. O resultado é passado para a camada de enlace.

---

## Ruído Sal e Pimenta — Problema e Solução

### O Problema

Em sistemas de transmissão óptica, o sensor da câmera introduz **ruído de impulso** (salt-and-pepper): pixels aleatórios aparecem com valores extremos (branco puro ou preto puro) independentemente da cor real da cena. Esse ruído prejudica a detecção das cores e pode causar erros na leitura dos bits.

```text
Pixel real:    R=0,   G=200, B=0   (verde → bit 1 ✓)
Pixel ruidoso: R=255, G=255, B=255 (branco → "end" ✗)
```

### A Solução: Filtro de Mediana

O projeto implementa um **filtro de mediana** no Web Worker (`src/workers/pixelProcessor.worker.ts`) para remover o ruído antes da detecção de cores.

**Algoritmo:**

Para cada pixel da imagem, o filtro:

1. Coleta os valores RGB de todos os pixels em uma janela de **4×4 pixels** ao redor do pixel atual.
2. Ordena os valores de cada canal separadamente.
3. Substitui o valor do pixel pelo **valor mediano** da janela.

```text
Vizinhança 4×4 do canal Verde (valores ordenados):
[0, 0, 185, 190, 195, 198, 200, 200, 201, 202, 203, 205, 207, 210, 212, 255]
                                         ↑ mediana ≈ 200  (ruído removido)
```

**Por que o filtro de mediana funciona:**

- O ruído "sal" (255) se posiciona nas extremidades da lista ordenada e é excluído.
- O ruído "pimenta" (0) também se posiciona nas extremidades e é excluído.
- O sinal verdadeiro (valores intermediários) domina a mediana e é preservado.
- Diferentemente do filtro de média, a mediana **não borra as bordas** entre regiões de cores diferentes, preservando a delimitação dos retângulos da grade.

**Configuração atual:**

| Parâmetro          | Valor | Descrição                              |
|--------------------|-------|----------------------------------------|
| `KERNEL_SIZE`      | 4     | Janela 4×4 pixels                      |
| `COLOR_THRESHOLD`  | 150   | Valor mínimo de canal para "cor ativa" |
| `PRE_PROCESS`      | true  | Filtro sempre habilitado               |

---

## Fluxo Completo de Dados

### Transmissão

```text
Usuário digita "Hi"
  ↓ [Aplicação]     prepareForTransmission()  →  "Hi"
  ↓ [Transporte]    encode()                  →  "0100100001101001"
  ↓ [Enlace]        buildFrameSequence(bits, 4) →
      [data: 0100] [guard] [data: 1000] [guard]
      [data: 0110] [guard] [data: 1001] [end]
  ↓ [Física]        drawDataSymbol() / drawControlSymbol()
      → Exibe grade colorida no canvas por 1000 ms/quadro
```

### Recepção

```text
Câmera captura o canvas
  ↓ [Física]    captureFrame()  →  ImageData recortado
  ↓ [Worker]    removeSaltAndPepperNoise()  →  imagem filtrada
                detectCenterColor()          →  "blue" | "white" | null
                detectRectangles()           →  [0,1,0,0]
  ↓ [Enlace]    processReceivedSymbol()
                  "blue"  →  awaitingNewSymbol = true
                  [0100]  →  acumula bits
                  "white" →  done = true
  ↓ [Transporte] decode()  →  "Hi"
  ↓ [Aplicação]  formatReceivedMessage()  →  "Hi"
      → Exibe mensagem recebida para o usuário
```

---

## Pré-requisitos

- [`Git`](https://git-scm.com/)
- [`Node.js 18+`](https://nodejs.org/)

## Instalação

```bash
git clone https://github.com/pumba-dev/wireless-optical-network-prototype.git
cd wireless-optical-network-prototype
npm install
```

## Executando

```bash
npm run dev
```

---

## Contribuindo

1. Faça um fork do repositório.
2. Crie uma branch: `git checkout -b minha-feature`.
3. Faça suas alterações e commit: `git commit -m 'feat: minha feature'`.
4. Envie para o fork: `git push origin minha-feature`.
5. Abra um Pull Request.

---

## Colaboradores

[![Pumba Dev](https://static.wikia.nocookie.net/disneypt/images/c/cf/It_means_no_worries.png/revision/latest?cb=20200128144126&path-prefix=pt)](https://github.com/pumba-dev)

**[Pumba Dev](https://github.com/pumba-dev)**

## Doações

[![PicPay](https://img.shields.io/badge/PicPay-%40PumbaDev%20-brightgreen)](https://picpay.me/pumbadev)
[![Nubank](https://img.shields.io/badge/Nubank-Pix%20QR%20Code-blueviolet)](https://nubank.com.br/pagar/1ou9f/ifu2K7YNO7)

## Licença

Copyright © 2024 Pumba Developer

[⬆ Voltar ao topo](#enlace-óptico-sem-fio-won-prototype)
