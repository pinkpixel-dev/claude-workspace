const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64, the form Raster cells and Image bytes take.
export function toBase64(bytes: Uint8Array) {
  const out: string[] = []

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const left = bytes.length - i
    out.push(
      ALPHABET[a >> 2] ?? '',
      ALPHABET[((a & 3) << 4) | (b >> 4)] ?? '',
      left > 1 ? ALPHABET[((b & 15) << 2) | (c >> 6)] ?? '' : '=',
      left > 2 ? ALPHABET[c & 63] ?? '' : '=',
    )
  }

  return out.join('')
}
