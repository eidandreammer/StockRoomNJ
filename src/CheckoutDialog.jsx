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

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

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

function CheckoutDialog({ items = [], onClose, subtotal, orderId }) {
  const [activeDocuments, setActiveDocuments] = useState([])
  const [accepted, setAccepted] = useState({})
  const [buyer, setBuyer] = useState(() => buyerIdentity())
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeModalDoc, setActiveModalDoc] = useState(null)
  
  const [orderDetails, setOrderDetails] = useState(null)
  const [fulfillmentMethod, setFulfillmentMethod] = useState('pickup')
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
  })
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  const requiredDocuments = useMemo(
    () =>
      buyer.checkoutMode === 'guest'
        ? activeDocuments
        : activeDocuments.filter((document) => document.missingForUser),
    [activeDocuments, buyer.checkoutMode],
  )

  const isFulfillmentValid = useMemo(() => {
    if (fulfillmentMethod === 'pickup') {
      return Boolean(contactName.trim())
    }
    return Boolean(
      shippingAddress.full_name.trim() &&
      shippingAddress.street.trim() &&
      shippingAddress.city.trim() &&
      shippingAddress.state.trim() &&
      shippingAddress.zip.trim() &&
      shippingAddress.country.trim()
    )
  }, [fulfillmentMethod, contactName, shippingAddress])

  const canSubmit =
    buyer.email.trim() &&
    requiredDocuments.every((document) => accepted[document.document_type]) &&
    (Boolean(orderId) || items.length > 0) &&
    isFulfillmentValid

  useEffect(() => {
    let isActive = true

    async function loadData() {
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
              if (data.displayName) {
                setContactName(data.displayName)
                setShippingAddress((curr) => ({
                  ...curr,
                  full_name: data.displayName,
                }))
              }
              if (data.shippingAddress) {
                setShippingAddress((curr) => ({
                  ...curr,
                  street: data.shippingAddress.street || '',
                  city: data.shippingAddress.city || '',
                  state: data.shippingAddress.state || '',
                  zip: data.shippingAddress.zip || '',
                  country: data.shippingAddress.country || 'US',
                  phone: data.shippingAddress.phone || data.phone || '',
                }))
                if (data.shippingAddress.phone || data.phone) {
                  setContactPhone(data.shippingAddress.phone || data.phone)
                }
              }
            }
          } catch (docError) {
            console.error('Error fetching user profile for checkout email:', docError)
          }
        }

        let loadedOrderDetails = null
        if (orderId) {
          loadedOrderDetails = await apiRequest(`/api/orders/details?order_id=${orderId}`)
          if (loadedOrderDetails.buyerEmail) {
            identity.email = loadedOrderDetails.buyerEmail
          }
          if (loadedOrderDetails.customerName) {
            setContactName(loadedOrderDetails.customerName)
            setShippingAddress((curr) => ({ ...curr, full_name: loadedOrderDetails.customerName }))
          }
          if (loadedOrderDetails.paymentDueAt) {
            const dueDate = new Date(loadedOrderDetails.paymentDueAt)
            if (Date.now() >= dueDate.getTime()) {
              throw new Error('The payment window for this approved bid has expired. Please contact support.')
            }
          }
        }

        if (isActive) {
          setBuyer(identity)
          setActiveDocuments(documents)
          setOrderDetails(loadedOrderDetails)
          setStatus('ready')
        }
      } catch (loadError) {
        if (isActive) {
          setError(getFriendlyErrorMessage(loadError, 'customer'))
          setStatus('error')
        }
      }
    }

    loadData()

    return () => {
      isActive = false
    }
  }, [orderId])

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
          email: buyer.email,
          context: orderId ? { orderId } : { cart: true },
        })

        agreementResults.push(agreementId)
      }

      const finalFulfillmentData = {
        fulfillment_method: fulfillmentMethod,
        customer_name: fulfillmentMethod === 'pickup' ? contactName.trim() : shippingAddress.full_name.trim(),
        customer_phone: (fulfillmentMethod === 'pickup' ? contactPhone : shippingAddress.phone || '').trim(),
      }

      if (fulfillmentMethod === 'shipping') {
        finalFulfillmentData.shipping_address = {
          full_name: shippingAddress.full_name.trim(),
          street: shippingAddress.street.trim(),
          city: shippingAddress.city.trim(),
          state: shippingAddress.state.trim(),
          zip: shippingAddress.zip.trim(),
          country: shippingAddress.country.trim(),
          phone: (shippingAddress.phone || '').trim(),
        }
      }

      if (orderId) {
        // Pre-existing bid order checkout
        const result = await apiRequest('/api/orders/select-fulfillment', {
          body: JSON.stringify({
            order_id: orderId,
            ...finalFulfillmentData,
          }),
          headers: authHeaders,
          method: 'POST',
        })

        if (result.alreadyPaid) {
          setStatus('completed')
          setTimeout(() => {
            onClose()
          }, 3000)
        } else if (result.stripeCheckoutUrl) {
          window.location.assign(result.stripeCheckoutUrl)
        } else {
          throw new Error('Payment checkout URL could not be retrieved.')
        }
      } else {
        // Standard cart checkout
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
            ...finalFulfillmentData,
          }),
          headers: authHeaders,
          method: 'POST',
        })

        if (!checkout.url) {
          throw new Error(checkout.warning || 'Checkout is not configured.')
        }

        window.location.assign(checkout.url)
      }
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
            <h2>{orderId ? 'Select Fulfillment' : 'Review consent'}</h2>
          </div>
          <button className="cart-remove-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {status === 'loading' && <p className="checkout-note">Loading checkout requirements...</p>}
        {error && <p className="checkout-error" role="alert">{error}</p>}

        {status === 'completed' ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', color: '#16a34a', marginBottom: '16px' }}>✓</div>
            <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>Fulfillment Saved</h2>
            <p style={{ color: '#475569', lineHeight: '1.6' }}>
              Thank you! Your shipping/pickup preference has been successfully registered. This window will close shortly.
            </p>
          </div>
        ) : (
          status !== 'loading' && (
            <>
              {orderId && orderDetails && orderDetails.paymentDueAt && (
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#b45309', lineHeight: '1.5' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '700', fontSize: '14px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⏰</span> Complete payment within 48 hours
                  </p>
                  <p style={{ margin: '0 0 6px 0' }}>
                    Payment is due by: <strong>{new Date(orderDetails.paymentDueAt).toLocaleString()}</strong>
                  </p>
                  <p style={{ margin: '0 0 6px 0', fontWeight: '600' }}>
                    Your item is not yours until payment is complete.
                  </p>
                  <p style={{ margin: '0 0 6px 0', fontStyle: 'italic' }}>
                    If the Stripe checkout page expires, reopen your payment link or contact support.
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#d97706' }}>
                    The 48-hour deadline does not automatically extend when a checkout link is refreshed.
                  </p>
                </div>
              )}

              <label className="checkout-field">
                <span>Email</span>
                <input
                  required
                  readOnly={Boolean(orderId)}
                  autoComplete="email"
                  type="email"
                  value={buyer.email}
                  onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))}
                />
              </label>

              <fieldset className="checkout-fulfillment" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '16px 0' }}>
                <legend style={{ fontWeight: '600', padding: '0 8px', color: '#0f172a' }}>Fulfillment Method</legend>
                <div style={{ display: 'flex', gap: '24px', margin: '8px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fulfillmentMethod"
                      value="pickup"
                      checked={fulfillmentMethod === 'pickup'}
                      onChange={() => setFulfillmentMethod('pickup')}
                    />
                    <span>In-store Pickup</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fulfillmentMethod"
                      value="shipping"
                      checked={fulfillmentMethod === 'shipping'}
                      onChange={() => setFulfillmentMethod('shipping')}
                    />
                    <span>Ship to Address</span>
                  </label>
                </div>
              </fieldset>

              {fulfillmentMethod === 'pickup' && (
                <div className="pickup-details" style={{ margin: '16px 0' }}>
                  <label className="checkout-field">
                    <span>Pickup Contact Name</span>
                    <input
                      required
                      type="text"
                      placeholder="Who will pick up this order?"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </label>
                  <label className="checkout-field">
                    <span>Phone Number (Optional)</span>
                    <input
                      type="tel"
                      placeholder="For pickup notifications"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </label>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#475569', marginTop: '12px', lineHeight: '1.5' }}>
                    <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#0f172a' }}>Pickup Expectations:</p>
                    <p style={{ margin: 0 }}>
                      Pickup Location: <strong>The Stock Room, 66 Union Blvd, Wallington, NJ 07057</strong>.<br/>
                      Orders are typically ready within 24-48 hours. Please wait for an email confirmation stating your order is ready before visiting the store.
                    </p>
                  </div>
                </div>
              )}

              {fulfillmentMethod === 'shipping' && (
                <div className="shipping-details" style={{ margin: '16px 0' }}>
                  <label className="checkout-field">
                    <span>Full Name</span>
                    <input
                      required
                      type="text"
                      placeholder="Recipient's full name"
                      value={shippingAddress.full_name}
                      onChange={(e) => setShippingAddress((curr) => ({ ...curr, full_name: e.target.value }))}
                    />
                  </label>
                  <label className="checkout-field">
                    <span>Street Address</span>
                    <input
                      required
                      type="text"
                      placeholder="123 Main St"
                      value={shippingAddress.street}
                      onChange={(e) => setShippingAddress((curr) => ({ ...curr, street: e.target.value }))}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <label className="checkout-field">
                      <span>City</span>
                      <input
                        required
                        type="text"
                        placeholder="City"
                        value={shippingAddress.city}
                        onChange={(e) => setShippingAddress((curr) => ({ ...curr, city: e.target.value }))}
                      />
                    </label>
                    <label className="checkout-field">
                      <span>State</span>
                      <input
                        required
                        type="text"
                        placeholder="NJ"
                        value={shippingAddress.state}
                        onChange={(e) => setShippingAddress((curr) => ({ ...curr, state: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <label className="checkout-field">
                      <span>Zip Code</span>
                      <input
                        required
                        type="text"
                        placeholder="07057"
                        value={shippingAddress.zip}
                        onChange={(e) => setShippingAddress((curr) => ({ ...curr, zip: e.target.value }))}
                      />
                    </label>
                    <label className="checkout-field">
                      <span>Country</span>
                      <input
                        required
                        type="text"
                        placeholder="US"
                        value={shippingAddress.country}
                        onChange={(e) => setShippingAddress((curr) => ({ ...curr, country: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="checkout-field">
                    <span>Phone Number (Optional)</span>
                    <input
                      type="tel"
                      placeholder="For shipping updates"
                      value={shippingAddress.phone}
                      onChange={(e) => setShippingAddress((curr) => ({ ...curr, phone: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              <div className="checkout-summary-line">
                <span>Total before tax and shipping</span>
                <strong>{orderId && orderDetails ? priceFormatter.format(orderDetails.amount) : subtotal}</strong>
              </div>
              <p className="checkout-note" style={{ fontSize: '12px', margin: '4px 0 16px 0', color: '#64748b', fontStyle: 'italic' }}>
                * Sales tax and shipping cost handling are explicit. Tax and shipping (if applicable) will be added and detailed on the secure Stripe payment page.
              </p>

              <div className="checkout-confirmation-summary" style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', lineHeight: '1.4' }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#334155' }}>Fulfillment Summary:</p>
                <p style={{ margin: 0, color: '#475569' }}>
                  {fulfillmentMethod === 'pickup' ? (
                    <span>You selected: <strong>In-store Pickup</strong> at Wallington, NJ. (Pickup contact: {contactName || 'N/A'})</span>
                  ) : (
                    <span>You selected: <strong>Shipping</strong> to {shippingAddress.street || 'N/A'}, {shippingAddress.city || 'N/A'}, {shippingAddress.state || 'N/A'} {shippingAddress.zip || 'N/A'}</span>
                  )}
                </p>
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
                {status === 'saving' ? 'Starting checkout...' : orderId && orderDetails && orderDetails.status === 'paid_pending_fulfillment' ? 'Confirm Fulfillment' : 'Continue to payment'}
              </button>
            </>
          )
        )}
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
