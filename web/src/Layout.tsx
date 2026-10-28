import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ClipboardList, Cpu, House, Mic, PanelLeftClose, PanelLeftOpen, Radio, Siren } from 'lucide-react'
import { api } from './api'
import { usePolling } from './hooks'

const NAV = [
  { group: 'Field work', to: '/', label: 'Overview', icon: House, title: 'Today on this device', sub: 'Visits, referrals and sync at a glance' },
  { to: '/visit/new', label: 'New visit', icon: Mic, title: 'New visit', sub: 'Speak the visit. Everything runs on this device.' },
  { to: '/visits', label: 'Visits', icon: ClipboardList, title: 'Visits', sub: 'Records saved here and synced from your team' },
  { to: '/referrals', label: 'Referrals', icon: Siren, title: 'Referrals', sub: 'Households with a confirmed danger sign' },
  { group: 'Team & device', to: '/sync', label: 'Team sync', icon: Radio, title: 'Team sync', sub: 'Peer to peer over the local hotspot, no internet' },
  { to: '/device', label: 'Models & device', icon: Cpu, title: 'Models & device', sub: 'Local QVAC models and this machine' },
]

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#d3df5c" />
      <path d="M9 13v6M13 10v12M17 12v8M21 9.5v13M25 14v4" stroke="#2f3600" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ripoti.sidebar') === 'collapsed')
  useEffect(() => localStorage.setItem('ripoti.sidebar', collapsed ? 'collapsed' : 'open'), [collapsed])
  const { pathname } = useLocation()
  const status = usePolling(api.status, 10000)
  const visits = usePolling(api.visits, 5000)
  const urgent = (visits.data ?? []).filter((v) => v.urgent).length
  const current = [...NAV].reverse().find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))) ?? NAV[0]
  const head = pathname.startsWith('/visits/') ? null : current

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <Link to="/" className="brand">
          <Mark />
          <span className="label">Ripoti</span>
        </Link>
        {NAV.map((n) => (
          <div key={n.to}>
            {n.group && n.to !== '/' && <div className="nav-group">{n.group}</div>}
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`} title={n.label}>
              <n.icon size={18} />
              <span className="label">{n.label}</span>
              {n.to === '/referrals' && urgent > 0 && <span className="count">{urgent}</span>}
            </NavLink>
          </div>
        ))}
        <div className="sidebar-foot">
          {status.data && (
            <div className="device-chip" title="This device">
              <Cpu size={14} /> <b>{status.data.device}</b> · {status.data.role}
            </div>
          )}
          <button className="nav collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="label">Collapse</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="sheet">
          {head && (
            <header className="topbar">
              <div>
                <h1>{head.title}</h1>
                <p>{head.sub}</p>
              </div>
              {pathname !== '/visit/new' && (
                <Link to="/visit/new" className="btn primary"><Mic size={16} /> New visit</Link>
              )}
            </header>
          )}
          <div className="content" style={head ? undefined : { paddingTop: 40 }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
