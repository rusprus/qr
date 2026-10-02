<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import jsQR from 'jsqr'
import CameraSelect from '../components/CameraSelect.vue'
import { FrameAssembler, parseFrame, decodePayload } from '../utils/protocol'

const videoRef = ref(null)
const canvasRef = ref(null)
const devices = ref([])
const selectedDeviceId = ref('')
const status = ref('Нажмите «Старт», чтобы открыть камеру')
const progress = ref(0)
const total = ref(0)
const resultText = ref('')
const resultFile = ref(null)
const error = ref('')
const scanning = ref(false)

const assembler = new FrameAssembler()
let stream = null
let rafId = 0
let lastRaw = ''
let objectUrl = ''

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

function applyPayload(raw) {
  revokeObjectUrl()
  resultText.value = ''
  resultFile.value = null

  const payload = decodePayload(raw)
  if (payload.kind === 'file') {
    const blob = new Blob([payload.bytes], { type: payload.mime })
    objectUrl = URL.createObjectURL(blob)
    resultFile.value = {
      name: payload.name,
      mime: payload.mime,
      sizeLabel: formatBytes(payload.bytes.length),
      url: objectUrl,
      isAudio: /^audio\//i.test(payload.mime),
    }
    status.value = resultFile.value.isAudio ? 'Голос получен' : 'Файл получен'
    return
  }

  resultText.value = payload.text
  status.value = 'Сообщение получено'
}

function formatBytes(n) {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error('Камера недоступна в этом браузере')
  }
  const all = await navigator.mediaDevices.enumerateDevices()
  devices.value = all.filter((d) => d.kind === 'videoinput')
}

async function ensurePermission() {
  // Labels appear only after permission; use a temporary stream if needed.
  if (devices.value.some((d) => d.label)) return
  const temp = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  temp.getTracks().forEach((t) => t.stop())
  await listCameras()
}

async function startCamera(deviceId) {
  stopStream()
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } }, audio: false }
    : {
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      }

  stream = await navigator.mediaDevices.getUserMedia(constraints)
  await nextTick()
  const video = videoRef.value
  if (!video) return
  video.srcObject = stream
  await video.play()

  const track = stream.getVideoTracks()[0]
  const settings = track?.getSettings?.() || {}
  if (settings.deviceId) {
    selectedDeviceId.value = settings.deviceId
  }
}

function stopStream() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  const video = videoRef.value
  if (video) video.srcObject = null
}

function scanLoop() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!scanning.value || !video || !canvas) return

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const w = video.videoWidth
    const h = video.videoHeight
    if (w && h) {
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, w, h)
      const image = ctx.getImageData(0, 0, w, h)
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      })
      if (code?.data && code.data !== lastRaw) {
        lastRaw = code.data
        const frame = parseFrame(code.data)
        if (frame) {
          const state = assembler.ingest(frame)
          progress.value = state.progress
          total.value = state.total
          status.value = `Собрано ${state.progress} / ${state.total}`
          if (state.complete && state.text != null) {
            applyPayload(state.text)
          }
        }
      }
    }
  }

  rafId = requestAnimationFrame(scanLoop)
}

async function start() {
  error.value = ''
  resultText.value = ''
  resultFile.value = null
  revokeObjectUrl()
  progress.value = 0
  total.value = 0
  lastRaw = ''
  assembler.reset()

  try {
    await ensurePermission()
    await listCameras()
    if (!devices.value.length) {
      throw new Error('Камеры не найдены')
    }
    if (!selectedDeviceId.value) {
      const back = devices.value.find((d) =>
        /back|rear|environment|задн/i.test(d.label),
      )
      selectedDeviceId.value = (back || devices.value[0]).deviceId
    }
    await startCamera(selectedDeviceId.value)
    scanning.value = true
    status.value = 'Наведите камеру на QR'
    rafId = requestAnimationFrame(scanLoop)
  } catch (err) {
    error.value = err?.message || 'Не удалось открыть камеру'
    status.value = 'Ошибка камеры'
    scanning.value = false
    stopStream()
  }
}

function stop() {
  scanning.value = false
  stopStream()
  status.value = 'Сканирование остановлено'
}

function resetMessage() {
  assembler.reset()
  progress.value = 0
  total.value = 0
  resultText.value = ''
  resultFile.value = null
  revokeObjectUrl()
  lastRaw = ''
  status.value = scanning.value ? 'Наведите камеру на QR' : status.value
}

watch(selectedDeviceId, async (id, prev) => {
  if (!scanning.value || !id || id === prev) return
  try {
    await startCamera(id)
  } catch (err) {
    error.value = err?.message || 'Не удалось переключить камеру'
  }
})

onMounted(async () => {
  try {
    await listCameras()
  } catch {
    /* ignore until user starts */
  }
})

onBeforeUnmount(() => {
  stop()
  revokeObjectUrl()
})
</script>

<template>
  <main class="page">
    <div class="topbar">
      <router-link class="back" :to="{ name: 'home' }">← Назад</router-link>
    </div>
    <h1 class="brand">Принять</h1>
    <p class="lede">Выберите камеру и наведите её на QR на другом смартфоне.</p>

    <CameraSelect v-model="selectedDeviceId" :devices="devices" />

    <div class="stack">
      <button v-if="!scanning" class="btn btn-primary" type="button" @click="start">
        Старт
      </button>
      <button v-else class="btn btn-danger" type="button" @click="stop">
        Стоп
      </button>
      <button
        v-if="resultText || resultFile || progress"
        class="btn btn-ghost"
        type="button"
        @click="resetMessage"
      >
        Сбросить
      </button>
    </div>

    <p v-if="error" class="status" style="color: var(--danger)">{{ error }}</p>
    <p class="status">
      {{ status }}
      <template v-if="total">
        — <strong>{{ progress }}</strong> / {{ total }}
      </template>
    </p>

    <div class="preview">
      <video ref="videoRef" playsinline muted autoplay class="video"></video>
      <canvas ref="canvasRef" class="hidden-canvas"></canvas>
    </div>

    <section v-if="resultFile" class="stack">
      <h2 class="result-title">{{ resultFile.isAudio ? 'Голос' : 'Файл' }}</h2>
      <div class="result file-result">
        <div class="file-name">{{ resultFile.name }}</div>
        <p class="status">{{ resultFile.sizeLabel }} · {{ resultFile.mime }}</p>
        <audio
          v-if="resultFile.isAudio"
          class="audio"
          controls
          :src="resultFile.url"
        />
        <a class="btn btn-primary download" :href="resultFile.url" :download="resultFile.name">
          Скачать
        </a>
      </div>
    </section>

    <section v-else-if="resultText" class="stack">
      <h2 class="result-title">Текст</h2>
      <div class="result">{{ resultText }}</div>
    </section>
  </main>
</template>

<style scoped>
.preview {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  aspect-ratio: 3 / 4;
  border: 1px solid var(--border);
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hidden-canvas {
  display: none;
}

.result-title {
  margin: 0;
  font-size: 1rem;
  color: var(--muted);
  font-weight: 600;
}

.file-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-name {
  font-weight: 600;
  word-break: break-all;
}

.audio {
  width: 100%;
}

.download {
  text-align: center;
  display: block;
}
</style>
