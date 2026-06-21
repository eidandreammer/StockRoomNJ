import { describe, expect, it } from 'vitest'
import { legalDocumentContentType } from '../src/legalDocuments'
import { productImageContentType } from '../src/productImages'
import { bulkProductImageValidationError } from '../src/bulkProductImages'

describe('upload content type normalization', () => {
  it('infers legal document types when browsers omit or generalize MIME metadata', () => {
    expect(legalDocumentContentType({ name: 'terms.pdf', type: '' })).toBe('application/pdf')
    expect(legalDocumentContentType({ name: 'privacy.md', type: 'application/octet-stream' })).toBe('text/markdown')
    expect(legalDocumentContentType({ name: 'notice.txt', type: '' })).toBe('text/plain')
  })

  it('rejects unsupported legal document extensions', () => {
    expect(legalDocumentContentType({ name: 'terms.docx', type: 'application/octet-stream' })).toBe('')
  })

  it('infers image types from extensions and preserves valid image MIME types', () => {
    expect(productImageContentType({ name: 'photo.png', type: '' })).toBe('image/png')
    expect(productImageContentType({ name: 'photo.jpg', type: 'application/octet-stream' })).toBe('image/jpeg')
    expect(productImageContentType({ name: 'photo.webp', type: 'image/webp' })).toBe('image/webp')
  })

  it('accepts broad image formats in the isolated new-product workflow', () => {
    for (const name of ['photo.HEIC', 'photo.heif', 'photo.tiff', 'photo.jfif', 'photo.avif', 'photo.svg']) {
      expect(bulkProductImageValidationError({ name, size: 1024, type: '' })).toBe('')
    }

    expect(bulkProductImageValidationError({ name: 'notes.pdf', size: 1024, type: '' })).toBe(
      'Choose a supported image file.',
    )
  })
})
