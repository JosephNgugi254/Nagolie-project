"use client"

import { Link, useLocation } from "react-router-dom"
import { useRef } from "react" // Add this import

function Navbar() {
  const location = useLocation()
  const navbarCollapseRef = useRef(null) // Add this ref

  const scrollToSection = (sectionId) => {
    // If we're not on the home page, navigate to home first
    if (location.pathname !== "/") {
      // Navigate to home with hash, which will trigger scroll
      window.location.href = `/#${sectionId}`
      return
    }

    // If we're already on home page, just scroll
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  // Add this function to handle nav link clicks
  const handleNavLinkClick = (sectionId, e) => {
    e.preventDefault()
    
    // Close the navbar collapse on mobile
    if (navbarCollapseRef.current) {
      const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapseRef.current)
      if (bsCollapse) {
        bsCollapse.hide()
      }
    }
    
    scrollToSection(sectionId)
  }

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white fixed-top shadow-sm">
      <div className="container">
        <Link className="navbar-brand d-flex align-items-center" to="/">
          <img src="/logo.png" alt="Nagolie Enterprises" height="40" style={{borderRadius:5}} className="me-2" />
          <span className="brand-text">Nagolie Enterprises</span>
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        {/* Add ref to the collapse element */}
        <div className="collapse navbar-collapse" id="navbarNav" ref={navbarCollapseRef}>
          <ul className="navbar-nav ms-auto align-items-center">
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("home", e) // Updated to use new function
                  }
                }}
              >
                Home
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("about", e) // Updated to use new function
                  }
                }}
              >
                About
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("services", e) // Updated to use new function
                  }
                }}
              >
                Services
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("gallery", e) // Updated to use new function
                  }
                }}
              >
                Livestock Gallery
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("contact", e) // Updated to use new function
                  }
                }}
              >
                Contacts
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" to="/company-gallery">
                Company Gallery
              </Link>
            </li>
            <li className="nav-item ms-2">
              <Link
                className="btn btn-primary btn-sm"
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    handleNavLinkClick("loan-application", e) // Updated to use new function
                  }
                }}
              >
                Submit Livestock Offer
              </Link>
            </li>
            <li className="nav-item ms-2">
              <Link
                className="nav-link btn btn-outline-primary d-flex align-items-center"
                to="/login"
                title="Login"
                onClick={() => {
                  // Also close navbar when login is clicked
                  if (navbarCollapseRef.current) {
                    const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapseRef.current)
                    if (bsCollapse) {
                      bsCollapse.hide()
                    }
                  }
                }}
              >
                <i className="fas fa-user me-1"></i>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar