"use client";

function RecoverySidebar({
  activeSection,
  onSectionChange,
  onToggleInbox,
  onLogout,
  isMobile,
  unreadCount = 0,
}) {
  const menuItems = [
    { id: "recovery", icon: "fa-chart-line", label: "Recovery Module", path: "/recovery" },
    { id: "inbox", icon: "fa-envelope", label: "Inbox", path: "/recovery/inbox" }
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