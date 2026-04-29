<template>
  <div class="main-content">
    <!-- Modulation Modal -->
    <ModulationModal
      :data="modulationModal.data"
      @close="modulationModal.close"
      @cancel="modulationModal.close"
      v-model:open="modulationModal.visible"
      v-if="modulationModal.visible && modulationModal.data"
    />

    <!-- App Mode -->
    <div class="content__mode-container">
      <span>Modo do dispositivo</span>
      <a-segmented
        v-model:value="networkMode"
        :options="[
          { label: 'Transmissor', value: 'modulation' },
          { label: 'Receptor', value: 'demodulation' },
        ]"
      />
    </div>

    <!-- Modulation (Transmitter) -->
    <div class="content__modulation" v-show="networkMode === 'modulation'">
      <a-form
        ref="modulationFormRef"
        layout="vertical"
        :model="dataForm"
        :rules="{
          payload: [
            {
              required: true,
              trigger: 'change',
              message: 'Digite uma mensagem para transmitir.',
            },
          ],
        }"
      >
        <a-form-item
          name="modulation"
          label="Formato de modulação:"
          tooltip="Selecione quantos bits por símbolo serão usados na comunicação."
        >
          <a-select
            v-model:value="dataForm.modulation"
            :options="[
              { label: '1 bit/símbolo', value: '1' },
              { label: '2 bits/símbolo', value: '2' },
              { label: '4 bits/símbolo', value: '4' },
              { label: '16 bits/símbolo', value: '16' },
              { label: '64 bits/símbolo', value: '64' },
            ]"
          />
        </a-form-item>

        <a-form-item
          name="payload"
          label="Mensagem para transmitir:"
          tooltip="Digite o texto que deseja enviar."
        >
          <a-textarea
            showCount
            allowClear
            :autoSize="{ minRows: 4, maxRows: 6 }"
            :maxlength="300"
            v-model:value="dataForm.payload"
            placeholder="Digite a mensagem aqui..."
          />
        </a-form-item>

        <a-form-item>
          <a-button block size="large" @click="showStats = true">
            <template #icon><BarChartOutlined /></template>
            Ver Estatísticas de Transmissão
          </a-button>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            block
            size="large"
            @click.prevent="onStartTransmission"
          >
            <template #icon><PlayCircleOutlined /></template>
            Iniciar Transmissão
          </a-button>
        </a-form-item>
      </a-form>

      <!-- Modal de estatísticas -->
      <a-modal
        v-model:open="showStats"
        title="Estatísticas de Transmissão"
        :footer="null"
      >
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="Mensagem">
            {{ dataForm.payload || '—' }}
          </a-descriptions-item>
          <a-descriptions-item label="Bits por símbolo">
            {{ txStats.bitsPerSymbol }}
          </a-descriptions-item>
          <a-descriptions-item label="Total de bits">
            {{ txStats.totalBits }}
          </a-descriptions-item>
          <a-descriptions-item label="Quadros de dados">
            {{ txStats.dataFrames }}
          </a-descriptions-item>
          <a-descriptions-item label="Quadros de controle">
            {{ txStats.controlFrames }}
          </a-descriptions-item>
          <a-descriptions-item label="Total de quadros">
            {{ txStats.totalFrames }}
          </a-descriptions-item>
          <a-descriptions-item label="Tempo por quadro">
            {{ txStats.timePerFrameMs }} ms
          </a-descriptions-item>
          <a-descriptions-item label="Tempo estimado">
            {{ txStats.estimatedTimeSec }} s
          </a-descriptions-item>
          <a-descriptions-item label="Binário">
            <span class="stats__binary">{{ txStats.binaryPreview }}</span>
          </a-descriptions-item>
        </a-descriptions>
      </a-modal>
    </div>

    <!-- Demodulation (Receiver) -->
    <div class="content__demodulation" v-show="networkMode === 'demodulation'">
      <!-- State Header -->
      <div class="demodulation__header">
        <h3>{{ getDemodulationStateLabel() }}</h3>

        <a-space wrap>
          <a-button
            type="primary"
            :icon="h(ReloadOutlined)"
            @click="handleClearSyncPoints()"
            v-if="demodulationData.state === 'sync'"
            :disabled="demodulationData.points.length === 0"
          >
            Limpar pontos
          </a-button>

          <a-button
            type="primary"
            :icon="h(PlayCircleOutlined)"
            @click="handleStartDemodule()"
            v-if="demodulationData.state === 'sync'"
            :disabled="demodulationData.points.length !== 2"
          >
            Iniciar Demodulação
          </a-button>

          <a-button
            v-if="demodulationData.state !== 'sync'"
            type="default"
            :icon="h(ReloadOutlined)"
            @click="handleResetDemodule()"
          >
            Reiniciar
          </a-button>
        </a-space>
      </div>

      <!-- Video Feed with Canvas Overlay -->
      <div class="demodulation__video">
        <video ref="videoElem" autoplay playsinline muted></video>
        <canvas
          width="640"
          height="480"
          ref="syncCanvas"
          @click="handleSignalSyncClick"
          @touchstart.prevent="handleSignalSyncTouch"
          class="video__sync-canvas"
          :class="{
            'video__sync-canvas--active': demodulationData.state === 'sync',
          }"
        ></canvas>
        <canvas
          width="640"
          height="480"
          ref="videoCanvas"
          style="display: none"
        ></canvas>

        <!-- Sync points indicator -->
        <div
          class="video__points-badge"
          v-if="demodulationData.state === 'sync'"
        >
          {{ demodulationData.points.length }}/2 pontos
        </div>
      </div>

      <!-- Result / Output -->
      <div
        class="demodulation__text"
        :class="{
          'demodulation__text--result': demodulationData.state === 'finished',
        }"
      >
        <LoadingOutlined
          v-if="demodulationData.state === 'running'"
          :style="{ fontSize: '36px', color: '#2e5eaa' }"
        />
        <template v-else-if="demodulationData.state === 'finished'">
          <CheckCircleFilled class="result-icon" />
          <span class="result-label">Mensagem recebida</span>
          <span class="result-text">{{
            demodulationData.output || "(sem conteúdo)"
          }}</span>
        </template>
        <template v-else>
          <span class="placeholder-text" v-if="!demodulationData.output">
            A mensagem decodificada aparecerá aqui.
          </span>
          <span v-else>{{ demodulationData.output }}</span>
        </template>
      </div>

      <!-- RX Log Panel -->
      <div
        class="demodulation__log"
        v-if="
          demodulationData.state === 'running' ||
          demodulationData.state === 'finished'
        "
      >
        <a-collapse v-model:activeKey="rxLogActiveKey" :bordered="false">
          <!-- Sinais Detectados -->
          <a-collapse-panel key="signals" header="Sinais Detectados">
            <div class="log__signals" ref="signalsContainer">
              <div
                v-for="(event, i) in rxLog.events"
                :key="i"
                class="log__signal-item"
                :class="getSignalClass(event.color)"
              >
                <span class="signal__time"
                  >[{{ formatTime(event.timestamp) }}]</span
                >
                <span
                  class="signal__dot"
                  :class="getSignalClass(event.color)"
                ></span>
                <span class="signal__label">{{ getSignalLabel(event) }}</span>
                <span
                  class="signal__bits"
                  v-if="event.bits && event.bits.length"
                >
                  → [{{ event.bits.join(", ") }}]
                </span>
              </div>
              <div v-if="rxLog.events.length === 0" class="log__empty">
                Aguardando sinais...
              </div>
            </div>
          </a-collapse-panel>

          <!-- Bits Reconstruídos -->
          <a-collapse-panel key="bits" header="Bits Reconstruídos">
            <div class="log__bytes">
              <div
                v-for="(byte, i) in rxByteGroups"
                :key="i"
                class="log__byte-item"
                :class="{ 'log__byte-item--partial': !byte.complete }"
              >
                <span class="byte__bits">{{ byte.bitsStr }}</span>
                <span class="byte__arrow">→</span>
                <span class="byte__char" v-if="byte.complete"
                  >'{{ byte.char }}'</span
                >
                <span class="byte__partial" v-else>(parcial…)</span>
              </div>
              <div v-if="rxByteGroups.length === 0" class="log__empty">
                Nenhum bit coletado ainda.
              </div>
            </div>
          </a-collapse-panel>

          <!-- Mensagem sendo decodificada -->
          <a-collapse-panel key="message" header="Mensagem sendo decodificada">
            <div class="log__message">
              <span class="message__text">{{
                rxLog.partialMessage || "…"
              }}</span>
              <span
                class="message__cursor"
                v-if="demodulationData.state === 'running'"
                >█</span
              >
            </div>
          </a-collapse-panel>
        </a-collapse>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ModulationModal from "./ModulationModal.vue";

import {
  ref,
  reactive,
  computed,
  toRaw,
  onMounted,
  nextTick,
  watch,
  h,
} from "vue";
import {
  PlayCircleOutlined,
  ReloadOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  BarChartOutlined,
} from "@ant-design/icons-vue";

import IConnectionData from "../interfaces/IConnectionData";
import type { RxLogEvent } from "../interfaces/RxLogEvent";
import WONService from "../services/WONService";
import { TransportLayer } from "../layers/TransportLayer";
import { LinkLayer } from "../layers/LinkLayer";

onMounted(() => {
  WONService.startVideoRecording(videoElem.value);
});

const networkMode = ref<"modulation" | "demodulation">("modulation");

const modulationFormRef = ref<any>(null);
const videoElem = ref<HTMLVideoElement | null>(null);
const syncCanvas = ref<HTMLCanvasElement | null>(null);
const videoCanvas = ref<HTMLCanvasElement | null>(null);

const dataForm = reactive<IConnectionData>({
  modulation: "2",
  payload: "",
});

const showStats = ref(false);

const txStats = computed(() => {
  const bitsPerSymbol = parseInt(dataForm.modulation, 10);
  const transport = new TransportLayer();
  const link = new LinkLayer();
  const bits = dataForm.payload ? transport.encode(dataForm.payload) : "";
  const frames = bits ? link.buildFrameSequence(bits, bitsPerSymbol) : [];
  const dataFrames = frames.filter((f) => f.type === "data").length;
  const controlFrames = frames.length - dataFrames;
  const timePerFrameMs = LinkLayer.SYMBOL_LIFE_MS;
  const estimatedTimeSec = ((frames.length * timePerFrameMs) / 1000).toFixed(1);

  const bytes: string[] = [];
  for (let i = 0; i < bits.length && i < 64; i += 8) {
    bytes.push(bits.slice(i, i + 8));
  }
  const binaryPreview = bytes.join(" ") + (bits.length > 64 ? " ..." : "");

  return {
    bitsPerSymbol,
    totalBits: bits.length,
    dataFrames,
    controlFrames,
    totalFrames: frames.length,
    timePerFrameMs,
    estimatedTimeSec,
    binaryPreview,
  };
});

const modulationModal = reactive({
  visible: false,
  data: null as null | IConnectionData,
  open: (data: IConnectionData) => {
    modulationModal.data = data;
    modulationModal.visible = true;
  },
  close: () => {
    modulationModal.data = null;
    modulationModal.visible = false;
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  },
});

const demodulationData = reactive({
  output: "" as string | null,
  points: [] as { x: number; y: number }[],
  state: "sync" as "sync" | "running" | "finished",
});

const rxLogActiveKey = ref<string[]>(["signals", "bits", "message"]);
const signalsContainer = ref<HTMLDivElement | null>(null);

const rxLog = reactive({
  events: [] as RxLogEvent[],
  allBits: [] as number[],
  partialMessage: "",
});

const MAX_LOG_EVENTS = 80;

const rxByteGroups = computed(() => {
  const groups: { bitsStr: string; char: string; complete: boolean }[] = [];
  for (let i = 0; i < rxLog.allBits.length; i += 8) {
    const chunk = rxLog.allBits.slice(i, i + 8);
    const complete = chunk.length === 8;
    const bitsStr = chunk.join("").padEnd(8, "_");
    const char = complete
      ? String.fromCharCode(parseInt(chunk.join(""), 2))
      : "";
    groups.push({ bitsStr, char, complete });
  }
  return groups;
});

watch(
  () => rxLog.events.length,
  async () => {
    await nextTick();
    if (signalsContainer.value) {
      signalsContainer.value.scrollTop = signalsContainer.value.scrollHeight;
    }
  },
);

function onRxEvent(event: RxLogEvent) {
  if (event.type === "signal" || event.type === "bits") {
    rxLog.events.push(event);
    if (rxLog.events.length > MAX_LOG_EVENTS) {
      rxLog.events.splice(0, rxLog.events.length - MAX_LOG_EVENTS);
    }
  }
  if (event.allBits) {
    rxLog.allBits = [...event.allBits];
  }
  if (event.partialMessage !== undefined) {
    rxLog.partialMessage = event.partialMessage;
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const msRem = ms % 1000;
  return `${String(s).padStart(2, "0")}:${String(msRem).padStart(3, "0")}`;
}

function getSignalLabel(event: RxLogEvent): string {
  if (event.type === "decode") return "Decodificação concluída";
  const color = event.color;
  if (color === "blue") return "GUARD (Azul) — aguardando próximo símbolo";
  if (color === "white") return "FIM (Branco) — transmissão encerrada";
  if (color === "red") return "DADO (Vermelho) — bit 0";
  if (color === "green") return "DADO (Verde) — bit 1";
  return `Sinal: ${color ?? "desconhecido"}`;
}

function getSignalClass(color?: string | null): string {
  if (color === "blue") return "signal--guard";
  if (color === "white") return "signal--end";
  if (color === "red" || color === "green") return "signal--data";
  return "";
}

function getDemodulationStateLabel() {
  switch (demodulationData.state) {
    case "sync":
      return demodulationData.points.length < 2
        ? "Toque na diagonal da tela do transmissor para enquadrar o sinal (2 pontos)."
        : 'Pontos selecionados. Clique em "Iniciar Demodulação".';
    case "running":
      return "Reconhecimento de símbolos em andamento…";
    case "finished":
      return "Transmissão concluída!";
  }
}

async function onStartTransmission() {
  if (!modulationFormRef.value) return;

  modulationFormRef.value
    .validate()
    .then(() => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      modulationModal.open(toRaw(dataForm));
    })
    .catch((error: Error) => {
      console.log("validation error", error);
    });
}

async function handleStartDemodule() {
  demodulationData.state = "running";
  rxLog.events = [];
  rxLog.allBits = [];
  rxLog.partialMessage = "";

  WONService.startDemodulation(
    Number(dataForm.modulation),
    videoElem.value,
    calcCoordByPoints(),
    onRxEvent,
  )
    .then((output) => {
      demodulationData.state = "finished";
      demodulationData.output = output || null;
    })
    .catch((error) => {
      console.error("Error on demodulation", error);
      demodulationData.state = "sync";
    });
}

function handleResetDemodule() {
  demodulationData.state = "sync";
  demodulationData.output = "";
  rxLog.events = [];
  rxLog.allBits = [];
  rxLog.partialMessage = "";
  WONService.demoRunning = false;
  handleClearSyncPoints();
}

function handleClearSyncPoints() {
  demodulationData.points = [];
  drawRectangle();
}

function calcCoordByPoints(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const [p1, p2, p3, p4] = getRectangleVertices();

  const x = Math.min(p1.x, p2.x, p3.x, p4.x);
  const y = Math.min(p1.y, p2.y, p3.y, p4.y);
  const width = Math.max(p1.x, p2.x, p3.x, p4.x) - x;
  const height = Math.max(p1.y, p2.y, p3.y, p4.y) - y;

  return {
    x: Number(x),
    y: Number(y),
    width: Number(width),
    height: Number(height),
  };
}

function getScaledCoords(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (!syncCanvas.value) return { x: 0, y: 0 };

  const rect = syncCanvas.value.getBoundingClientRect();
  const scaleX = syncCanvas.value.width / rect.width;
  const scaleY = syncCanvas.value.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function addSyncPoint(x: number, y: number) {
  if (demodulationData.points.length < 2) {
    demodulationData.points.push({ x, y });
    drawRectangle();
  }
}

function handleSignalSyncClick(event: MouseEvent) {
  const { x, y } = getScaledCoords(event.clientX, event.clientY);
  addSyncPoint(x, y);
}

function handleSignalSyncTouch(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  const { x, y } = getScaledCoords(touch.clientX, touch.clientY);
  addSyncPoint(x, y);
}

const drawRectangle = () => {
  if (!syncCanvas.value) return;

  const context = syncCanvas.value.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, syncCanvas.value.width, syncCanvas.value.height);

  if (demodulationData.points.length === 0) return;

  // Draw individual points when only one is selected
  if (demodulationData.points.length === 1) {
    const [p] = demodulationData.points;
    context.fillStyle = "rgba(46, 94, 170, 0.8)";
    context.beginPath();
    context.arc(p.x, p.y, 8, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.stroke();
    return;
  }

  const [point1, point2] = demodulationData.points;

  const topLeft = {
    x: Math.min(point1.x, point2.x),
    y: Math.min(point1.y, point2.y),
  };
  const bottomRight = {
    x: Math.max(point1.x, point2.x),
    y: Math.max(point1.y, point2.y),
  };
  const topRight = { x: bottomRight.x, y: topLeft.y };
  const bottomLeft = { x: topLeft.x, y: bottomRight.y };

  // Shaded overlay outside the selection
  context.fillStyle = "rgba(0,0,0,0.35)";
  context.fillRect(0, 0, syncCanvas.value.width, syncCanvas.value.height);
  context.clearRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );

  // Red border
  context.strokeStyle = "#ff4d4f";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(topLeft.x, topLeft.y);
  context.lineTo(topRight.x, topRight.y);
  context.lineTo(bottomRight.x, bottomRight.y);
  context.lineTo(bottomLeft.x, bottomLeft.y);
  context.closePath();
  context.stroke();

  // Corner dots
  const vertices = [topLeft, topRight, bottomRight, bottomLeft];
  context.fillStyle = "#2e5eaa";
  vertices.forEach(({ x, y }) => {
    context.beginPath();
    context.arc(x, y, 6, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = "white";
    context.lineWidth = 1.5;
    context.stroke();
  });
};

const getRectangleVertices = () => {
  const [point1, point2] = demodulationData.points;

  const topLeft = {
    x: Math.min(point1.x, point2.x),
    y: Math.min(point1.y, point2.y),
  };
  const bottomRight = {
    x: Math.max(point1.x, point2.x),
    y: Math.max(point1.y, point2.y),
  };
  const topRight = { x: bottomRight.x, y: topLeft.y };
  const bottomLeft = { x: topLeft.x, y: bottomRight.y };

  return [topLeft, topRight, bottomRight, bottomLeft];
};
</script>

<style scoped lang="scss">
.main-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  align-items: center;

  .content__mode-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;

    span {
      font-size: 1.25rem;
      font-weight: bold;
    }
  }

  .content__modulation {
    width: min(600px, 100%);
  }

  .content__demodulation {
    width: min(640px, 100%);
    display: flex;
    flex-direction: column;
    gap: 16px;

    .demodulation__header {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      justify-content: center;
      text-align: center;

      h3 {
        font-size: 0.95rem;
        font-weight: 600;
        color: #444;
        margin: 0;
        line-height: 1.4;
      }
    }

    .demodulation__video {
      width: 100%;
      aspect-ratio: 4 / 3;
      position: relative;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);

      video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .video__sync-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        touch-action: none;

        &--active {
          cursor: crosshair;
        }
      }

      .video__points-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 12px;
        pointer-events: none;
      }
    }

    .demodulation__text {
      width: 100%;
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      text-align: center;
      padding: 14px 16px;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      background: #fafafa;
      overflow-y: auto;
      transition: all 0.3s ease;

      .placeholder-text {
        color: #aaa;
        font-style: italic;
      }

      &--result {
        flex-direction: column;
        gap: 8px;
        border-color: #52c41a;
        background-color: #f6ffed;
        padding: 20px 16px;

        .result-icon {
          font-size: 32px;
          color: #52c41a;
        }

        .result-label {
          font-size: 0.75rem;
          color: #389e0d;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .result-text {
          font-size: 1.15rem;
          font-weight: 700;
          color: #1a1a1a;
          word-break: break-word;
          max-width: 100%;
          line-height: 1.5;
        }
      }
    }
  }

  .demodulation__log {
    width: 100%;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    overflow: hidden;

    .log__signals {
      max-height: 200px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.78rem;
      font-family: monospace;
    }

    .log__signal-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 4px;
      background: #fafafa;

      .signal__time {
        color: #999;
        flex-shrink: 0;
      }

      .signal__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #ccc;

        &.signal--guard {
          background: #1677ff;
        }
        &.signal--end {
          background: #888;
          border: 1px solid #ccc;
        }
        &.signal--data {
          background: #52c41a;
        }
      }

      .signal__label {
        color: #444;
        flex: 1;
      }

      .signal__bits {
        color: #52c41a;
        flex-shrink: 0;
      }
    }

    .log__bytes {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.78rem;
      font-family: monospace;
      max-height: 180px;
      overflow-y: auto;
    }

    .log__byte-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 6px;
      background: #fafafa;
      border-radius: 4px;

      .byte__bits {
        color: #1677ff;
        letter-spacing: 0.05em;
      }

      .byte__arrow {
        color: #aaa;
      }

      .byte__char {
        color: #389e0d;
        font-weight: bold;
      }

      .byte__partial {
        color: #bbb;
        font-style: italic;
      }

      &--partial {
        opacity: 0.6;
      }
    }

    .log__message {
      font-family: monospace;
      font-size: 1rem;
      font-weight: 600;
      color: #1a1a1a;
      word-break: break-all;
      letter-spacing: 0.03em;

      .message__cursor {
        animation: blink 1s step-end infinite;
        color: #1677ff;
      }
    }

    .log__empty {
      color: #bbb;
      font-style: italic;
      font-size: 0.78rem;
      padding: 4px 0;
    }
  }

  @media (max-width: 600px) {
    padding: 16px 12px;
    gap: 16px;

    .content__mode-container span {
      font-size: 1rem;
    }

    .content__demodulation {
      .demodulation__header h3 {
        font-size: 0.85rem;
      }
    }
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
