/** @typedef {{ id: string, i: number, n: number, d: string }} QrFrame */

const CHUNK_BYTES = 90

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
 * @returns {QrFrame[]}
 */
export function buildFrames(text, sessionId = newSessionId()) {
  const chunks = chunkText(text)
  const n = chunks.length
  return chunks.map((d, i) => ({ id: sessionId, i, n, d }))
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
