import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import { Layout } from './Layout'
import { NewVisit } from './pages/NewVisit'
import { Visits } from './pages/Visits'
import { VisitDetail } from './pages/VisitDetail'
import { Referrals } from './pages/Referrals'
import { Sync } from './pages/Sync'
import { Device } from './pages/Device'
import { Overview } from './pages/Overview'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="visit/new" element={<NewVisit />} />
          <Route path="visits" element={<Visits />} />
          <Route path="visits/:id" element={<VisitDetail />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="sync" element={<Sync />} />
          <Route path="device" element={<Device />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
