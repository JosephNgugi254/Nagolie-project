"use client"

function AdminSidebar({ activeSection, onSectionChange, pendingApplications = 0, pendingInvestorsCount = 0, onLogout, isMobile }) {
  const menuItems = [
    { id: "overview", icon: "fa-tachometer-alt", label: "Overview", path: "/admin" },
    { id: "clients", icon: "fa-users", label: "Clients", path: "/admin/clients" },
    { id: "transactions", icon: "fa-exchange-alt", label: "Transactions", path: "/admin/transactions" },
    { id: "payment-stats", icon: "fa-chart-bar", label: "Payment Stats", path: "/admin/payment-stats" },
    { id: "gallery", icon: "fa-images", label: "Livestock Gallery", path: "/admin/gallery" },
    { id: "applications", icon: "fa-file-alt", label: "Applications", path: "/admin/applications", badge: pendingApplications },
    { id: "investors", icon: "fa-users", label: "Investors", path: "/admin/investors", badge: pendingInvestorsCount }

  ]

  return (
    <div className="sidebar-sticky">
      <ul className="nav flex-column">
        {menuItems.map((item) => (
          <li className="nav-item" key={item.id}>
            <a
              className={`nav-link ${activeSection === item.id ? "active" : ""}`}
              href={item.path}
              onClick={(e) => {
                e.preventDefault()
                onSectionChange(item.id)
              }}
            >
              <i className={`fas ${item.icon} me-2`}></i>
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="badge bg-danger ms-2" style={{ 
                  display: item.badge > 0 ? 'inline-block' : 'none' 
                }}>
                  {item.badge}
                </span>
              )}
            </a>
          </li>
        ))}
        
        {/* Mobile Logout Button */}
        {isMobile && (
          <li className="nav-item mt-auto">
            <a
              className="nav-link"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                onLogout?.()
              }}
            >
              <i className="fas fa-sign-out-alt me-2"></i>
              <span>Logout</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  )
}

export default AdminSidebar