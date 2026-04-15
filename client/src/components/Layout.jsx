import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  Inbox,
  Settings,
  PackageCheck,
  Shield,
  AlertCircle,
  DollarSign,
  Users,
  FileText,
  History,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { APP_VERSION } from '../lib/version.js'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bookings', label: 'Bookings Intake', icon: Inbox },
  { to: '/processing', label: 'Processing Tracker', icon: Settings },
  { to: '/output', label: 'Output Tracker', icon: PackageCheck },
  { to: '/quality', label: 'Quality', icon: Shield },
  // TODO(v0.2.0): re-enable Triage Queue when LLM parser + classifier return.
  // { to: '/triage', label: 'Triage Queue', icon: AlertCircle },
  { to: '/pricing', label: 'Pricing Information', icon: DollarSign, adminOnly: true },
  { to: '/team', label: 'Team Management', icon: Users, adminOnly: true },
  { to: '/templates', label: 'Templates', icon: FileText, adminOnly: true },
  { to: '/audit', label: 'Audit Trails', icon: History },
]

export default function Layout() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const filteredNav = navItems.filter(
    (item) => !item.adminOnly || role === 'admin'
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } bg-amber-400 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-amber-500/30">
          {!collapsed && (
            <span className="text-lg font-bold text-gray-900">Linkworks CRM</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-amber-500/30 text-gray-800"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-800 hover:bg-amber-500/30'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Version + Sign out */}
        <div className="px-2 py-3 border-t border-amber-500/30">
          {!collapsed && (
            <div className="px-3 pb-2 text-xs text-amber-800/60">v{APP_VERSION}</div>
          )}
        </div>
        <div className="px-2 pb-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-800 hover:bg-amber-500/30 w-full"
            title={collapsed ? 'Sign Out' : undefined}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">Linkworks</span>
            <span className="text-xl font-bold text-gray-400">.AI</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-sm">
                <div className="font-medium text-gray-700">
                  {user?.email?.split('@')[0] || 'User'}
                </div>
                <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 font-medium">
                  {role || 'member'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
