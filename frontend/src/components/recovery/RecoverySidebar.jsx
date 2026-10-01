"use client";

import { useMemo } from 'react';
import { useUserMenu } from '../hooks/useUserMenu';

// Menu item to inject for the acting-HR (Annie) only.
// Matches the definition in seed_menus_and_roles.py so ordering/icons are consistent.
const ACTING_HR_SALARY_MENU_ITEM = {
  key: 'salaries',
  label: 'Salaries',
  icon: 'fa-wallet',
  path: '/admin/salaries',
  order: 95,
};

// Keep this in sync with the backend ACTING_HR_USERNAMES list.
const ACTING_HR_USERNAMES = ['annie'];

function RecoverySidebar({
  activeSection,
  onSectionChange,
  onToggleInbox,
  onLogout,
  isMobile,
  unreadCount = 0,
  onOpenSettings,
  onOpenUtilities,
  userRole,
  pendingApplications = 0,
  reportsNotifications = 0,
  user,
}) {
  const { menuItems, loading } = useUserMenu();

  // Resolve the current user — prefer the prop, fall back to localStorage.
  const currentUser = useMemo(() => {
    if (user) return user;
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, [user]);

  const isActingHR = ACTING_HR_USERNAMES.includes(
    (currentUser.username || '').toLowerCase()
  );

  // Only Annie gets the extra menu item, and only if the backend
  // didn't already return it (e.g. she later gets an hr_manager role).
  const filteredMenuItems = useMemo(() => {
    if (!isActingHR) return menuItems;
    if (menuItems.some((m) => m.key === 'salaries')) return menuItems;

    const merged = [...menuItems, ACTING_HR_SALARY_MENU_ITEM];
    merged.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return merged;
  }, [menuItems, isActingHR]);

  if (loading) {
    return (
      <div className="sidebar-sticky">
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status">
            <span className="visually-hidden">Loading menu...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-sticky">
      <ul className="nav flex-column h-100">
        {filteredMenuItems.map((item) => (
          <li className="nav-item" key={item.key}>
            <a
              href={item.path}
              className={`nav-link d-flex align-items-center ${activeSection === item.key ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (item.key === "inbox") {
                  onToggleInbox?.();
                } else if (item.key === "settings") {
                  onOpenSettings?.();
                } else if (item.key === "utilities") {
                  onOpenUtilities?.();
                } else {
                  onSectionChange(item.key);
                }
              }}
            >
              <i className={`fas ${item.icon} me-2`} />
              <span>{item.label}</span>
              {item.key === "inbox" && unreadCount > 0 && (
                <span className="badge bg-danger rounded-pill ms-auto">{unreadCount}</span>
              )}
              {item.key === "applications" && pendingApplications > 0 && (
                <span className="badge bg-danger ms-2">{pendingApplications}</span>
              )}
              {item.key === "reports" && reportsNotifications > 0 && (
                <span className="badge bg-danger ms-2">{reportsNotifications}</span>
              )}
            </a>
          </li>
        ))}

        {isMobile && (
          <li className="nav-item mt-auto">
            <a href="#" className="nav-link d-flex align-items-center" onClick={(e) => { e.preventDefault(); onLogout?.(); }}>
              <i className="fas fa-sign-out-alt me-2" /><span>Logout</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

export default RecoverySidebar;