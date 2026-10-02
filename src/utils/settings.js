import { reactive, watch } from 'vue'

const STORAGE_KEY = 'qr-transfer-settings-v1'

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   hint: string,
 *   frameIntervalMs: number,
 *   chunkBytes: number,
 *   maxFileBytes: number,
 * }} TransferPreset
 */

/** @type {TransferPreset[]} */
export const PRESETS = [
  {
    id: 'reliable',
    name: 'Надёжный',
    hint: '1 кадр/с · ~90 Б — почти всегда читается',
    frameIntervalMs: 1000,
    chunkBytes: 90,
    maxFileBytes: 48 * 1024,
  },
  {
    id: 'balanced',
    name: 'Баланс',
    hint: '≈3 кадр/с · ~120 Б — обычно ок на обычных смартфонах',
    frameIntervalMs: 333,
    chunkBytes: 120,
    maxFileBytes: 96 * 1024,
  },
  {
    id: 'fast',
    name: 'Быстрый',
    hint: '5 кадр/с · ~150 Б — на грани, нужен хороший свет',
    frameIntervalMs: 200,
    chunkBytes: 150,
    maxFileBytes: 128 * 1024,
  },
]

export const FRAME_INTERVAL_MIN = 200
export const FRAME_INTERVAL_MAX = 1000
export const CHUNK_BYTES_MIN = 80
export const CHUNK_BYTES_MAX = 200
export const MAX_FILE_MIN = 16 * 1024
export const MAX_FILE_MAX = 256 * 1024

/** @type {{ preset: string, frameIntervalMs: number, chunkBytes: number, maxFileBytes: number }} */
export const settings = reactive({
  preset: 'reliable',
  frameIntervalMs: 1000,
  chunkBytes: 90,
  maxFileBytes: 48 * 1024,
})

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

/**
 * Effective bytes/sec for current settings (approx).
 * @param {{ frameIntervalMs?: number, chunkBytes?: number }} [opts]
 */
export function throughputBps(opts = {}) {
  const interval = opts.frameIntervalMs ?? settings.frameIntervalMs
  const chunk = opts.chunkBytes ?? settings.chunkBytes
  return (chunk * 1000) / interval
}

/** @param {string} presetId */
export function applyPreset(presetId) {
  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) return
  settings.preset = preset.id
  settings.frameIntervalMs = preset.frameIntervalMs
  settings.chunkBytes = preset.chunkBytes
  settings.maxFileBytes = preset.maxFileBytes
}

export function markCustom() {
  settings.preset = 'custom'
}

function normalize() {
  settings.frameIntervalMs = clamp(
    Math.round(Number(settings.frameIntervalMs) || 1000),
    FRAME_INTERVAL_MIN,
    FRAME_INTERVAL_MAX,
  )
  settings.chunkBytes = clamp(
    Math.round(Number(settings.chunkBytes) || 90),
    CHUNK_BYTES_MIN,
    CHUNK_BYTES_MAX,
  )
  settings.maxFileBytes = clamp(
    Math.round(Number(settings.maxFileBytes) || 48 * 1024),
    MAX_FILE_MIN,
    MAX_FILE_MAX,
  )

  const match = PRESETS.find(
    (p) =>
      p.frameIntervalMs === settings.frameIntervalMs &&
      p.chunkBytes === settings.chunkBytes &&
      p.maxFileBytes === settings.maxFileBytes,
  )
  settings.preset = match ? match.id : 'custom'
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (typeof data.frameIntervalMs === 'number') settings.frameIntervalMs = data.frameIntervalMs
    if (typeof data.chunkBytes === 'number') settings.chunkBytes = data.chunkBytes
    if (typeof data.maxFileBytes === 'number') settings.maxFileBytes = data.maxFileBytes
    if (typeof data.preset === 'string') settings.preset = data.preset
    normalize()
  } catch {
    /* ignore corrupt storage */
  }
}

export function saveSettings() {
  normalize()
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      preset: settings.preset,
      frameIntervalMs: settings.frameIntervalMs,
      chunkBytes: settings.chunkBytes,
      maxFileBytes: settings.maxFileBytes,
    }),
  )
}

loadSettings()

watch(settings, () => {
  saveSettings()
}, { deep: true })
