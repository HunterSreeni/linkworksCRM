import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import BookingsIntake from './pages/BookingsIntake'
import ProcessingTracker from './pages/ProcessingTracker'
import OutputTracker from './pages/OutputTracker'
import Quality from './pages/Quality'
import TriageQueue from './pages/TriageQueue'
import PricingInfo from './pages/PricingInfo'
import TeamManagement from './pages/TeamManagement'
import AuditTrails from './pages/AuditTrails'
import RequestDetail from './pages/RequestDetail'
import TemplateManagement from './pages/TemplateManagement'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/bookings" element={<BookingsIntake />} />
            <Route path="/processing" element={<ProcessingTracker />} />
            <Route path="/output" element={<OutputTracker />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/triage" element={<TriageQueue />} />
            <Route
              path="/pricing"
              element={
                <ProtectedRoute adminOnly>
                  <PricingInfo />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute adminOnly>
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <ProtectedRoute adminOnly>
                  <TemplateManagement />
                </ProtectedRoute>
              }
            />
            <Route path="/audit" element={<AuditTrails />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
