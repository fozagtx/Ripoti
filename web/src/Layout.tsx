import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, AlertTriangle, ClipboardList, Cpu, Mic, PanelLeftClose, PanelLeftOpen, Radio } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Overview', icon: Activity, title: 'Overview', sub: 'Today on this device' },
  { to: '/visit/new', label: 'New visit', icon: Mic, title: 'New visit', sub: 'Speak the visit. Everything runs on this device.' },
  { to: '/visits', label: 'Visits', icon: ClipboardList, title: 'Visits', sub: 'Records saved here and synced from your team' },
  { to: '/referrals', label: 'Referrals', icon: AlertTriangle, title: 'Referrals', sub: 'Visits with danger signs' },
  { to: '/sync', label: 'Team sync', icon: Radio, title: 'Team sync', sub: 'Peer-to-peer over the local hotspot, no internet' },
  { to: '/device', label: 'Models & device', icon: Cpu, title: 'Models & device', sub: 'Local QVAC models and this machine' },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ripoti.sidebar') === 'collapsed')
  useEffect(() => localStorage.setItem('ripoti.sidebar', collapsed ? 'collapsed' : 'open'), [collapsed])
  const { pathname } = useLocation()
  const current = [...NAV].reverse().find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))) ?? NAV[0]
  const title = pathname.startsWith('/visits/') ? { title: 'Visit record', sub: 'Review, correct and save' } : current

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="label">Ripoti</span>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`} title={n.label}>
            <n.icon size={19} />
            <span className="label">{n.label}</span>
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <button className="nav collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            <span className="label">Collapse</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title.title}</h1>
            <p>{title.sub}</p>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
