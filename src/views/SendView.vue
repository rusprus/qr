<script setup>
import { ref, onBeforeUnmount } from 'vue'
import QRCode from 'qrcode'
import { buildFrames } from '../utils/protocol'

const text = ref('Привет! Это тестовое сообщение через QR.')
const running = ref(false)
const frameIndex = ref(0)
const frameTotal = ref(0)
const qrDataUrl = ref('')
const error = ref('')

let frames = []
let timer = null

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
  const value = text.value.trim()
  if (!value) {
    error.value = 'Введите текст для передачи'
    return
  }

  stop()
  frames = buildFrames(value)
  frameTotal.value = frames.length
  frameIndex.value = 0
  running.value = true
  await renderFrame(0)
  timer = window.setInterval(() => {
    tick().catch((err) => {
      error.value = err?.message || 'Ошибка генерации QR'
      stop()
    })
  }, 1000)
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
    </div>
    <h1 class="brand">Показать QR</h1>
    <p class="lede">Текст нарезается на кадры и крутится на экране каждую секунду.</p>

    <textarea
      v-model="text"
      class="field"
      :disabled="running"
      placeholder="Сообщение для передачи"
    />

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
