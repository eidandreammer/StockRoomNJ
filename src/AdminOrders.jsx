import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { authorizedApiRequest } from './api'
import { db } from './firebase'
import { getFriendlyErrorMessage } from './friendlyErrors'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

const formatTimestamp = (ts) => {
  if (!ts) return ''
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString()
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString()
  return new Date(ts).toLocaleString()
}

function AdminOrders({ user }) {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState('')

  // Form states for updates
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [pickupInstructions, setPickupInstructions] = useState('')
  const [explicitOverride, setExplicitOverride] = useState(false)
  const [activeFormOrderId, setActiveFormOrderId] = useState('')

  useEffect(() => {
    if (!db) return undefined

    const ordersQuery = query(collection(db, 'orders'))

    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setStatus('ready')
        setError('')
      },
      (snapshotError) => {
        setStatus('error')
        setError(getFriendlyErrorMessage(snapshotError, 'admin'))
      },
    )
  }, [])

  const sortedOrders = useMemo(() => {
    return orders.slice().sort((a, b) => {
      const aMillis = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
      const bMillis = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0
      return bMillis - aMillis
    })
  }, [orders])

  const submitUpdate = async (order, method) => {
    setUpdatingId(order.id)
    setNotice('')
    setError('')

    try {
      const payload = {
        order_id: order.id,
        shipping_method: method,
        explicit_override: explicitOverride,
      }

      if (method === 'shipping') {
        payload.carrier = carrier.trim()
        payload.tracking_number = trackingNumber.trim()
      } else {
        payload.pickup_instructions = pickupInstructions.trim()
      }

      await authorizedApiRequest('/api/admin/orders/update-shipping', user, {
        body: JSON.stringify(payload),
        method: 'POST',
      })

      setNotice(`Successfully updated order ${order.id} to ${method === 'shipping' ? 'shipped' : 'ready for pickup'}.`)
      setActiveFormOrderId('')
      setCarrier('')
      setTrackingNumber('')
      setPickupInstructions('')
      setExplicitOverride(false)
    } catch (updateError) {
      setError(getFriendlyErrorMessage(updateError, 'admin'))
    } finally {
      setUpdatingId('')
    }
  }

  const extendDeadline = async (order, extendHours = 48, reason = 'Admin extension') => {
    setUpdatingId(order.id)
    setNotice('')
    setError('')

    try {
      await authorizedApiRequest('/api/admin/orders/extend-deadline', user, {
        body: JSON.stringify({
          order_id: order.id,
          extend_hours: extendHours,
          reason: reason,
        }),
        method: 'POST',
      })

      setNotice(`Successfully extended deadline for order ${order.id} by ${extendHours} hours and resent the payment link email.`)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'admin'))
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <section className="admin-panel" style={{ marginTop: '32px' }}>
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Order Fulfillment</p>
          <h2>Manage Orders</h2>
        </div>
      </div>

      {notice && <p className="admin-alert">{notice}</p>}
      {error && <p className="admin-alert is-error">{error}</p>}
      {status === 'loading' && <p className="admin-muted">Loading orders...</p>}

      <div className="admin-event-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {status === 'ready' && sortedOrders.length === 0 && (
          <p className="admin-muted">No orders found.</p>
        )}
        {sortedOrders.map((order) => {
          const isFulfilling = activeFormOrderId === order.id
          const originalMethod = order.fulfillmentMethod || 'shipping'

          return (
            <article 
              className="admin-event-item" 
              key={order.id} 
              style={{ 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px', 
                padding: '20px', 
                background: '#ffffff',
                display: 'block'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <span className={`admin-status ${order.status === 'paid' ? 'is-published' : order.status === 'paid_pending_fulfillment' ? 'is-draft' : 'is-cancelled'}`} style={{ marginRight: '8px' }}>
                    {order.status}
                  </span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Order ID: {order.id}</span>
                  <h3 style={{ margin: '8px 0', fontSize: '18px' }}>
                    {order.productName || (order.items && order.items.map((i) => i.productName).join(', ')) || 'Collectible Order'}
                  </h3>
                  <p style={{ margin: '4px 0', fontWeight: '600', color: '#10b981' }}>
                    {priceFormatter.format(Number(order.amount) || 0)}
                  </p>
                  <div style={{ fontSize: '14px', color: '#475569', marginTop: '12px' }}>
                    <p style={{ margin: '2px 0' }}><strong>Customer:</strong> {order.customerName || 'N/A'} ({order.buyerEmail})</p>
                    {order.customerPhone && <p style={{ margin: '2px 0' }}><strong>Phone:</strong> {order.customerPhone}</p>}
                    <p style={{ margin: '2px 0' }}><strong>Method:</strong> {order.fulfillmentMethod === 'pickup' ? 'In-store Pickup' : 'Shipping'}</p>
                    {order.fulfillmentMethod === 'shipping' && order.shippingAddress && (
                      <p style={{ margin: '2px 0', paddingLeft: '8px', borderLeft: '2px solid #e2e8f0' }}>
                        <strong>Address:</strong> {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}, {order.shippingAddress.country}
                      </p>
                    )}
                    {order.fulfillmentMethod === 'pickup' && (
                      <p style={{ margin: '2px 0', paddingLeft: '8px', borderLeft: '2px solid #e2e8f0' }}>
                        <strong>Location:</strong> {order.pickupLocation || 'The Stock Room'}
                      </p>
                    )}
                    {order.fulfillmentStatus && (
                      <p style={{ margin: '2px 0' }}><strong>Fulfillment Status:</strong> {order.fulfillmentStatus}</p>
                    )}
                    {order.carrier && <p style={{ margin: '2px 0' }}><strong>Carrier:</strong> {order.carrier}</p>}
                    {order.trackingNumber && <p style={{ margin: '2px 0' }}><strong>Tracking #:</strong> {order.trackingNumber}</p>}
                    {order.pickupInstructions && <p style={{ margin: '2px 0' }}><strong>Pickup Instructions:</strong> {order.pickupInstructions}</p>}
                    {order.paymentDueAt && (
                      <p style={{ margin: '2px 0', color: '#b45309', fontWeight: '500' }}>
                        <strong>Payment Due:</strong> {formatTimestamp(order.paymentDueAt)}
                      </p>
                    )}
                  </div>
                </div>

                {order.status === 'paid' && order.fulfillmentStatus !== 'shipped' && order.fulfillmentStatus !== 'ready_for_pickup' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {!isFulfilling ? (
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => {
                          setActiveFormOrderId(order.id)
                          setExplicitOverride(false)
                        }}
                      >
                        Fulfill Order
                      </button>
                    ) : (
                      <button
                        className="admin-button is-secondary"
                        type="button"
                        onClick={() => setActiveFormOrderId('')}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}

                {(order.status === 'awaiting_payment' || order.status === 'expired' || order.status === 'approved_awaiting_payment') && order.bidId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '240px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>Extend Deadline:</span>
                    <select
                      id={`extend-select-${order.id}`}
                      defaultValue="48"
                      style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#ffffff', color: '#0f172a' }}
                    >
                      <option value="24">24 hours</option>
                      <option value="48">48 hours</option>
                      <option value="72">72 hours</option>
                      <option value="168">7 days</option>
                    </select>
                    <input
                      id={`extend-reason-${order.id}`}
                      type="text"
                      placeholder="Reason for extension"
                      defaultValue="Customer requested"
                      style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#ffffff', color: '#0f172a' }}
                    />
                    <button
                      className="admin-button"
                      disabled={updatingId === order.id}
                      type="button"
                      style={{ padding: '6px 12px', fontSize: '13px' }}
                      onClick={() => {
                        const selectEl = document.getElementById(`extend-select-${order.id}`)
                        const reasonEl = document.getElementById(`extend-reason-${order.id}`)
                        const hours = selectEl ? Number(selectEl.value) : 48
                        const reason = reasonEl ? reasonEl.value.trim() : 'Admin extension'
                        extendDeadline(order, hours, reason)
                      }}
                    >
                      {updatingId === order.id ? 'Extending...' : 'Extend & Resend Email'}
                    </button>
                  </div>
                )}
              </div>

              {isFulfilling && (
                <div style={{ marginTop: '20px', borderTop: '1px dashed #cbd5e1', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Fulfill via {originalMethod === 'pickup' ? 'Pickup' : 'Shipping'}</h4>
                  
                  {originalMethod === 'shipping' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                      <label className="admin-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>Carrier</span>
                        <input
                          required
                          type="text"
                          placeholder="e.g. USPS, UPS, FedEx"
                          value={carrier}
                          onChange={(e) => setCarrier(e.target.value)}
                          style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        />
                      </label>
                      <label className="admin-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>Tracking Number</span>
                        <input
                          required
                          type="text"
                          placeholder="Tracking Link/ID"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        />
                      </label>
                      <button
                        className="admin-button"
                        disabled={updatingId === order.id || !carrier.trim() || !trackingNumber.trim()}
                        type="button"
                        onClick={() => submitUpdate(order, 'shipping')}
                      >
                        {updatingId === order.id ? 'Updating...' : 'Mark as Shipped'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                      <label className="admin-field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>Pickup Instructions</span>
                        <textarea
                          placeholder="e.g. Please ask for your order at the front register."
                          value={pickupInstructions}
                          onChange={(e) => setPickupInstructions(e.target.value)}
                          style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', minHeight: '80px' }}
                        />
                      </label>
                      <button
                        className="admin-button"
                        disabled={updatingId === order.id}
                        type="button"
                        onClick={() => submitUpdate(order, 'pickup')}
                      >
                        {updatingId === order.id ? 'Updating...' : 'Mark Ready for Pickup'}
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id={`override-${order.id}`}
                      checked={explicitOverride}
                      onChange={(e) => setExplicitOverride(e.target.checked)}
                    />
                    <label htmlFor={`override-${order.id}`} style={{ fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
                      Allow explicit override (e.g. shipping a pickup order, or vice-versa)
                    </label>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default AdminOrders
