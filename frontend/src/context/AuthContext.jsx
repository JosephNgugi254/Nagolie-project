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
  const [user, setUser] = useState(null) // Single user state
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null) // Track role separately

  useEffect(() => {
    console.log("AuthProvider: Loading user data from localStorage...")
    
    // Try to load user from localStorage
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    const savedRole = localStorage.getItem("user_role");
    
    console.log("Token exists:", !!token);
    console.log("User exists:", !!savedUser);
    console.log("Role exists:", !!savedRole);
    
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        const role = savedRole || parsedUser.role || 'admin';
        
        console.log("Setting user:", parsedUser);
        console.log("Role:", role);
        
        setUser(parsedUser);
        setUserRole(role);
      } catch (error) {
        console.error("Error parsing user:", error);
        clearLocalStorage();
      }
    }
    
    setLoading(false);
    console.log("AuthProvider: Loading complete")
  }, [])

  const clearLocalStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("user_role");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    localStorage.removeItem("investor_token");
    localStorage.removeItem("investor_user");
  }

  const login = async (credentials) => {
    try {
      console.log("Attempting login with:", credentials);
      const response = await authAPI.login(credentials);
      const { access_token, user: userData, redirect_to } = response.data;

      console.log("Login successful, user:", userData);
      console.log("User role:", userData.role);
      
      // Store user data with unified storage
      localStorage.setItem("token", access_token);
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("user_role", userData.role);
      
      // Also store in role-specific storage for backward compatibility
      if (userData.role === 'admin') {
        localStorage.setItem("admin_token", access_token);
        localStorage.setItem("admin_user", JSON.stringify(userData));
      } else if (userData.role === 'investor') {
        localStorage.setItem("investor_token", access_token);
        localStorage.setItem("investor_user", JSON.stringify(userData));
      }
      
      setUser(userData);
      setUserRole(userData.role);
      
      // Return user data for role-based redirection
      return { 
        success: true, 
        user: userData,
        redirect_to: redirect_to || (userData.role === 'investor' ? '/investor' : '/admin')
      };
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          "Login failed";
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ADD THIS FUNCTION: setInvestorSession for investor registration
  const setInvestorSession = (investorData) => {
    try {
      console.log("Setting investor session:", investorData);
      
      // Store in unified storage
      localStorage.setItem("token", investorData.token || investorData.access_token);
      localStorage.setItem("user", JSON.stringify(investorData));
      localStorage.setItem("user_role", "investor");
      
      // Also store in investor-specific storage
      localStorage.setItem("investor_token", investorData.token || investorData.access_token);
      localStorage.setItem("investor_user", JSON.stringify(investorData));
      
      setUser(investorData);
      setUserRole("investor");
      
      console.log("Investor session set successfully");
      return { success: true };
    } catch (error) {
      console.error("Error setting investor session:", error);
      return { success: false, error: "Failed to set investor session" };
    }
  }

  const logout = async () => {
    try {
      console.log("Logging out...");
      
      // Clear all localStorage
      clearLocalStorage();
      
      setUser(null);
      setUserRole(null);
      
      console.log("Logout successful");
      return { success: true };
    } catch (error) {
      console.error("Logout error:", error);
      return { success: false, error: "Logout failed" };
    }
  }
  
  // Check if user is authenticated
  const isAuthenticated = () => {
    const hasUser = !!user;
    const hasToken = !!localStorage.getItem("token");
    console.log("isAuthenticated:", hasUser, "token:", hasToken);
    return hasUser || hasToken;
  }
  
  // Check if user has specific role
  const hasRole = (role) => {
    return userRole === role;
  };

  const updateUserData = (newUserData) => {
    try {
      console.log("Updating user data:", newUserData);
      
      // Update local state
      setUser(newUserData);
      
      // Update localStorage
      localStorage.setItem("user", JSON.stringify(newUserData));
      
      // Also update role-specific storage if needed
      if (newUserData.role === 'admin') {
        localStorage.setItem("admin_user", JSON.stringify(newUserData));
      } else if (newUserData.role === 'investor') {
        localStorage.setItem("investor_user", JSON.stringify(newUserData));
      }
      
      return { success: true };
    } catch (error) {
      console.error("Error updating user data:", error);
      return { success: false, error: "Failed to update user data" };
    }
  };

  const value = {
    user,
    userRole,
    login,
    logout,
    isAuthenticated,
    hasRole,
    loading,
    setInvestorSession, 
    updateUserData,// Now this function is defined
  }

  console.log("AuthContext value:", { 
    user: !!user, 
    userRole,
    loading 
  })

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}