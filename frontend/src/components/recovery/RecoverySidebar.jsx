"use client";

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
  pendingApplications = 0 
}) {
  let menuItems = [];

  if (userRole === 'director') {
    menuItems = [
      { id: "overview", icon: "fa-tachometer-alt", label: "Overview", path: "/recovery" },
      { id: "recovery", icon: "fa-chart-line", label: "Recovery Module", path: "/recovery" },
      { id: "inbox", icon: "fa-envelope", label: "Inbox", path: "/recovery/inbox" },
      { id: "applications", icon: "fa-file-alt", label: "Applications", path: "/recovery/applications", badge: pendingApplications },
      { id: "payment-stats", icon: "fa-chart-bar", label: "Payment Stats", path: "/recovery/payment-stats" },
      { id: "transactions", icon: "fa-exchange-alt", label: "Transactions", path: "/recovery/transactions" },
      { id: "gallery", icon: "fa-images", label: "Livestock Gallery", path: "/recovery/gallery" },
      { id: "investors", icon: "fa-users", label: "Investors", path: "/recovery/investors" },
      { id: "utilities", icon: "fa-tools", label: "Utilities", path: "/recovery/utilities" },
      { id: "settings", icon: "fa-cog", label: "Settings", path: "/recovery/settings" }
    ];
  } else if (userRole === 'secretary' || userRole === 'client_relations_officer') {
    // Same as director – you can remove gallery/investors later if desired
    menuItems = [
      { id: "overview", icon: "fa-tachometer-alt", label: "Overview", path: "/recovery" },
      { id: "recovery", icon: "fa-chart-line", label: "Recovery Module", path: "/recovery" },
      { id: "inbox", icon: "fa-envelope", label: "Inbox", path: "/recovery/inbox" },
      { id: "applications", icon: "fa-file-alt", label: "Applications", path: "/recovery/applications", badge: pendingApplications },
      { id: "payment-stats", icon: "fa-chart-bar", label: "Payment Stats", path: "/recovery/payment-stats" },
      { id: "transactions", icon: "fa-exchange-alt", label: "Transactions", path: "/recovery/transactions" },
      { id: "utilities", icon: "fa-tools", label: "Utilities", path: "/recovery/utilities" },
      { id: "settings", icon: "fa-cog", label: "Settings", path: "/recovery/settings" }
    ];
  } else {
    // Other roles (accountant, valuer, head_of_it)
    menuItems = [
      { id: "recovery", icon: "fa-chart-line", label: "Recovery Module", path: "/recovery" },
      { id: "inbox", icon: "fa-envelope", label: "Inbox", path: "/recovery/inbox" },
      { id: "settings", icon: "fa-cog", label: "Settings", path: "/recovery/settings" }
    ];
  }

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
                } else if (item.id === "utilities") {
                  onOpenUtilities?.();
                } else {
                  onSectionChange(item.id);
                }
              }}
            >
              <i className={`fas ${item.icon} me-2`} />
              <span>{item.label}</span>
              {item.id === "inbox" && unreadCount > 0 && (
                <span className="badge bg-danger rounded-pill ms-auto">{unreadCount}</span>
              )}
              {item.badge > 0 && (
                <span className="badge bg-danger ms-2">{item.badge}</span>
              )}
            </a>
          </li>
        ))}

        {/* For other roles that are not director/secretary/client_relations_officer, add Utilities if needed */}
        {!['director', 'secretary', 'client_relations_officer'].includes(userRole) && 
         ['head_of_it', 'valuer', 'accountant'].includes(userRole) && (
          <li className="nav-item">
            <a href="#" className="nav-link d-flex align-items-center" onClick={(e) => { e.preventDefault(); onOpenUtilities?.(); }}>
              <i className="fas fa-tools me-2" /><span>Utilities</span>
            </a>
          </li>
        )}

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