const MAX_SOURCE_IMAGE_SIZE = 25 * 1024 * 1024
const MAX_UPLOAD_DIMENSION = 2560
const MAX_PREVIEW_DIMENSION = 360
const UPLOAD_QUALITY = 0.84
const PREVIEW_QUALITY = 0.72

const SUPPORTED_EXTENSION_PATTERN = /\.(avif|bmp|dib|gif|heic|heif|ico|jfif|jpe|jpeg|jpg|png|svg|tif|tiff|webp)$/i
const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i
const TIFF_EXTENSION_PATTERN = /\.(tif|tiff)$/i
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])
const TIFF_MIME_TYPES = new Set(['image/tif', 'image/tiff'])

export const BULK_PRODUCT_IMAGE_ACCEPT = [
  'image/*',
  '.avif',
  '.bmp',
  '.dib',
  '.gif',
  '.heic',
  '.heif',
  '.ico',
  '.jfif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
].join(',')

export function bulkProductImageValidationError(file) {
  const type = file?.type?.toLowerCase() ?? ''
  const isSupported = type.startsWith('image/') || SUPPORTED_EXTENSION_PATTERN.test(file?.name ?? '')

  if (!isSupported) {
    return 'Choose a supported image file.'
  }

  if (!file?.size) {
    return 'The image file is empty.'
  }

  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    return 'Use source images smaller than 25 MB each.'
  }

  return ''
}

function isHeic(file) {
  return HEIC_MIME_TYPES.has(file?.type?.toLowerCase() ?? '') || HEIC_EXTENSION_PATTERN.test(file?.name ?? '')
}

function isTiff(file) {
  return TIFF_MIME_TYPES.has(file?.type?.toLowerCase() ?? '') || TIFF_EXTENSION_PATTERN.test(file?.name ?? '')
}

function jpegFileName(fileName) {
  const baseName = fileName?.trim() || 'product-image'
  return /\.[^.]+$/.test(baseName) ? baseName.replace(/\.[^.]+$/, '.jpg') : `${baseName}.jpg`
}

function scaledDimensions(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')),
      'image/jpeg',
      quality,
    )
  })
}

async function renderJpeg(source, width, height, maxDimension, quality) {
  const dimensions = scaledDimensions(width, height, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.')
  }

  // Product photos use a white background when a source format has transparency.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, dimensions.width, dimensions.height)
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height)
  return canvasToJpegBlob(canvas, quality)
}

async function decodeWithImageElement(file) {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()

  try {
    image.decoding = 'async'
    image.src = objectUrl
    await image.decode()
    return {
      close: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight,
      source: image,
      width: image.naturalWidth,
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

async function decodeNativeImage(file) {
  if (globalThis.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { close: () => bitmap.close(), height: bitmap.height, source: bitmap, width: bitmap.width }
    } catch {
      // SVG and a few older browser formats are often supported only by <img>.
    }
  }

  return decodeWithImageElement(file)
}

async function decodeHeic(file) {
  try {
    return await decodeNativeImage(file)
  } catch {
    const { heicTo } = await import('heic-to/csp')
    const bitmap = await heicTo({
      blob: file,
      options: { imageOrientation: 'from-image' },
      type: 'bitmap',
    })
    return { close: () => bitmap.close?.(), height: bitmap.height, source: bitmap, width: bitmap.width }
  }
}

async function decodeTiff(file) {
  const { default: UTIF } = await import('utif')
  const buffer = await file.arrayBuffer()
  const pages = UTIF.decode(buffer)

  if (!pages.length) {
    throw new Error('The TIFF file does not contain an image.')
  }

  UTIF.decodeImage(buffer, pages[0])
  const rgba = UTIF.toRGBA8(pages[0])
  const canvas = document.createElement('canvas')
  canvas.width = pages[0].width
  canvas.height = pages[0].height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.')
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0)
  return { close: () => {}, height: canvas.height, source: canvas, width: canvas.width }
}

export async function prepareBulkProductImage(file) {
  const validationError = bulkProductImageValidationError(file)
  if (validationError) {
    throw new Error(validationError)
  }

  let decoded
  try {
    decoded = isHeic(file)
      ? await decodeHeic(file)
      : isTiff(file)
        ? await decodeTiff(file)
        : await decodeNativeImage(file)

    if (!decoded.width || !decoded.height) {
      throw new Error('The image has invalid dimensions.')
    }

    const [uploadBlob, previewBlob] = await Promise.all([
      renderJpeg(decoded.source, decoded.width, decoded.height, MAX_UPLOAD_DIMENSION, UPLOAD_QUALITY),
      renderJpeg(decoded.source, decoded.width, decoded.height, MAX_PREVIEW_DIMENSION, PREVIEW_QUALITY),
    ])
    const encodedUpload = new File([uploadBlob], jpegFileName(file.name), {
      lastModified: file.lastModified || Date.now(),
      type: 'image/jpeg',
    })
    const canKeepOriginal = /^image\/jpe?g$/i.test(file.type) && encodedUpload.size >= file.size
    const uploadFile = canKeepOriginal ? file : encodedUpload

    return {
      previewUrl: URL.createObjectURL(previewBlob),
      uploadFile,
    }
  } catch (error) {
    throw new Error(`Could not read ${file.name}. The file may be damaged or use an unsupported image codec.`, {
      cause: error,
    })
  } finally {
    decoded?.close()
  }
}
