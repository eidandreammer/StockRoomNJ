import { useEffect, useMemo, useState } from 'react'
import {
  legalDocumentLabels,
  legalDocumentTypes,
  loadActiveLegalDocuments,
  publishLegalDocument,
  uploadLegalDocumentFile,
} from './legalDocuments'

function emptyLegalForm() {
  return {
    documentType: 'TOS',
    file: null,
    versionNumber: '',
  }
}

function formatDate(value) {
  const date = value?.toDate?.()
    ?? (typeof value?._seconds === 'number' ? new Date(value._seconds * 1000) : null)
    ?? (value ? new Date(value) : null)

  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Not available'
}

function validateLegalForm(form) {
  if (!form.documentType) {
    return 'Choose a legal document type.'
  }

  if (!/^[A-Za-z0-9._-]+$/.test(form.versionNumber.trim())) {
    return 'Use a version with letters, numbers, dots, dashes, or underscores only.'
  }

  if (!form.file) {
    return 'Choose the updated legal document file.'
  }

  return ''
}

function AdminLegalDocuments({ user }) {
  const [activeDocuments, setActiveDocuments] = useState([])
  const [form, setForm] = useState(emptyLegalForm)
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const activeByType = useMemo(
    () => new Map(activeDocuments.map((document) => [document.document_type, document])),
    [activeDocuments],
  )

  const refreshDocuments = async () => {
    const documents = await loadActiveLegalDocuments()
    setActiveDocuments(documents)
  }

  useEffect(() => {
    let isActive = true

    async function loadDocuments() {
      setStatus('loading')
      setError('')

      try {
        const documents = await loadActiveLegalDocuments()

        if (isActive) {
          setActiveDocuments(documents)
          setStatus('ready')
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError.message)
          setStatus('error')
        }
      }
    }

    loadDocuments()

    return () => {
      isActive = false
    }
  }, [])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateLegalForm(form)

    if (validationError) {
      setError(validationError)
      return
    }

    setStatus('saving')
    setNotice('')
    setError('')

    try {
      const versionNumber = form.versionNumber.trim()
      const contentUrl = await uploadLegalDocumentFile({
        documentType: form.documentType,
        file: form.file,
        versionNumber,
      })

      await publishLegalDocument({
        contentUrl,
        documentType: form.documentType,
        user,
        versionNumber,
      })
      await refreshDocuments()
      setForm(emptyLegalForm())
      setNotice(`${legalDocumentLabels[form.documentType]} version ${versionNumber} is now active.`)
      setStatus('ready')
    } catch (publishError) {
      setError(publishError.message)
      setStatus('ready')
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Legal documents</p>
          <h2>Terms and privacy</h2>
        </div>
      </div>

      {notice && <p className="admin-alert">{notice}</p>}
      {error && <p className="admin-alert is-error">{error}</p>}

      <div className="admin-legal-grid">
        <div className="admin-legal-active">
          {legalDocumentTypes.map((documentType) => {
            const document = activeByType.get(documentType.value)

            return (
              <article className="admin-legal-card" key={documentType.value}>
                <span className="admin-status is-published">
                  {document ? 'active' : 'missing'}
                </span>
                <h3>{documentType.label}</h3>
                {document ? (
                  <>
                    <p>Version {document.version_number}</p>
                    <span>{formatDate(document.effective_date)}</span>
                    <a href={document.content_url} rel="noreferrer" target="_blank">
                      Open document
                    </a>
                  </>
                ) : (
                  <p>No active version has been published.</p>
                )}
              </article>
            )
          })}
        </div>

        <form className="admin-editor admin-legal-editor" onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <label>
              <span>Document</span>
              <select
                value={form.documentType}
                onChange={(event) => update('documentType', event.target.value)}
              >
                {legalDocumentTypes.map((documentType) => (
                  <option key={documentType.value} value={documentType.value}>
                    {documentType.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Version</span>
              <input
                required
                placeholder="2026.06.19"
                value={form.versionNumber}
                onChange={(event) => update('versionNumber', event.target.value)}
              />
            </label>
            <label className="is-wide">
              <span>Updated file</span>
              <input
                required
                accept=".md,.pdf,.txt,application/pdf,text/markdown,text/plain"
                type="file"
                onChange={(event) => update('file', event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <p className="admin-muted">
            Publishing a new version makes it active immediately. Signed-in users who have not accepted it will be prompted, and guest checkout will show the active version.
          </p>

          <button className="admin-button" disabled={status === 'saving'} type="submit">
            {status === 'saving' ? 'Publishing...' : 'Publish new version'}
          </button>
        </form>
      </div>

      {status === 'loading' && <p className="admin-muted">Loading active legal documents...</p>}
    </section>
  )
}

export default AdminLegalDocuments
