<script setup>
import { computed } from 'vue'
import { formatDuration, estimateTransfer } from '../utils/protocol'
import {
  settings,
  PRESETS,
  applyPreset,
  markCustom,
  throughputBps,
  FRAME_INTERVAL_MIN,
  FRAME_INTERVAL_MAX,
  CHUNK_BYTES_MIN,
  CHUNK_BYTES_MAX,
  MAX_FILE_MIN,
  MAX_FILE_MAX,
} from '../utils/settings'

/** FPS control maps to interval (higher FPS = lower interval). */
const fpsValue = computed({
  get() {
    return Number((1000 / settings.frameIntervalMs).toFixed(1))
  },
  set(v) {
    const fps = Math.min(5, Math.max(1, Number(v) || 1))
    settings.frameIntervalMs = Math.round(1000 / fps)
    markCustom()
  },
})

const speedLabel = computed(() => `${Math.round(throughputBps())} Б/с`)

const sampleEta = computed(() => {
  const est = estimateTransfer(48 * 1024, {
    chunkBytes: settings.chunkBytes,
    frameIntervalMs: settings.frameIntervalMs,
  })
  return formatDuration(est.seconds)
})

function onPreset(id) {
  applyPreset(id)
}

function onManualChange() {
  markCustom()
}

function formatBytes(n) {
  if (n < 1024) return `${n} Б`
  return `${Math.round(n / 1024)} КБ`
}

// Keep interval within bounds if edited indirectly
const fpsMin = 1000 / FRAME_INTERVAL_MAX
const fpsMax = 1000 / FRAME_INTERVAL_MIN
</script>

<template>
  <main class="page">
    <div class="topbar">
      <router-link class="back" :to="{ name: 'home' }">← Назад</router-link>
    </div>
    <h1 class="brand">Настройки</h1>
    <p class="lede">
      Скорость смены QR и плотность кадра. Чем быстрее — тем выше риск, что камера не успеет.
    </p>

    <section class="stack">
      <h2 class="section-title">Пресеты</h2>
      <button
        v-for="preset in PRESETS"
        :key="preset.id"
        type="button"
        class="preset"
        :class="{ active: settings.preset === preset.id }"
        @click="onPreset(preset.id)"
      >
        <span class="preset-name">{{ preset.name }}</span>
        <span class="preset-hint">{{ preset.hint }}</span>
      </button>
      <p v-if="settings.preset === 'custom'" class="status">Сейчас: свой набор параметров</p>
    </section>

    <section class="stack">
      <h2 class="section-title">Параметры</h2>

      <label class="control">
        <div class="control-head">
          <span>Скорость кадров</span>
          <strong>{{ fpsValue }} кадр/с · {{ settings.frameIntervalMs }} мс</strong>
        </div>
        <input
          v-model.number="fpsValue"
          class="range"
          type="range"
          :min="fpsMin"
          :max="fpsMax"
          step="0.1"
        />
        <p class="hint">1 надёжно · 3 обычно ок · 5 на грани для обычных камер</p>
      </label>

      <label class="control">
        <div class="control-head">
          <span>Данных в QR</span>
          <strong>{{ settings.chunkBytes }} байт</strong>
        </div>
        <input
          v-model.number="settings.chunkBytes"
          class="range"
          type="range"
          :min="CHUNK_BYTES_MIN"
          :max="CHUNK_BYTES_MAX"
          step="5"
          @input="onManualChange"
        />
        <p class="hint">80–120 стабильно · 150–200 плотнее, хуже издалека</p>
      </label>

      <label class="control">
        <div class="control-head">
          <span>Макс. размер файла</span>
          <strong>{{ formatBytes(settings.maxFileBytes) }}</strong>
        </div>
        <input
          v-model.number="settings.maxFileBytes"
          class="range"
          type="range"
          :min="MAX_FILE_MIN"
          :max="MAX_FILE_MAX"
          :step="8 * 1024"
          @input="onManualChange"
        />
      </label>
    </section>

    <section class="summary">
      <p class="status">Скорость ≈ <strong>{{ speedLabel }}</strong></p>
      <p class="status">Файл 48 КБ ≈ <strong>{{ sampleEta }}</strong></p>
    </section>
  </main>
</template>

<style scoped>
.section-title {
  margin: 0;
  font-size: 1rem;
  color: var(--muted);
  font-weight: 600;
}

.preset {
  appearance: none;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--fg);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.preset-name {
  font-weight: 700;
}

.preset-hint {
  color: var(--muted);
  font-size: 0.9rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
}

.control-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.control-head strong {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.range {
  width: 100%;
  accent-color: var(--accent);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.summary {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
