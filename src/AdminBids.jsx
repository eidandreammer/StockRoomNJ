import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { authorizedApiRequest } from './api'
import { db } from './firebase'
import { getFriendlyErrorMessage } from './friendlyErrors'

const priceFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
})

function AdminBids({ user }) {
  const [bids, setBids] = useState([])
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState('')

  useEffect(() => {
    if (!db) {
      return undefined
    }

    const pendingBidsQuery = query(collection(db, 'bids'), where('status', '==', 'pending_admin_approval'))

    return onSnapshot(
      pendingBidsQuery,
      (snapshot) => {
        setBids(snapshot.docs.map((bidDoc) => ({ id: bidDoc.id, ...bidDoc.data() })))
        setStatus('ready')
        setError('')
      },
      (snapshotError) => {
        setStatus('error')
        setError(getFriendlyErrorMessage(snapshotError, 'admin'))
      },
    )
  }, [])

  const sortedBids = useMemo(
    () =>
      bids.slice().sort((a, b) => {
        const aMillis = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
        const bMillis = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0

        return bMillis - aMillis
      }),
    [bids],
  )

  const approveBid = async (bid) => {
    setApprovingId(bid.id)
    setNotice('')
    setError('')

    try {
      const result = await authorizedApiRequest('/api/admin/bids/approve', user, {
        body: JSON.stringify({ bid_id: bid.id }),
        method: 'POST',
      })

      setNotice(`Approved ${priceFormatter.format(result.order.amount)} for ${bid.productName}.`)
    } catch (approveError) {
      setError(getFriendlyErrorMessage(approveError, 'admin'))
    } finally {
      setApprovingId('')
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Auction control</p>
          <h2>Bid approvals</h2>
        </div>
      </div>

      {notice && <p className="admin-alert">{notice}</p>}
      {error && <p className="admin-alert is-error">{error}</p>}
      {status === 'loading' && <p className="admin-muted">Loading pending bids...</p>}

      <div className="admin-event-list">
        {status === 'ready' && sortedBids.length === 0 && (
          <p className="admin-muted">No bids are waiting for approval.</p>
        )}
        {sortedBids.map((bid) => (
          <article className="admin-event-item" key={bid.id}>
            <div>
              <span className="admin-status is-draft">pending</span>
              <h3>{bid.productName}</h3>
              <p>{priceFormatter.format(Number(bid.amount) || 0)}</p>
              <span>{bid.userId}</span>
            </div>
            <button
              className="admin-button"
              disabled={approvingId === bid.id}
              type="button"
              onClick={() => approveBid(bid)}
            >
              {approvingId === bid.id ? 'Approving...' : 'Approve sale'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default AdminBids
