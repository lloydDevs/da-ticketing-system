import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  LayoutDashboard, Ticket, LogOut, Monitor,
  Menu, X, FileSpreadsheet, Bell
} from "lucide-react";
import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

const navItems = [
  { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/tickets", icon: Ticket, label: "All Tickets" },
  { to: "/admin/notifications", icon: Bell, label: "Notifications", isNotif: true },
  { to: "/admin/reports", icon: FileSpreadsheet, label: "Reports" },
];

function SidebarContent({ user, onLogout, onNavClick, unreadCount }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-emerald-900/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">DA-MIMAROPA</div>
            <div className="text-emerald-400 text-[10px] mt-0.5">IT Ticketing · MIS</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, isNotif }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive
                ? "bg-emerald-700 text-white"
                : "text-emerald-400 hover:bg-emerald-900 hover:text-white"
              }`
            }
          >
            {/* Bell icon with pulsing dot */}
            <span className="relative shrink-0">
              <Icon className="w-4 h-4" />
              {isNotif && unreadCount > 0 && (
                <>
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                </>
              )}
            </span>

            <span className="flex-1">{label}</span>

            {/* ✅ Count badge — only shows when there are unreads */}
            {isNotif && unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-emerald-900/60">
        <div className="px-3 py-2.5 rounded-lg bg-emerald-900/50 mb-1">
          <p className="text-emerald-300 text-xs font-medium truncate">{user?.email}</p>
          <p className="text-emerald-500 text-[10px] mt-0.5">Administrator</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-emerald-400 hover:bg-red-950/50 hover:text-red-400 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  useEffect(() => {
    // ✅ Match Notifications.jsx: isViewed !== true means unread
    // Client-side filter avoids composite index requirement
    const unsub = onSnapshot(collection(db, "tickets"), (snap) => {
      const count = snap.docs.filter((d) => d.data().isViewed !== true).length;
      setUnreadCount(count);
    });
    return unsub;
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-52 bg-emerald-950 shrink-0">
        <SidebarContent
          user={user}
          onLogout={handleLogout}
          onNavClick={() => { }}
          unreadCount={unreadCount}
        />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-52 bg-emerald-950 flex flex-col">
            <SidebarContent
              user={user}
              onLogout={handleLogout}
              onNavClick={() => setSidebarOpen(false)}
              unreadCount={unreadCount}
            />
          </div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center justify-between bg-emerald-950 px-4 py-3 border-b border-emerald-900">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
              <Monitor className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-medium text-sm">DA-MIMAROPA IT</span>
          </div>
          <div className="flex items-center gap-2">
            {/* ✅ Mobile topbar badge */}
            {unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-emerald-400 p-1"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}