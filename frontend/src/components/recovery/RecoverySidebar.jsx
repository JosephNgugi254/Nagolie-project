"use client";

import { useUserMenu } from '../hooks/useUserMenu';

function RecoverySidebar({
  activeSection,
  onSectionChange,
  onToggleInbox,
  onLogout,
  isMobile,
  unreadCount = 0,
  onOpenSettings,
  onOpenUtilities,
  userRole,              // already passed from RecoveryModule
  pendingApplications = 0 
}) {
  const { menuItems, loading } = useUserMenu();

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
        {menuItems.map((item) => (
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