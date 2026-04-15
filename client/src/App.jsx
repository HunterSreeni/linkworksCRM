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
// TODO(v0.2.0): re-enable when classifier + LLM parser land
// import TriageQueue from './pages/TriageQueue'
import PricingInfo from './pages/PricingInfo'
import TeamManagement from './pages/TeamManagement'
import AuditTrails from './pages/AuditTrails'
import RequestDetail from './pages/RequestDetail'
import TemplateManagement from './pages/TemplateManagement'

function TriagePlaceholder() {
  return (
    <div className="max-w-2xl mx-auto mt-16 bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
      <h1 className="text-2xl font-bold text-gray-800 mb-3">Triage Queue</h1>
      <p className="text-gray-500">Coming in v0.2.0 alongside the LLM-based email parser.</p>
      <p className="text-gray-400 text-sm mt-2">Every inbound email now goes straight to Bookings Intake.</p>
    </div>
  )
}

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
            <Route path="/triage" element={<TriagePlaceholder />} />
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
