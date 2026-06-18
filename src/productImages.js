import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

export function imageValidationError(file) {
  if (!file?.type?.startsWith('image/')) {
    return 'Choose image files only.'
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return 'Use images smaller than 10 MB each.'
  }

  return ''
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

  const safeName = sanitizeFileName(file.name) || 'product-image'
  const orderPrefix = String(sortOrder + 1).padStart(2, '0')
  const imageRef = ref(storage, `products/${productId}/${orderPrefix}-${randomId()}-${safeName}`)
  const uploadResult = await uploadBytes(imageRef, file, {
    contentType: file.type || 'image/jpeg',
  })

  return {
    contentType: file.type || 'image/jpeg',
    fileName: file.name,
    imagePath: uploadResult.ref.fullPath,
    imageUrl: await getDownloadURL(uploadResult.ref),
    size: file.size,
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
