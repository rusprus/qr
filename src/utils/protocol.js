/** @typedef {{ id: string, i: number, n: number, d: string }} QrFrame */
/** @typedef {{ kind: 'text', text: string }} TextPayload */
/** @typedef {{ kind: 'file', name: string, mime: string, bytes: Uint8Array }} FilePayload */
/** @typedef {TextPayload | FilePayload} TransferPayload */

export const CHUNK_BYTES = 90
/** Soft limit: QR transfer is slow (~90 B/s). */
export const MAX_FILE_BYTES = 48 * 1024
export const FRAME_INTERVAL_MS = 1000

/**
 * Split UTF-8 text into byte-sized chunks without breaking code points.
 * @param {string} text
 * @param {number} [maxBytes]
 * @returns {string[]}
 */
export function chunkText(text, maxBytes = CHUNK_BYTES) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const bytes = encoder.encode(text)
  if (bytes.length === 0) return ['']

  const parts = []
  let offset = 0
  while (offset < bytes.length) {
    let end = Math.min(offset + maxBytes, bytes.length)
    // Avoid splitting a multi-byte UTF-8 sequence
    while (end > offset && (bytes[end] & 0xc0) === 0x80) {
      end -= 1
    }
    if (end === offset) {
      end = Math.min(offset + maxBytes, bytes.length)
    }
    parts.push(decoder.decode(bytes.subarray(offset, end)))
    offset = end
  }
  return parts
}

/** @returns {string} */
export function newSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

/**
 * @param {string} text
 * @param {string} [sessionId]
 * @param {number} [chunkBytes]
 * @returns {QrFrame[]}
 */
export function buildFrames(text, sessionId = newSessionId(), chunkBytes = CHUNK_BYTES) {
  const chunks = chunkText(text, chunkBytes)
  const n = chunks.length
  return chunks.map((d, i) => ({ id: sessionId, i, n, d }))
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * @param {string} name
 * @param {string} mime
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeFilePayload(name, mime, bytes) {
  return JSON.stringify({
    v: 1,
    kind: 'file',
    name: name || 'file',
    mime: mime || 'application/octet-stream',
    data: bytesToBase64(bytes),
  })
}

/**
 * Decode reassembled transfer string (plain text or file envelope).
 * @param {string} raw
 * @returns {TransferPayload}
 */
export function decodePayload(raw) {
  try {
    const data = JSON.parse(raw)
    if (
      data?.v === 1 &&
      data?.kind === 'file' &&
      typeof data.data === 'string' &&
      typeof data.name === 'string'
    ) {
      return {
        kind: 'file',
        name: data.name || 'file',
        mime: typeof data.mime === 'string' ? data.mime : 'application/octet-stream',
        bytes: base64ToBytes(data.data),
      }
    }
  } catch {
    /* plain text */
  }
  return { kind: 'text', text: raw }
}

/**
 * @param {number} byteLength
 * @param {{ chunkBytes?: number, frameIntervalMs?: number }} [opts]
 * @returns {{ frames: number, seconds: number }}
 */
export function estimateTransfer(byteLength, opts = {}) {
  const chunkBytes = opts.chunkBytes ?? CHUNK_BYTES
  const frameIntervalMs = opts.frameIntervalMs ?? FRAME_INTERVAL_MS
  // base64 + JSON envelope overhead ≈ 4/3 + ~80 bytes
  const payloadBytes = Math.ceil(byteLength * 1.37) + 80
  const frames = Math.max(1, Math.ceil(payloadBytes / chunkBytes))
  return { frames, seconds: frames * (frameIntervalMs / 1000) }
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `~${Math.ceil(seconds)} с`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return s ? `~${m} мин ${s} с` : `~${m} мин`
}

/**
 * @param {string} raw
 * @returns {QrFrame | null}
 */
export function parseFrame(raw) {
  try {
    const data = JSON.parse(raw)
    if (
      typeof data?.id !== 'string' ||
      typeof data?.i !== 'number' ||
      typeof data?.n !== 'number' ||
      typeof data?.d !== 'string'
    ) {
      return null
    }
    if (!Number.isInteger(data.i) || !Number.isInteger(data.n) || data.n < 1) {
      return null
    }
    if (data.i < 0 || data.i >= data.n) return null
    return data
  } catch {
    return null
  }
}

export class FrameAssembler {
  constructor() {
    this.reset()
  }

  reset() {
    this.sessionId = null
    this.total = 0
    /** @type {Map<number, string>} */
    this.parts = new Map()
    this.completeText = null
  }

  /**
   * @param {QrFrame} frame
   * @returns {{ progress: number, total: number, complete: boolean, text: string | null }}
   */
  ingest(frame) {
    if (this.sessionId !== frame.id) {
      this.sessionId = frame.id
      this.total = frame.n
      this.parts = new Map()
      this.completeText = null
    }

    if (frame.n !== this.total) {
      this.total = frame.n
    }

    this.parts.set(frame.i, frame.d)

    const complete = this.parts.size === this.total
    if (complete && this.completeText === null) {
      const ordered = []
      for (let i = 0; i < this.total; i += 1) {
        ordered.push(this.parts.get(i) ?? '')
      }
      this.completeText = ordered.join('')
    }

    return {
      progress: this.parts.size,
      total: this.total,
      complete,
      text: this.completeText,
    }
  }
}
