import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'
import {
  agreeToLegalDocument,
  legalDocumentLabels,
  loadActiveLegalDocuments,
  loadMissingLegalDocumentTypes,
} from './legalDocuments'
import LegalDocumentModal from './LegalDocumentModal'
import { getFriendlyErrorMessage } from './friendlyErrors'

function getActiveDocsCacheKey(activeDocs) {
  if (!activeDocs || !Array.isArray(activeDocs)) return ''
  return activeDocs
    .map((doc) => `${doc.document_type}:${doc.version_number}`)
    .sort()
    .join(',')
}

function getCachedActiveDocuments() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const data = sessionStorage.getItem('stockroom_active_legal_docs')
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

function cacheActiveDocuments(documents) {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem('stockroom_active_legal_docs', JSON.stringify(documents))
  } catch {
    // Ignore
  }
}

function getCachedUserConsent(userId) {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage.getItem(`stockroom_legal_consent_${userId}`)
  } catch {
    return null
  }
}

function cacheUserConsent(userId, cacheKey) {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(`stockroom_legal_consent_${userId}`, cacheKey)
  } catch {
    // Ignore
  }
}

function LegalConsentPrompt() {
  const [user, setUser] = useState(auth?.currentUser ?? null)
  const [documents, setDocuments] = useState([])
  const [accepted, setAccepted] = useState({})
  const [status, setStatus] = useState(() => {
    if (!auth?.currentUser) {
      return 'idle'
    }
    const activeDocs = getCachedActiveDocuments()
    if (activeDocs) {
      const activeKey = getActiveDocsCacheKey(activeDocs)
      const cachedConsentKey = getCachedUserConsent(auth.currentUser.uid)
      if (cachedConsentKey === activeKey) {
        return 'clear'
      }
    }
    return 'checking'
  })
  const [error, setError] = useState('')
  const [activeModalDoc, setActiveModalDoc] = useState(null)

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return undefined
    }

    return onAuthStateChanged(auth, (nextUser) => setUser(nextUser))
  }, [])

  useEffect(() => {
    if (!user) {
      return undefined
    }

    let isActive = true

    async function loadConsentState() {
      const cachedActive = getCachedActiveDocuments()
      if (cachedActive) {
        const activeKey = getActiveDocsCacheKey(cachedActive)
        const cachedConsentKey = getCachedUserConsent(user.uid)
        if (cachedConsentKey === activeKey) {
          if (isActive) {
            setDocuments([])
            setAccepted({})
            setStatus('clear')
          }
          return
        }
      }

      setStatus('checking')
      setError('')

      try {
        let activeDocuments = cachedActive
        if (!activeDocuments) {
          activeDocuments = await loadActiveLegalDocuments()
          if (isActive) {
            cacheActiveDocuments(activeDocuments)
          }
        }

        const activeKey = getActiveDocsCacheKey(activeDocuments)
        const cachedConsentKey = getCachedUserConsent(user.uid)

        if (cachedConsentKey === activeKey) {
          if (isActive) {
            setDocuments([])
            setAccepted({})
            setStatus('clear')
          }
          return
        }

        const missingTypes = await loadMissingLegalDocumentTypes(user.uid)
        const missingDocuments = activeDocuments.filter((document) =>
          missingTypes.has(document.document_type),
        )

        if (isActive) {
          if (missingDocuments.length === 0) {
            cacheUserConsent(user.uid, activeKey)
            setDocuments([])
            setAccepted({})
            setStatus('clear')
          } else {
            setDocuments(missingDocuments)
            setAccepted({})
            setStatus('needs-consent')
          }
        }
      } catch (loadError) {
        if (isActive) {
          setError(getFriendlyErrorMessage(loadError, 'customer'))
          setStatus('error')
        }
      }
    }

    loadConsentState()

    return () => {
      isActive = false
    }
  }, [user])

  const canSubmit = useMemo(
    () => documents.length > 0 && documents.every((document) => accepted[document.document_type]),
    [accepted, documents],
  )

  const submitConsent = async (event) => {
    event.preventDefault()

    if (!canSubmit || !user) {
      return
    }

    setStatus('saving')
    setError('')

    try {
      for (const document of documents) {
        await agreeToLegalDocument({
          documentType: document.document_type,
          user,
          userId: user.uid,
          versionNumber: document.version_number,
          email: user.email,
          context: { prompt: 'legal_consent_prompt' },
        })
      }

      let activeDocs = getCachedActiveDocuments()
      if (!activeDocs) {
        activeDocs = await loadActiveLegalDocuments()
        cacheActiveDocuments(activeDocs)
      }
      const activeKey = getActiveDocsCacheKey(activeDocs)
      cacheUserConsent(user.uid, activeKey)

      setDocuments([])
      setAccepted({})
      setStatus('clear')
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, 'customer'))
      setStatus('needs-consent')
    }
  }

  if (!user || status === 'idle' || status === 'checking' || status === 'clear') {
    return null
  }

  if (documents.length === 0 && status !== 'saving') {
    return null
  }

  return (
    <div className="legal-consent-dialog">
      <div className="drawer-backdrop" />
      <form
        aria-labelledby="legal-consent-title"
        aria-modal="true"
        className="checkout-panel legal-consent-panel"
        role="dialog"
        onSubmit={submitConsent}
      >
        <div className="cart-panel-head">
          <div>
            <p className="cart-kicker">Legal update</p>
            <h2 id="legal-consent-title">Review updated terms</h2>
          </div>
        </div>

        {error && <p className="checkout-error" role="alert">{error}</p>}

        {documents.length > 0 && (
          <>
            <p className="checkout-note">
              Your account needs to accept the latest documents before continuing.
            </p>

            <fieldset className="checkout-legal">
              <legend>Required agreements</legend>
              {documents.map((document) => (
                <label key={document.id}>
                  <input
                    required
                    checked={Boolean(accepted[document.document_type])}
                    type="checkbox"
                    onChange={(event) =>
                      setAccepted((current) => ({
                        ...current,
                        [document.document_type]: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    I agree to the{' '}
                    <a
                      href={document.content_url}
                      rel="noreferrer"
                      target="_blank"
                      onClick={(e) => {
                        e.preventDefault()
                        setActiveModalDoc({
                          contentUrl: document.content_url,
                          documentTitle: legalDocumentLabels[document.document_type] ?? document.document_type,
                          effectiveDate: `Version ${document.version_number}`,
                        })
                      }}
                    >
                      {legalDocumentLabels[document.document_type] ?? document.document_type}
                    </a>{' '}
                    version {document.version_number}.
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        <button
          className="button primary checkout-button"
          disabled={!canSubmit || status === 'saving'}
          type="submit"
        >
          {status === 'saving' ? 'Saving...' : 'Accept and continue'}
        </button>
      </form>
      {activeModalDoc && (
        <LegalDocumentModal
          isOpen={activeModalDoc !== null}
          onClose={() => setActiveModalDoc(null)}
          {...activeModalDoc}
        />
      )}
    </div>
  )
}

export default LegalConsentPrompt
