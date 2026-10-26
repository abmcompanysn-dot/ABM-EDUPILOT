/** Réduit une photo (portrait 3:4, 600 px de large) en JPEG avant envoi. */
export async function resizePhoto(file: File, width = 600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const height = Math.round((width * 4) / 3)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // recadrage centré au format 3:4
  const ratio = width / height
  let sw = bitmap.width
  let sh = bitmap.height
  let sx = 0
  let sy = 0
  if (sw / sh > ratio) {
    sw = sh * ratio
    sx = (bitmap.width - sw) / 2
  } else {
    sh = sw / ratio
    sy = (bitmap.height - sh) / 2
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion de la photo impossible'))), 'image/jpeg', 0.85))
}
