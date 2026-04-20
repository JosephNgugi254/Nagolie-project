"use client";

function RecoverySidebar({
  activeSection,
  onSectionChange,
  onToggleInbox,
  onLogout,
  isMobile,
  unreadCount = 0,
  onOpenSettings,
  onOpenUtilities,   // new prop
  userRole           // new prop
}) {
  const menuItems = [
    { id: "recovery", icon: "fa-chart-line", label: "Recovery Module", path: "/recovery" },
    { id: "inbox", icon: "fa-envelope", label: "Inbox", path: "/recovery/inbox" },
    { id: "settings", icon: "fa-cog", label: "Settings", path: "/recovery/settings" }
  ];

  return (
    <div className="sidebar-sticky">
      <ul className="nav flex-column h-100">
        {menuItems.map((item) => (
          <li className="nav-item" key={item.id}>
            <a
              href={item.path}
              className={`nav-link d-flex align-items-center ${activeSection === item.id ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (item.id === "inbox") {
                  onToggleInbox?.();
                } else if (item.id === "settings") {
                  onOpenSettings?.();
                } else {
                  onSectionChange(item.id);
                }
              }}
            >
              <i className={`fas ${item.icon} me-2`} />
              <span>{item.label}</span>
              {item.id === "inbox" && unreadCount > 0 && (
                <span
                  className="badge bg-danger rounded-pill ms-auto"
                  style={{ minWidth: '20px', textAlign: 'center' }}
                >
                  {unreadCount}
                </span>
              )}
            </a>
          </li>
        ))}

        {/* New Utilities Menu Item - Conditionally shown */}
        {(userRole === 'director' || userRole === 'head_of_it' || userRole === 'admin' || 
          userRole === 'valuer' || userRole === 'accountant' || userRole === 'secretary') && (
          <li className="nav-item">
            <a
              href="#"
              className="nav-link d-flex align-items-center"
              onClick={(e) => {
                e.preventDefault();
                onOpenUtilities?.();
              }}
            >
              <i className="fas fa-tools me-2" />
              <span>Utilities</span>
            </a>
          </li>
        )}

        {isMobile && (
          <li className="nav-item mt-auto">
            <a
              href="#"
              className="nav-link d-flex align-items-center"
              onClick={(e) => {
                e.preventDefault();
                onLogout?.();
              }}
            >
              <i className="fas fa-sign-out-alt me-2" />
              <span>Logout</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

export default RecoverySidebar;