import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from './api'
import { getFriendlyErrorMessage } from './friendlyErrors'
import './App.css'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function PayApp() {
  // Parse order ID and token from URL
  const { orderId, token } = useMemo(() => {
    if (typeof window === 'undefined') return { orderId: '', token: '' }
    const pathParts = window.location.pathname.split('/')
    const approvedBidIndex = pathParts.indexOf('approved-bid')
    const parsedOrderId = approvedBidIndex !== -1 ? pathParts[approvedBidIndex + 1] : ''
    
    const params = new URLSearchParams(window.location.search)
    const parsedToken = params.get('token') || ''
    
    return { orderId: parsedOrderId, token: parsedToken }
  }, [])

  const [status, setStatus] = useState(() => (!orderId || !token ? 'error' : 'loading')) // 'loading' | 'ready' | 'expired' | 'paid' | 'error'
  const [error, setError] = useState(() => (!orderId || !token ? 'Invalid or incomplete payment link. Please check your email or contact support.' : ''))
  const [submitting, setSubmitting] = useState(false)
  const [orderDetails, setOrderDetails] = useState(null)
  
  // Fulfillment state
  const [fulfillmentMethod, setFulfillmentMethod] = useState('pickup')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
  })

  // Check if checkout parameters exist
  const checkoutStatus = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('checkout')
  }, [])

  useEffect(() => {
    if (!orderId || !token) {
      return
    }

    let isMounted = true

    async function fetchOrderDetails() {
      setStatus('loading')
      setError('')
      try {
        const details = await apiRequest('/api/pay/approved-bid/details', {
          body: JSON.stringify({ order_id: orderId, token }),
          method: 'POST',
        })

        if (!isMounted) return

        setOrderDetails(details)
        
        // If the order is already paid
        if (details.status === 'paid' || details.status === 'paid_pending_fulfillment') {
          setStatus('paid')
          return
        }

        // If the order is expired
        if (details.status === 'expired') {
          setStatus('expired')
          return
        }

        // Populate initial fulfillment selection form if order has existing choices
        if (details.fulfillmentMethod && details.fulfillmentMethod !== 'pending_customer_selection') {
          setFulfillmentMethod(details.fulfillmentMethod)
        }
        if (details.customerName) {
          setContactName(details.customerName)
          setShippingAddress((curr) => ({ ...curr, full_name: details.customerName }))
        }
        if (details.customerPhone) {
          setContactPhone(details.customerPhone)
          setShippingAddress((curr) => ({ ...curr, phone: details.customerPhone }))
        }
        if (details.shippingAddress) {
          setShippingAddress((curr) => ({
            ...curr,
            full_name: details.shippingAddress.fullName || details.shippingAddress.full_name || '',
            street: details.shippingAddress.street || '',
            city: details.shippingAddress.city || '',
            state: details.shippingAddress.state || '',
            zip: details.shippingAddress.zip || '',
            country: details.shippingAddress.country || 'US',
            phone: details.shippingAddress.phone || '',
          }))
        }

        setStatus('ready')
      } catch (err) {
        if (!isMounted) return
        setError(getFriendlyErrorMessage(err, 'customer'))
        setStatus('error')
      }
    }

    fetchOrderDetails()

    return () => {
      isMounted = false
    }
  }, [orderId, token])

  const isFormValid = useMemo(() => {
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

  const handleContinuePayment = async (e) => {
    e.preventDefault()

    if (orderDetails.fulfillmentMethod === 'pending_customer_selection' && !isFormValid) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const payload = {
        order_id: orderId,
        token,
      }

      if (orderDetails.fulfillmentMethod === 'pending_customer_selection') {
        payload.fulfillment_method = fulfillmentMethod
        payload.customer_name = fulfillmentMethod === 'pickup' ? contactName.trim() : shippingAddress.full_name.trim()
        payload.customer_phone = (fulfillmentMethod === 'pickup' ? contactPhone : shippingAddress.phone || '').trim()

        if (fulfillmentMethod === 'shipping') {
          payload.shipping_address = {
            full_name: shippingAddress.full_name.trim(),
            street: shippingAddress.street.trim(),
            city: shippingAddress.city.trim(),
            state: shippingAddress.state.trim(),
            zip: shippingAddress.zip.trim(),
            country: shippingAddress.country.trim(),
            phone: (shippingAddress.phone || '').trim(),
          }
        }
      }

      const result = await apiRequest('/api/pay/approved-bid/checkout', {
        body: JSON.stringify(payload),
        method: 'POST',
      })

      if (result.status === 'paid') {
        setStatus('paid')
      } else if (result.url) {
        window.location.assign(result.url)
      } else {
        throw new Error('Payment checkout URL could not be retrieved.')
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'customer'))
      setSubmitting(false)
    }
  }

  return (
    <div className="pay-app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '20px 0', textAlign: 'center' }}>
        <a href="/" style={{ display: 'inline-block' }}>
          <img
            src="https://stockroomnj.com/segundo%20logo%20the%20stock%20room.png"
            alt="The Stock Room"
            style={{ height: '48px', width: 'auto', margin: '0 auto' }}
          />
        </a>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', maxWidth: '580px', width: '100%', padding: '32px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)' }}>
          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="pulse-dot" style={{ width: '16px', height: '16px', margin: '0 auto 20px auto' }}></div>
              <p style={{ color: '#64748b', fontSize: '15px' }}>Verifying payment link details...</p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '48px', color: '#ef4444', marginBottom: '16px' }}>⚠️</div>
              <h2 style={{ color: '#0f172a', marginBottom: '8px', fontSize: '20px' }}>Payment Error</h2>
              <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '24px' }}>{error || 'An unexpected error occurred.'}</p>
              <a className="button primary" href="/shop" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Back to Shop
              </a>
            </div>
          )}

          {status === 'expired' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '48px', color: '#f59e0b', marginBottom: '16px' }}>⌛</div>
              <h2 style={{ color: '#0f172a', marginBottom: '12px', fontSize: '20px' }}>Payment Link Expired</h2>
              <p style={{ color: '#475569', lineHeight: '1.6', marginBottom: '16px', fontSize: '15px' }}>
                The payment deadline for this approved bid has expired.
              </p>
              <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '28px', fontSize: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                If you need to extend the payment window or request a new link, please contact support at <strong>admin@stockroomnj.com</strong> or call <strong>(609) 459-5069</strong>.
              </p>
              <a className="button secondary" href="/shop" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Return to Shop
              </a>
            </div>
          )}

          {status === 'paid' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '56px', color: '#16a34a', marginBottom: '16px' }}>✓</div>
              <h2 style={{ color: '#0f172a', marginBottom: '12px', fontSize: '22px' }}>Payment Confirmed</h2>
              <p style={{ color: '#475569', lineHeight: '1.6', marginBottom: '24px', fontSize: '15px' }}>
                Thank you! Payment for <strong>{orderDetails?.productName}</strong> has been received and confirmed.
              </p>
              
              {orderDetails && (
                <div style={{ textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '28px', fontSize: '14px', lineHeight: '1.6' }}>
                  <p style={{ margin: '0 0 6px 0' }}><strong>Item Name:</strong> {orderDetails.productName}</p>
                  <p style={{ margin: '0 0 6px 0' }}><strong>Amount Paid:</strong> {priceFormatter.format(orderDetails.amount)}</p>
                  <p style={{ margin: '0 0 6px 0' }}><strong>Fulfillment Method:</strong> {orderDetails.fulfillmentMethod === 'pickup' ? 'In-store Pickup' : 'Shipping'}</p>
                  {orderDetails.fulfillmentMethod === 'shipping' && orderDetails.shippingAddress && (
                    <p style={{ margin: '6px 0 0 0', paddingLeft: '8px', borderLeft: '2px solid #cbd5e1' }}>
                      <strong>Address:</strong><br />
                      {orderDetails.shippingAddress.fullName || orderDetails.shippingAddress.full_name}<br />
                      {orderDetails.shippingAddress.street}<br />
                      {orderDetails.shippingAddress.city}, {orderDetails.shippingAddress.state} {orderDetails.shippingAddress.zip}
                    </p>
                  )}
                  {orderDetails.fulfillmentMethod === 'pickup' && (
                    <p style={{ margin: '0' }}><strong>Location:</strong> 66 Union Blvd, Wallington, NJ 07057</p>
                  )}
                </div>
              )}
              
              <a className="button primary" href="/shop" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Continue Shopping
              </a>
            </div>
          )}

          {status === 'ready' && orderDetails && (
            <form onSubmit={handleContinuePayment}>
              <h2 style={{ color: '#0f172a', marginBottom: '8px', fontSize: '22px', fontWeight: '700' }}>Approved Bid Checkout</h2>
              <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
                Please review your winning bid details and select a fulfillment preference.
              </p>

              {checkoutStatus === 'cancel' && (
                <div style={{ background: '#fef3f2', border: '1px solid #fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                  Payment was cancelled. You can complete it using the form below.
                </div>
              )}

              {error && (
                <div style={{ background: '#fef3f2', border: '1px solid #fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              {/* Order Info Summary */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px', fontSize: '14px', lineHeight: '1.6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>Item Won:</span>
                  <strong style={{ color: '#0f172a' }}>{orderDetails.productName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>Approved Amount:</span>
                  <strong style={{ color: '#16a34a', fontSize: '16px' }}>{priceFormatter.format(orderDetails.amount)}</strong>
                </div>
                {orderDetails.paymentDueAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#b45309' }}>Payment Deadline:</span>
                    <strong style={{ color: '#b45309' }}>{new Date(orderDetails.paymentDueAt).toLocaleString()}</strong>
                  </div>
                )}
              </div>

              {/* Fulfillment Choice Form */}
              {orderDetails.fulfillmentMethod === 'pending_customer_selection' ? (
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 12px 0' }}>Select Fulfillment Method</h3>
                  
                  <div style={{ display: 'flex', gap: '24px', margin: '0 0 20px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' }}>
                      <input
                        type="radio"
                        name="fulfillmentMethod"
                        value="pickup"
                        checked={fulfillmentMethod === 'pickup'}
                        onChange={() => setFulfillmentMethod('pickup')}
                      />
                      <span>In-store Pickup</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' }}>
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

                  {fulfillmentMethod === 'pickup' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '0 0 24px 0' }}>
                      <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Pickup Contact Name</span>
                        <input
                          required
                          type="text"
                          placeholder="Who will pick up this order?"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                      <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Phone Number (Optional)</span>
                        <input
                          type="tel"
                          placeholder="For pickup notifications"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                        Pickup Location: <strong>The Stock Room, 66 Union Blvd, Wallington, NJ 07057</strong>. Please wait for an email stating your order is ready before visiting the store.
                      </div>
                    </div>
                  )}

                  {fulfillmentMethod === 'shipping' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '0 0 24px 0' }}>
                      <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Full Name</span>
                        <input
                          required
                          type="text"
                          placeholder="Recipient's full name"
                          value={shippingAddress.full_name}
                          onChange={(e) => setShippingAddress((curr) => ({ ...curr, full_name: e.target.value }))}
                          style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                      <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Street Address</span>
                        <input
                          required
                          type="text"
                          placeholder="123 Main St"
                          value={shippingAddress.street}
                          onChange={(e) => setShippingAddress((curr) => ({ ...curr, street: e.target.value }))}
                          style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>City</span>
                          <input
                            required
                            type="text"
                            placeholder="City"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress((curr) => ({ ...curr, city: e.target.value }))}
                            style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                          />
                        </div>
                        <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>State</span>
                          <input
                            required
                            type="text"
                            placeholder="NJ"
                            value={shippingAddress.state}
                            onChange={(e) => setShippingAddress((curr) => ({ ...curr, state: e.target.value }))}
                            style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Zip Code</span>
                          <input
                            required
                            type="text"
                            placeholder="07057"
                            value={shippingAddress.zip}
                            onChange={(e) => setShippingAddress((curr) => ({ ...curr, zip: e.target.value }))}
                            style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                          />
                        </div>
                        <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Country</span>
                          <input
                            required
                            type="text"
                            placeholder="US"
                            value={shippingAddress.country}
                            onChange={(e) => setShippingAddress((curr) => ({ ...curr, country: e.target.value }))}
                            style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                          />
                        </div>
                      </div>
                      <div className="checkout-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Phone Number (Optional)</span>
                        <input
                          type="tel"
                          placeholder="For shipping updates"
                          value={shippingAddress.phone}
                          onChange={(e) => setShippingAddress((curr) => ({ ...curr, phone: e.target.value }))}
                          style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '12px', marginBottom: '24px', fontSize: '14px', lineHeight: '1.5' }}>
                  <p style={{ margin: '0 0 6px 0', fontWeight: '600', color: '#334155' }}>Fulfillment Method Selected:</p>
                  <p style={{ margin: 0, color: '#475569' }}>
                    {orderDetails.fulfillmentMethod === 'pickup' ? (
                      <span>In-store Pickup at Wallington, NJ. (Pickup contact: {orderDetails.customerName || 'N/A'})</span>
                    ) : (
                      <span>
                        Shipping to {orderDetails.shippingAddress?.street}, {orderDetails.shippingAddress?.city}, {orderDetails.shippingAddress?.state} {orderDetails.shippingAddress?.zip}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <button
                className="button primary"
                disabled={submitting || (orderDetails.fulfillmentMethod === 'pending_customer_selection' && !isFormValid)}
                type="submit"
                style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: '600' }}
              >
                {submitting ? 'Redirecting to payment...' : 'Continue to secure payment'}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#334155' }}>The Stock Room</p>
        <p style={{ margin: '0' }}>66 Union Blvd, Wallington, NJ 07057 &bull; admin@stockroomnj.com</p>
      </footer>
    </div>
  )
}

export default PayApp
