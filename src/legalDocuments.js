import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { apiRequest, authorizedApiRequest } from './api'
import { storage } from './firebase'

export const legalDocumentLabels = {
  PRIVACY_POLICY: 'Privacy Policy',
  TOS: 'Terms of Service',
}

export const legalDocumentTypes = [
  { label: legalDocumentLabels.TOS, value: 'TOS' },
  { label: legalDocumentLabels.PRIVACY_POLICY, value: 'PRIVACY_POLICY' },
]

const MAX_LEGAL_DOCUMENT_SIZE = 10 * 1024 * 1024
const legalDocumentMimeTypes = new Set([
  'application/pdf',
  'text/markdown',
  'text/plain',
])

function sanitizeFileName(fileName) {
  return (fileName || 'legal-document')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function legalDocumentValidationError(file) {
  const extension = file?.name?.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  const isAllowedType =
    legalDocumentMimeTypes.has(file?.type ?? '') || ['.md', '.pdf', '.txt'].includes(extension)

  if (!isAllowedType) {
    return 'Upload a PDF, Markdown, or text file.'
  }

  if (file.size > MAX_LEGAL_DOCUMENT_SIZE) {
    return 'Use legal documents smaller than 10 MB.'
  }

  return ''
}

export async function loadActiveLegalDocuments() {
  const result = await apiRequest('/api/legal/active')

  return result.documents ?? []
}

export async function loadMissingLegalDocumentTypes(userId) {
  const result = await apiRequest(
    `/api/legal/check-consent?user_id=${encodeURIComponent(userId)}`,
  )

  return new Set(result.missing_document_types ?? [])
}

export async function agreeToLegalDocument({ documentType, user, userId, versionNumber, email, context }) {
  const authHeaders = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}
  const result = await apiRequest('/api/legal/agree', {
    body: JSON.stringify({
      document_type: documentType,
      user_id: userId,
      version_number: versionNumber,
      email: email || null,
      context: context || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }),
    headers: authHeaders,
    method: 'POST',
  })

  return result.agreement_id
}

export async function uploadLegalDocumentFile({ documentType, file, versionNumber }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Add VITE_FIREBASE_STORAGE_BUCKET before uploading legal documents.')
  }

  const validationError = legalDocumentValidationError(file)

  if (validationError) {
    throw new Error(validationError)
  }

  const safeName = sanitizeFileName(file.name)
  const documentRef = ref(storage, `legal-documents/${documentType}/${versionNumber}/${Date.now()}-${safeName}`)
  const uploadResult = await uploadBytes(documentRef, file, {
    contentType: file.type || 'application/octet-stream',
  })

  return getDownloadURL(uploadResult.ref)
}

export async function publishLegalDocument({ contentUrl, documentType, user, versionNumber }) {
  return authorizedApiRequest('/api/admin/legal/publish', user, {
    body: JSON.stringify({
      content_url: contentUrl,
      document_type: documentType,
      version_number: versionNumber,
    }),
    method: 'POST',
  })
}
