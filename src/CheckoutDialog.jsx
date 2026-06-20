import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { apiRequest } from './api'
import { auth, db } from './firebase'
import { getVisitorId } from './legalIdentity'
import {
  agreeToLegalDocument,
  legalDocumentLabels,
  loadActiveLegalDocuments,
  loadMissingLegalDocumentTypes,
} from './legalDocuments'
import LegalDocumentModal from './LegalDocumentModal'
import { getFriendlyErrorMessage } from './friendlyErrors'

function buyerIdentity() {
  const user = auth?.currentUser

  if (user) {
    return {
      checkoutMode: 'account',
      email: user.email ?? '',
      userId: user.uid,
    }
  }

  return {
    checkoutMode: 'guest',
    email: '',
    userId: `guest:${getVisitorId()}`,
  }
}

function CheckoutDialog({ items, onClose, subtotal }) {
  const [activeDocuments, setActiveDocuments] = useState([])
  const [accepted, setAccepted] = useState({})
  const [buyer, setBuyer] = useState(() => buyerIdentity())
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeModalDoc, setActiveModalDoc] = useState(null)
  const requiredDocuments = useMemo(
    () =>
      buyer.checkoutMode === 'guest'
        ? activeDocuments
        : activeDocuments.filter((document) => document.missingForUser),
    [activeDocuments, buyer.checkoutMode],
  )
  const canSubmit =
    buyer.email.trim() &&
    requiredDocuments.every((document) => accepted[document.document_type]) &&
    items.length > 0

  useEffect(() => {
    let isActive = true

    async function loadDocuments() {
      setStatus('loading')
      setError('')

      try {
        const identity = buyerIdentity()
        let documents = await loadActiveLegalDocuments()

        if (identity.checkoutMode === 'account') {
          const missingTypes = await loadMissingLegalDocumentTypes(identity.userId)
          documents = documents.map((document) => ({
            ...document,
            missingForUser: missingTypes.has(document.document_type),
          }))

          try {
            const userDocSnap = await getDoc(doc(db, 'users', identity.userId))
            if (userDocSnap.exists()) {
              const data = userDocSnap.data()
              if (data.email) {
                identity.email = data.email
              }
            }
          } catch (docError) {
            console.error('Error fetching user profile for checkout email:', docError)
          }
        }

        if (isActive) {
          setBuyer(identity)
          setActiveDocuments(documents)
          setStatus('ready')
        }
      } catch (loadError) {
        if (isActive) {
          setError(getFriendlyErrorMessage(loadError, 'customer'))
          setStatus('error')
        }
      }
    }

    loadDocuments()

    return () => {
      isActive = false
    }
  }, [])

  const submitCheckout = async (event) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setStatus('saving')
    setError('')

    try {
      const agreementResults = []
      const currentUser = auth?.currentUser
      const authHeaders = currentUser
        ? { Authorization: `Bearer ${await currentUser.getIdToken()}` }
        : {}

      for (const document of requiredDocuments) {
        const agreementId = await agreeToLegalDocument({
          documentType: document.document_type,
          user: currentUser,
          userId: buyer.userId,
          versionNumber: document.version_number,
        })

        agreementResults.push(agreementId)
      }

      const checkout = await apiRequest('/api/checkout/create-session', {
        body: JSON.stringify({
          agreement_ids: agreementResults,
          buyer_email: buyer.email.trim(),
          checkout_mode: buyer.checkoutMode,
          items: items.map((item) => ({
            product_id: item.id,
            quantity: 1,
          })),
          user_id: buyer.userId,
        }),
        headers: authHeaders,
        method: 'POST',
      })

      if (!checkout.url) {
        throw new Error(checkout.warning || 'Checkout is not configured.')
      }

      window.location.assign(checkout.url)
    } catch (checkoutError) {
      setError(getFriendlyErrorMessage(checkoutError, 'customer'))
      setStatus('ready')
    }
  }

  return (
    <div className="checkout-dialog">
      <button aria-label="Close checkout" className="drawer-backdrop" type="button" onClick={onClose} />
      <form className="checkout-panel" onSubmit={submitCheckout}>
        <div className="cart-panel-head">
          <div>
            <p className="cart-kicker">Checkout</p>
            <h2>Review consent</h2>
          </div>
          <button className="cart-remove-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {status === 'loading' && <p className="checkout-note">Loading checkout requirements...</p>}
        {error && <p className="checkout-error" role="alert">{error}</p>}

        <label className="checkout-field">
          <span>Email</span>
          <input
            required
            autoComplete="email"
            type="email"
            value={buyer.email}
            onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))}
          />
        </label>

        <div className="checkout-summary-line">
          <span>Total before tax and shipping</span>
          <strong>{subtotal}</strong>
        </div>

        <fieldset className="checkout-legal">
          <legend>Legal agreements</legend>
          {activeDocuments.length === 0 ? (
            <p className="checkout-note">No legal agreements are currently active.</p>
          ) : requiredDocuments.length === 0 ? (
            <p className="checkout-note">
              {buyer.checkoutMode === 'account'
                ? 'Your account has accepted the active legal documents.'
                : 'All active legal documents have been accepted.'}
            </p>
          ) : (
            requiredDocuments.map((document) => (
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
            ))
          )}
        </fieldset>

        <button className="button primary checkout-button" disabled={!canSubmit || status === 'saving'} type="submit">
          {status === 'saving' ? 'Starting checkout...' : 'Continue to payment'}
        </button>
      </form>
      <LegalDocumentModal
        isOpen={activeModalDoc !== null}
        onClose={() => setActiveModalDoc(null)}
        {...activeModalDoc}
      />
    </div>
  )
}

export default CheckoutDialog
