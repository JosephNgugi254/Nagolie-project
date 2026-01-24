"use client"

function InvestorSidebar({ activeSection, onSectionChange, onLogout, isMobile }) {
  const menuItems = [
    { id: "overview", icon: "fa-tachometer-alt", label: "Overview", path: "/investor" },
    { id: "gallery", icon: "fa-images", label: "Livestock Collateral", path: "/investor/gallery" },
    { id: "returns", icon: "fa-history", label: "Returns History", path: "/investor/returns" },
    { id: "account", icon: "fa-user", label: "My Account", path: "/investor/account" },
    { id: 'settings', label: 'Account Settings', icon: 'fa-cog' },
  ]

  return (
    <div className="sidebar-sticky">
      <ul className="nav flex-column">
        {menuItems.map((item) => (
          <li className="nav-item" key={item.id}>
            <a
              className={`nav-link ${activeSection === item.id ? "active" : ""}`}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                onSectionChange(item.id)
              }}
            >
              <i className={`fas ${item.icon} me-2`}></i>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
        
        {/* Logout Button */}
        <li className="nav-item mt-auto">
          <a
            className="nav-link text-danger"
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
      </ul>
    </div>
  )
}

export default InvestorSidebar