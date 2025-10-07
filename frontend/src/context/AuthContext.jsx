"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { authAPI } from "../services/api"

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    const savedUser = localStorage.getItem("user")

    if (token && savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const login = async (credentials) => {
    try {
      console.log("Attempting login with:", credentials)
      const response = await authAPI.login(credentials)
      const { access_token, user } = response.data

      console.log("Login successful, user:", user)
      
      localStorage.setItem("token", access_token)
      localStorage.setItem("user", JSON.stringify(user))
      setUser(user)

      return { success: true }
    } catch (error) {
      console.error("Login error:", error)
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          "Login failed"
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  const logout = async () => {
    try {
      // Clear frontend storage
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      
      // Update context state
      setUser(null)
      
      return { success: true }
    } catch (error) {
      console.error("Logout error:", error)
      return { success: false, error: "Logout failed" }
    }
  }
  
  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}