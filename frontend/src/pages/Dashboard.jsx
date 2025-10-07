"use client"

import { Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

function Dashboard() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="text-center py-5">Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <div className="container py-5">
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard!</p>
    </div>
  )
}

export default Dashboard