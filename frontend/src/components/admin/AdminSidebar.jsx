"use client";

import { useUserMenu } from '../hooks/useUserMenu';

function AdminSidebar({
  activeSection,
  onSectionChange,
  pendingApplications = 0,
  pendingInvestorsCount = 0,
  onLogout,
  isMobile,
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
                onSectionChange(item.key);
              }}
            >
              <i className={`fas ${item.icon} me-2`} />
              <span>{item.label}</span>
              {item.key === "applications" && pendingApplications > 0 && (
                <span className="badge bg-danger ms-2">{pendingApplications}</span>
              )}
              {item.key === "investors" && pendingInvestorsCount > 0 && (
                <span className="badge bg-danger ms-2">{pendingInvestorsCount}</span>
              )}
            </a>
          </li>
        ))}
        {isMobile && (
          <li className="nav-item mt-auto">
            <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); onLogout?.(); }}>
              <i className="fas fa-sign-out-alt me-2" /><span>Logout</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

export default AdminSidebar;