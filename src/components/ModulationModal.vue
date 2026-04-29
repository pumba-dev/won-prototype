<template>
  <a-modal destroyOnClose width="100%" wrap-class-name="modulation-modal">
    <!-- Header — oculto durante transmissão para maximizar a área do canvas -->
    <div class="modal__header" v-if="mode === 'sync'">
      <h1>Sincronização de Transmissão</h1>
      <h3>Modulação: {{ props.data.modulation }} bits/símbolo</h3>
    </div>

    <div class="modal__body">
      <div
        class="body__transmitter"
        :class="{ 'body__transmitter--full': mode === 'progress' }"
        id="body__transmitter"
      >
        <canvas id="transmitter-symbol"></canvas>
      </div>
    </div>

    <template #footer>
      <div class="modal__footer">
        <a-button
          v-if="mode === 'sync'"
          key="start"
          type="primary"
          size="large"
          block
          @click="handleStartTransmission()"
        >
          <template #icon><PlayCircleOutlined /></template>
          Iniciar Transmissão
        </a-button>

        <a-button
          v-if="mode === 'progress'"
          key="fullscreen"
          size="large"
          block
          @click="handleToggleFullscreen()"
        >
          <template #icon>
            <FullscreenExitOutlined v-if="isFullscreen" />
            <FullscreenOutlined v-else />
          </template>
          {{ isFullscreen ? 'Sair do Fullscreen' : 'Fullscreen' }}
        </a-button>

        <a-button key="submit" size="large" block danger @click="handleCloseTransmission()">
          <template #icon><CloseCircleOutlined /></template>
          Encerrar Conexão
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import {
  PlayCircleOutlined,
  CloseCircleOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons-vue";

import IConnectionData from "../interfaces/IConnectionData";
import { onMounted, onUnmounted, ref } from "vue";
import WONService from "../services/WONService";

interface Props {
  data: IConnectionData;
}

const props = defineProps<Props>();
const emit = defineEmits(["close"]);

const mode = ref<"sync" | "progress">("sync");
const isFullscreen = ref(false);

onMounted(() => {
  handleStartSync();
  document.addEventListener("fullscreenchange", onFullscreenChange);
});

onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
});

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

function handleStartSync() {
  mode.value = "sync";
  WONService.drawConfigSymbol("#0000FF");
}

function handleStartTransmission() {
  mode.value = "progress";
  // Tenta fullscreen ao iniciar transmissão
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  WONService.startModulation(props.data.payload, props.data.modulation);
}

function handleToggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function handleCloseTransmission() {
  WONService.moduRunning = false;
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  emit("close");
}
</script>

<style lang="scss">
.modulation-modal {
  .ant-modal-content {
    background-color: black;
  }

  .modal__header {
    width: 100%;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: white;
    background-color: black;

    h1 {
      font-size: 1.1rem;
      font-weight: bold;
      color: white;
      margin: 0;
    }

    h3 {
      font-size: 0.85rem;
      color: #aaa;
      margin: 0;
    }
  }

  .modal__body {
    width: 100%;
    height: calc(100% - 50px);
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: black;

    .body__transmitter {
      width: 80%;
      height: 80%;
      overflow: hidden;
      border-radius: 4px;
      border: 1px solid #333;
      transition: width 0.2s ease, height 0.2s ease, border-radius 0.2s ease;

      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      &--full {
        width: 100%;
        height: 100%;
        border-radius: 0;
        border: none;
      }
    }
  }

  .modal__footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 0;
    background-color: black;

    .ant-btn {
      margin: 0 !important;
    }
  }

  // Full-viewport modal
  .ant-modal {
    max-width: 100%;
    top: 0;
    margin: 0;
    padding-bottom: 0;
  }

  .ant-modal-content {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .ant-modal-body {
    flex: 1;
    overflow: hidden;
    padding: 8px;
    background-color: black;
  }

  .ant-modal-footer {
    background-color: black;
    border-top: 1px solid #222;
    padding: 10px 16px;
  }
}
</style>
