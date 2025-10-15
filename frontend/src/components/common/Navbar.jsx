"use client"

import { Link, useLocation } from "react-router-dom"

function Navbar() {
  const location = useLocation()

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

  const handleNavClick = (sectionId, e) => {
    e.preventDefault()
    scrollToSection(sectionId)
  }

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white fixed-top shadow-sm">
      <div className="container">
        <Link className="navbar-brand d-flex align-items-center" to="/">
          <img src="/logo.png" alt="Nagolie Enterprises" height="40" className="me-2" />
          <span className="brand-text">Nagolie Enterprises</span>
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto align-items-center">
            <li className="nav-item">
              <Link 
                className="nav-link" 
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    e.preventDefault()
                    scrollToSection("home")
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
                    e.preventDefault()
                    scrollToSection("about")
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
                    e.preventDefault()
                    scrollToSection("services")
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
                    e.preventDefault()
                    scrollToSection("gallery")
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
                    e.preventDefault()
                    scrollToSection("contact")
                  }
                }}
              >
                Contact
              </Link>
            </li>
            <li className="nav-item ms-2">
              <Link
                className="btn btn-primary btn-sm"
                to="/"
                onClick={(e) => {
                  if (location.pathname === "/") {
                    e.preventDefault()
                    scrollToSection("loan-application")
                  }
                }}
              >
                Submit Livestock Offer
              </Link>
            </li>
            <li className="nav-item ms-2">
              <Link
                className="nav-link btn btn-outline-primary d-flex align-items-center"
                to="/admin/login"
                title="Admin Login"
              >
                <i className="fas fa-user"></i>
                <span className="visually-hidden">Admin Login</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar