import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const FULL_IMAGE_QUALITY = 0.9
const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])
const HEIC_CONVERSION_TIMEOUT_MS = 20000
const PREVIEW_IMAGE_QUALITY = 0.72
const PREVIEW_MAX_DIMENSION = 360

export function isHeicImage(file) {
  const fileType = file?.type?.toLowerCase() ?? ''

  return HEIC_MIME_TYPES.has(fileType) || HEIC_EXTENSION_PATTERN.test(file?.name ?? '')
}

export function imageValidationError(file) {
  const fileType = file?.type?.toLowerCase() ?? ''
  const looksLikeImage = fileType.startsWith('image/') || IMAGE_EXTENSION_PATTERN.test(file?.name ?? '')

  if (!looksLikeImage) {
    return 'Choose image files only.'
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return 'Use images smaller than 10 MB each.'
  }

  return ''
}

function jpegFileName(fileName) {
  const safeBaseName = fileName?.trim() || 'product-image'

  if (/\.(jpe?g)$/i.test(safeBaseName)) {
    return safeBaseName
  }

  return /\.[^.]+$/.test(safeBaseName)
    ? safeBaseName.replace(/\.[^.]+$/, '.jpg')
    : `${safeBaseName}.jpg`
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let didTimeout = false
  let timeoutId

  const watchedPromise = promise.then((result) => {
    if (didTimeout) {
      throw new Error(timeoutMessage)
    }

    return result
  })

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([watchedPromise, timeout]).finally(() => clearTimeout(timeoutId))
}

function canvasToJpegBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('Canvas did not return an image.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function scaledDimensions(width, height, maxDimension) {
  if (!maxDimension || Math.max(width, height) <= maxDimension) {
    return { height, width }
  }

  const scale = maxDimension / Math.max(width, height)

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

async function bitmapToJpegFile(bitmap, fileName, { maxDimension, quality = FULL_IMAGE_QUALITY } = {}) {
  const canvas = document.createElement('canvas')
  const dimensions = scaledDimensions(bitmap.width, bitmap.height, maxDimension)
  canvas.width = dimensions.width
  canvas.height = dimensions.height

  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close?.()
    throw new Error('Canvas rendering is not available.')
  }

  context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height)
  bitmap.close?.()

  return new File([await canvasToJpegBlob(canvas, quality)], fileName, {
    lastModified: Date.now(),
    type: 'image/jpeg',
  })
}

async function convertBrowserReadableImageToJpeg(file, options = {}) {
  if (!globalThis.createImageBitmap || !globalThis.document) {
    throw new Error('Browser image decoding is not available.')
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  return bitmapToJpegFile(bitmap, jpegFileName(file.name), options)
}

async function maybeResizeJpegFile(file, options = {}) {
  if (!options.maxDimension) {
    return file
  }

  try {
    return await convertBrowserReadableImageToJpeg(file, options)
  } catch {
    return file
  }
}

async function convertHeicToJpeg(file, options = {}) {
  try {
    return await convertBrowserReadableImageToJpeg(file, options)
  } catch {
    // Some browsers cannot decode HEIC natively; fall back to the HEIF decoder.
  }

  try {
    const { heicTo } = await import('heic-to')

    const jpegBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: options.quality ?? FULL_IMAGE_QUALITY,
    })

    if (!(jpegBlob instanceof Blob)) {
      throw new Error('HEIC conversion did not return an image.')
    }

    const jpegFile = new File([jpegBlob], jpegFileName(file.name), {
      lastModified: file.lastModified || Date.now(),
      type: 'image/jpeg',
    })

    return maybeResizeJpegFile(jpegFile, options)
  } catch (error) {
    throw new Error(`Could not prepare a preview for ${file.name}. Try exporting it as a JPEG first.`, {
      cause: error,
    })
  }
}

export async function prepareProductImageFile(file) {
  return isHeicImage(file)
    ? withTimeout(
        convertHeicToJpeg(file),
        HEIC_CONVERSION_TIMEOUT_MS,
        `HEIC conversion took too long for ${file.name}. Try exporting it as a JPEG first.`,
      )
    : file
}

export async function createProductImagePreview(file) {
  const previewFile = isHeicImage(file)
    ? await withTimeout(
        convertHeicToJpeg(file, {
          maxDimension: PREVIEW_MAX_DIMENSION,
          quality: PREVIEW_IMAGE_QUALITY,
        }),
        HEIC_CONVERSION_TIMEOUT_MS,
        `Preview took too long for ${file.name}. Try exporting it as a JPEG first.`,
      )
    : file

  return {
    previewFile,
    previewUrl: URL.createObjectURL(previewFile),
  }
}

function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function uploadProductImage(file, productId, sortOrder = 0) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Add VITE_FIREBASE_STORAGE_BUCKET before uploading images.')
  }

  const validationError = imageValidationError(file)

  if (validationError) {
    throw new Error(validationError)
  }

  const uploadFile = await prepareProductImageFile(file)
  const safeName = sanitizeFileName(uploadFile.name) || 'product-image'
  const orderPrefix = String(sortOrder + 1).padStart(2, '0')
  const imageRef = ref(storage, `products/${productId}/${orderPrefix}-${randomId()}-${safeName}`)
  const contentType = uploadFile.type || 'image/jpeg'
  const uploadResult = await uploadBytes(imageRef, uploadFile, {
    contentType,
  })

  return {
    contentType,
    fileName: uploadFile.name,
    imagePath: uploadResult.ref.fullPath,
    imageUrl: await getDownloadURL(uploadResult.ref),
    size: uploadFile.size,
    sortOrder,
  }
}

export async function uploadProductImages(files, productId) {
  const uploadedImages = []

  try {
    for (const [index, file] of files.entries()) {
      uploadedImages.push(await uploadProductImage(file, productId, index))
    }
  } catch (error) {
    await deleteStoredImages(uploadedImages)
    throw error
  }

  return uploadedImages
}

export async function deleteStoredImages(imagesOrPaths) {
  if (!storage) {
    return
  }

  const imagePaths = Array.from(
    new Set(
      imagesOrPaths
        .map((image) => (typeof image === 'string' ? image : image?.imagePath))
        .filter(Boolean),
    ),
  )

  await Promise.all(
    imagePaths.map(async (imagePath) => {
      try {
        await deleteObject(ref(storage, imagePath))
      } catch {
        // Product records should not stay blocked if an old image is already gone.
      }
    }),
  )
}
