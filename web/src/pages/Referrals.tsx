import { api } from '../api'
import { usePolling } from '../hooks'
import { VisitTable } from './Visits'

export function Referrals() {
  const { data } = usePolling(api.visits, 5000)
  const urgent = (data ?? []).filter((v) => v.urgent)
  return (
    <div className="card">
      <h2>Households to refer</h2>
      <p className="sub">Visits where the promoter confirmed at least one danger sign. Refer the same day.</p>
      <VisitTable visits={urgent} empty={<div className="empty"><h3>No referrals</h3><p>No saved visit has a danger sign.</p></div>} />
    </div>
  )
}
