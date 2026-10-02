<script setup>
import { ref, computed, onBeforeUnmount, nextTick } from 'vue'
import QRCode from 'qrcode'
import {
  buildFrames,
  encodeFilePayload,
  estimateTransfer,
  formatDuration,
} from '../utils/protocol'
import { settings, PRESETS } from '../utils/settings'

const VOICE_BITRATE = 16000

const mode = ref('text')
const text = ref('Привет! Это тестовое сообщение через QR.')
const fileName = ref('')
const fileMime = ref('')
/** @type {import('vue').Ref<Uint8Array | null>} */
const fileBytes = ref(null)
const fileInputRef = ref(null)
const qrWrapRef = ref(null)
const voicePreviewUrl = ref('')

const recording = ref(false)
const recordSeconds = ref(0)

const running = ref(false)
const frameIndex = ref(0)
const frameTotal = ref(0)
const qrDataUrl = ref('')
const error = ref('')

let frames = []
let timer = null
let mediaRecorder = null
let micStream = null
/** @type {Blob[]} */
let voiceChunks = []
let recordTicker = null
let autoStopTimer = null

const transferOpts = computed(() => ({
  chunkBytes: settings.chunkBytes,
  frameIntervalMs: settings.frameIntervalMs,
}))

const presetLabel = computed(() => {
  const preset = PRESETS.find((p) => p.id === settings.preset)
  return preset ? preset.name : 'Свои'
})

const maxVoiceSeconds = computed(() =>
  Math.max(5, Math.floor((settings.maxFileBytes * 8) / VOICE_BITRATE * 0.8)),
)

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

function revokeVoicePreview() {
  if (voicePreviewUrl.value) {
    URL.revokeObjectURL(voicePreviewUrl.value)
    voicePreviewUrl.value = ''
  }
}

function clearPayload() {
  fileName.value = ''
  fileMime.value = ''
  fileBytes.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  revokeVoicePreview()
}

function setMode(next) {
  if (running.value || recording.value) return
  mode.value = next
  error.value = ''
  clearPayload()
}

async function onFileChange(event) {
  error.value = ''
  const file = event.target?.files?.[0]
  if (!file) {
    clearPayload()
    return
  }
  if (file.size > settings.maxFileBytes) {
    clearPayload()
    error.value = `Файл слишком большой. Максимум ${formatBytes(settings.maxFileBytes)}.`
    return
  }
  const buffer = await file.arrayBuffer()
  fileName.value = file.name
  fileMime.value = file.type || 'application/octet-stream'
  fileBytes.value = new Uint8Array(buffer)
  revokeVoicePreview()
}

function pickRecorderMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function extensionForMime(mime) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

async function startRecording() {
  error.value = ''
  if (running.value) return
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    error.value = 'Запись голоса недоступна в этом браузере'
    return
  }

  clearPayload()
  const mimeType = pickRecorderMime()
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    })
  } catch (err) {
    error.value = err?.message || 'Нет доступа к микрофону'
    return
  }

  voiceChunks = []
  const options = mimeType
    ? { mimeType, audioBitsPerSecond: VOICE_BITRATE }
    : { audioBitsPerSecond: VOICE_BITRATE }
  try {
    mediaRecorder = new MediaRecorder(micStream, options)
  } catch {
    mediaRecorder = new MediaRecorder(micStream)
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data?.size) voiceChunks.push(event.data)
  }
  mediaRecorder.onerror = () => {
    error.value = 'Ошибка записи'
    stopRecording(false)
  }
  mediaRecorder.onstop = async () => {
    const usedMime = mediaRecorder?.mimeType || mimeType || 'audio/webm'
    const blob = new Blob(voiceChunks, { type: usedMime })
    cleanupMic()
    if (!blob.size) {
      error.value = 'Пустая запись'
      return
    }
    if (blob.size > settings.maxFileBytes) {
      error.value = `Запись слишком большая (${formatBytes(blob.size)}). Максимум ${formatBytes(settings.maxFileBytes)} — говорите короче.`
      return
    }
    const buffer = await blob.arrayBuffer()
    fileBytes.value = new Uint8Array(buffer)
    fileMime.value = usedMime
    fileName.value = `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extensionForMime(usedMime)}`
    revokeVoicePreview()
    voicePreviewUrl.value = URL.createObjectURL(blob)
  }

  mediaRecorder.start(250)
  recording.value = true
  recordSeconds.value = 0
  recordTicker = window.setInterval(() => {
    recordSeconds.value += 1
  }, 1000)
  autoStopTimer = window.setTimeout(() => {
    if (recording.value) stopRecording(true)
  }, maxVoiceSeconds.value * 1000)
}

function cleanupMic() {
  if (recordTicker != null) {
    clearInterval(recordTicker)
    recordTicker = null
  }
  if (autoStopTimer != null) {
    clearTimeout(autoStopTimer)
    autoStopTimer = null
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop())
    micStream = null
  }
  mediaRecorder = null
  recording.value = false
}

function stopRecording(keep = true) {
  if (!mediaRecorder) {
    cleanupMic()
    return
  }
  if (mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.requestData?.()
    } catch {
      /* ignore */
    }
    if (!keep) {
      mediaRecorder.ondataavailable = null
      mediaRecorder.onstop = () => cleanupMic()
    }
    mediaRecorder.stop()
  } else {
    cleanupMic()
  }
  recording.value = false
  if (recordTicker != null) {
    clearInterval(recordTicker)
    recordTicker = null
  }
  if (autoStopTimer != null) {
    clearTimeout(autoStopTimer)
    autoStopTimer = null
  }
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

async function scrollQrIntoView() {
  await nextTick()
  requestAnimationFrame(() => {
    qrWrapRef.value?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  })
}

async function tick() {
  if (!frames.length) return
  frameIndex.value = (frameIndex.value + 1) % frames.length
  await renderFrame(frameIndex.value)
}

async function start() {
  error.value = ''
  if (recording.value) {
    error.value = 'Сначала остановите запись'
    return
  }
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
      error.value = mode.value === 'voice' ? 'Запишите голос' : 'Выберите файл'
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
  await scrollQrIntoView()
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

onBeforeUnmount(() => {
  stop()
  stopRecording(false)
  revokeVoicePreview()
})
</script>

<template>
  <main class="page">
    <div class="topbar">
      <router-link class="back" :to="{ name: 'home' }">← Назад</router-link>
      <router-link class="settings-link" :to="{ name: 'settings' }">Настройки</router-link>
    </div>
    <h1 class="brand">Передать</h1>
    <p class="lede">
      Текст, файл или голос нарезается на кадры.
      Режим: <strong>{{ presetLabel }}</strong>
      ({{ (1000 / settings.frameIntervalMs).toFixed(1) }} кадр/с · {{ settings.chunkBytes }} Б).
    </p>

    <div class="mode-tabs" role="tablist">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'text' }"
        :disabled="running || recording"
        @click="setMode('text')"
      >
        Текст
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'file' }"
        :disabled="running || recording"
        @click="setMode('file')"
      >
        Файл
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'voice' }"
        :disabled="running || recording"
        @click="setMode('voice')"
      >
        Голос
      </button>
    </div>

    <textarea
      v-if="mode === 'text'"
      v-model="text"
      class="field"
      :disabled="running"
      placeholder="Сообщение для передачи"
    />

    <div v-else-if="mode === 'file'" class="stack">
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
          @click="clearPayload"
        >
          Убрать файл
        </button>
      </div>
      <p v-else class="status">
        До {{ formatBytes(settings.maxFileBytes) }} — чем больше файл, тем дольше передача.
      </p>
    </div>

    <div v-else class="stack">
      <p class="status">
        До ~{{ maxVoiceSeconds }} с при текущем лимите
        {{ formatBytes(settings.maxFileBytes) }} (сжатие ~{{ VOICE_BITRATE / 1000 }} кбит/с).
      </p>
      <div class="stack">
        <button
          v-if="!recording"
          class="btn btn-primary"
          type="button"
          :disabled="running"
          @click="startRecording"
        >
          Записать голос
        </button>
        <button
          v-else
          class="btn btn-danger"
          type="button"
          @click="stopRecording(true)"
        >
          Стоп записи · {{ recordSeconds }} с
        </button>
      </div>
      <div v-if="fileBytes" class="file-card">
        <div class="file-name">{{ fileName }}</div>
        <p class="status">
          {{ fileMeta?.sizeLabel }} · {{ fileMeta?.frames }} кадр.
          · {{ fileMeta?.duration }}
        </p>
        <audio v-if="voicePreviewUrl" class="audio" controls :src="voicePreviewUrl" />
        <button
          v-if="!running && !recording"
          class="btn btn-ghost"
          type="button"
          @click="clearPayload"
        >
          Удалить запись
        </button>
      </div>
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

    <div v-if="qrDataUrl" ref="qrWrapRef" class="qr-wrap">
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
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.mode-tab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--muted);
  border-radius: var(--radius);
  padding: 12px 10px;
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

.audio {
  width: 100%;
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
