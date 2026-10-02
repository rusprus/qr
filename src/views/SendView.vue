<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import QRCode from 'qrcode'
import {
  buildFrames,
  encodeFilePayload,
  estimateTransfer,
  formatDuration,
} from '../utils/protocol'
import { settings, PRESETS } from '../utils/settings'

const mode = ref('text')
const text = ref('Привет! Это тестовое сообщение через QR.')
const fileName = ref('')
const fileMime = ref('')
/** @type {import('vue').Ref<Uint8Array | null>} */
const fileBytes = ref(null)
const fileInputRef = ref(null)

const running = ref(false)
const frameIndex = ref(0)
const frameTotal = ref(0)
const qrDataUrl = ref('')
const error = ref('')

let frames = []
let timer = null

const transferOpts = computed(() => ({
  chunkBytes: settings.chunkBytes,
  frameIntervalMs: settings.frameIntervalMs,
}))

const presetLabel = computed(() => {
  const preset = PRESETS.find((p) => p.id === settings.preset)
  return preset ? preset.name : 'Свои'
})

const fileMeta = computed(() => {
  if (!fileBytes.value) return null
  const est = estimateTransfer(fileBytes.value.length, transferOpts.value)
  return {
    sizeLabel: formatBytes(fileBytes.value.length),
    frames: est.frames,
    duration: formatDuration(est.seconds),
  }
})

function formatBytes(n) {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

function setMode(next) {
  if (running.value) return
  mode.value = next
  error.value = ''
}

function clearFile() {
  fileName.value = ''
  fileMime.value = ''
  fileBytes.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function onFileChange(event) {
  error.value = ''
  const file = event.target?.files?.[0]
  if (!file) {
    clearFile()
    return
  }
  if (file.size > settings.maxFileBytes) {
    clearFile()
    error.value = `Файл слишком большой. Максимум ${formatBytes(settings.maxFileBytes)}.`
    return
  }
  const buffer = await file.arrayBuffer()
  fileName.value = file.name
  fileMime.value = file.type || 'application/octet-stream'
  fileBytes.value = new Uint8Array(buffer)
}

async function renderFrame(index) {
  if (!frames.length) return
  const payload = JSON.stringify(frames[index])
  qrDataUrl.value = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 720,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

async function tick() {
  if (!frames.length) return
  frameIndex.value = (frameIndex.value + 1) % frames.length
  await renderFrame(frameIndex.value)
}

async function start() {
  error.value = ''
  let payload = ''

  if (mode.value === 'text') {
    const value = text.value.trim()
    if (!value) {
      error.value = 'Введите текст для передачи'
      return
    }
    payload = value
  } else {
    if (!fileBytes.value) {
      error.value = 'Выберите файл'
      return
    }
    if (fileBytes.value.length > settings.maxFileBytes) {
      error.value = `Файл слишком большой. Максимум ${formatBytes(settings.maxFileBytes)}.`
      return
    }
    payload = encodeFilePayload(fileName.value, fileMime.value, fileBytes.value)
  }

  stop()
  frames = buildFrames(payload, undefined, settings.chunkBytes)
  frameTotal.value = frames.length
  frameIndex.value = 0
  running.value = true
  await renderFrame(0)
  timer = window.setInterval(() => {
    tick().catch((err) => {
      error.value = err?.message || 'Ошибка генерации QR'
      stop()
    })
  }, settings.frameIntervalMs)
}

function stop() {
  running.value = false
  if (timer != null) {
    clearInterval(timer)
    timer = null
  }
}

onBeforeUnmount(stop)
</script>

<template>
  <main class="page">
    <div class="topbar">
      <router-link class="back" :to="{ name: 'home' }">← Назад</router-link>
      <router-link class="settings-link" :to="{ name: 'settings' }">Настройки</router-link>
    </div>
    <h1 class="brand">Показать QR</h1>
    <p class="lede">
      Текст или файл нарезается на кадры.
      Режим: <strong>{{ presetLabel }}</strong>
      ({{ (1000 / settings.frameIntervalMs).toFixed(1) }} кадр/с · {{ settings.chunkBytes }} Б).
    </p>

    <div class="mode-tabs" role="tablist">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'text' }"
        :disabled="running"
        @click="setMode('text')"
      >
        Текст
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'file' }"
        :disabled="running"
        @click="setMode('file')"
      >
        Файл
      </button>
    </div>

    <textarea
      v-if="mode === 'text'"
      v-model="text"
      class="field"
      :disabled="running"
      placeholder="Сообщение для передачи"
    />

    <div v-else class="stack">
      <input
        ref="fileInputRef"
        class="file-input"
        type="file"
        :disabled="running"
        @change="onFileChange"
      />
      <div v-if="fileBytes" class="file-card">
        <div class="file-name">{{ fileName }}</div>
        <p class="status">
          {{ fileMeta?.sizeLabel }} · {{ fileMeta?.frames }} кадр.
          · {{ fileMeta?.duration }}
        </p>
        <button
          v-if="!running"
          class="btn btn-ghost"
          type="button"
          @click="clearFile"
        >
          Убрать файл
        </button>
      </div>
      <p v-else class="status">
        До {{ formatBytes(settings.maxFileBytes) }} — чем больше файл, тем дольше передача.
      </p>
    </div>

    <div class="stack">
      <button v-if="!running" class="btn btn-primary" type="button" @click="start">
        Старт передачи
      </button>
      <button v-else class="btn btn-danger" type="button" @click="stop">
        Стоп
      </button>
    </div>

    <p v-if="error" class="status" style="color: var(--danger)">{{ error }}</p>

    <p v-if="running || qrDataUrl" class="status">
      Кадр <strong>{{ frameIndex + 1 }}</strong> / {{ frameTotal || '—' }}
    </p>

    <div v-if="qrDataUrl" class="qr-wrap">
      <img :src="qrDataUrl" alt="QR код текущего кадра" class="qr" />
    </div>
  </main>
</template>

<style scoped>
.topbar {
  justify-content: space-between;
}

.settings-link {
  color: var(--muted);
  padding: 8px 0;
}

.lede strong {
  color: var(--accent);
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mode-tab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--muted);
  border-radius: var(--radius);
  padding: 12px 14px;
  cursor: pointer;
  font-weight: 600;
}

.mode-tab.active {
  color: #041210;
  background: linear-gradient(160deg, var(--accent), var(--accent-dim));
  border-color: transparent;
}

.mode-tab:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.file-input {
  width: 100%;
  color: var(--muted);
}

.file-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-name {
  font-weight: 600;
  word-break: break-all;
}

.qr-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 18px;
  padding: 12px;
  min-height: 280px;
}

.qr {
  width: min(100%, 420px);
  height: auto;
  display: block;
  image-rendering: pixelated;
}
</style>
