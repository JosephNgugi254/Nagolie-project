
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";

import { authAPI, userAPI } from "../services/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  // Clear all authentication-related local storage
  const clearLocalStorage = useCallback(() => {
    const keys = [
      "token",
      "user",
      "user_role",
      "admin_token",
      "admin_user",
      "investor_token",
      "investor_user",
    ];

    keys.forEach((key) => localStorage.removeItem(key));
  }, []);

  // Store an authenticated session
  const storeSession = useCallback((token, userData, role) => {
    if (!token || !userData || !role) {
      throw new Error("Invalid authentication session");
    }

    // Remove previous role-specific sessions
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    localStorage.removeItem("investor_token");
    localStorage.removeItem("investor_user");

    // Store unified session
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("user_role", role);

    // Maintain backward compatibility
    if (role === "admin") {
      localStorage.setItem("admin_token", token);
      localStorage.setItem("admin_user", JSON.stringify(userData));
    } else if (role === "investor") {
      localStorage.setItem("investor_token", token);
      localStorage.setItem("investor_user", JSON.stringify(userData));
    }

    setUser(userData);
    setUserRole(role);
  }, []);

  // Load saved session when application starts
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");
      const savedRole = localStorage.getItem("user_role");

      if (!token || !savedUser) {
        clearLocalStorage();
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const role = savedRole || parsedUser?.role;

      if (
        !parsedUser ||
        typeof parsedUser !== "object" ||
        !role
      ) {
        clearLocalStorage();
        return;
      }

      setUser(parsedUser);
      setUserRole(role);

    } catch {
      clearLocalStorage();
      setUser(null);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  }, [clearLocalStorage]);

  // Login
  const login = async (credentials) => {
    try {
      if (!credentials?.username || !credentials?.password) {
        return {
          success: false,
          error: "Username and password are required",
        };
      }

      // Never log passwords or complete credentials
      console.log("Login attempt initiated");

      const response = await authAPI.login(credentials);

      const {
        access_token,
        user: userData,
        redirect_to,
      } = response.data || {};

      if (!access_token || !userData || !userData.role) {
        return {
          success: false,
          error: "Invalid login response. Please try again.",
        };
      }

      storeSession(access_token, userData, userData.role);

      console.log("Login successful");
      console.log("Authenticated role:", userData.role);

      return {
        success: true,
        user: userData,
        redirect_to:
          redirect_to ||
          (userData.role === "investor" ? "/investor" : "/admin"),
      };

    } catch (error) {
      // Avoid logging the complete Axios error or request configuration
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Login failed";

      console.error("Authentication failed:", errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  // Update profile picture
  const updateProfilePicture = async (imageData) => {
    try {
      if (!user) {
        return false;
      }

      const response = await userAPI.updateProfilePicture(imageData);

      if (response.data?.success) {
        const updatedUser = {
          ...user,
          profile_picture: response.data.profile_picture,
        };

        localStorage.setItem("user", JSON.stringify(updatedUser));

        if (userRole === "admin") {
          localStorage.setItem("admin_user", JSON.stringify(updatedUser));
        } else if (userRole === "investor") {
          localStorage.setItem("investor_user", JSON.stringify(updatedUser));
        }

        setUser(updatedUser);

        return true;
      }

      return false;

    } catch (error) {
      console.error(
        "Profile picture update failed:",
        error.response?.data?.error || "Unable to update profile picture"
      );

      return false;
    }
  };

  // Set investor session after registration
  const setInvestorSession = (investorData) => {
    try {
      const token =
        investorData?.access_token ||
        investorData?.token;

      const investorUser =
        investorData?.user || investorData;

      if (!token || !investorUser) {
        return {
          success: false,
          error: "Invalid investor session data",
        };
      }

      const userData = {
        ...investorUser,
        role: "investor",
      };

      storeSession(token, userData, "investor");

      console.log("Investor session established");

      return { success: true };

    } catch {
      console.error("Unable to establish investor session");

      return {
        success: false,
        error: "Failed to set investor session",
      };
    }
  };

  // Logout
  const logout = async () => {
    try {
      clearLocalStorage();

      setUser(null);
      setUserRole(null);

      console.log("Logout successful");

      return { success: true };

    } catch {
      console.error("Logout failed");

      return {
        success: false,
        error: "Logout failed",
      };
    }
  };

  // Check authentication status
  const isAuthenticated = () => {
    const token = localStorage.getItem("token");
    const userObj = localStorage.getItem("user");

    return !!(token && userObj);
  };

  // Check user role
  const hasRole = (role) => {
    return userRole === role;
  };

  // Update user data
  const updateUserData = (newUserData) => {
    try {
      if (!newUserData || typeof newUserData !== "object") {
        return {
          success: false,
          error: "Invalid user data",
        };
      }

      const updatedUser = {
        ...user,
        ...newUserData,
      };

      const updatedRole = updatedUser.role || userRole;

      if (!updatedRole) {
        return {
          success: false,
          error: "User role is missing",
        };
      }

      localStorage.setItem("user", JSON.stringify(updatedUser));
      localStorage.setItem("user_role", updatedRole);

      if (updatedRole === "admin") {
        localStorage.setItem("admin_user", JSON.stringify(updatedUser));
      } else if (updatedRole === "investor") {
        localStorage.setItem("investor_user", JSON.stringify(updatedUser));
      }

      setUser(updatedUser);
      setUserRole(updatedRole);

      return { success: true };

    } catch {
      console.error("Unable to update user data");

      return {
        success: false,
        error: "Failed to update user data",
      };
    }
  };

  const value = useMemo(
    () => ({
      user,
      userRole,
      login,
      logout,
      isAuthenticated,
      hasRole,
      loading,
      setInvestorSession,
      updateUserData,
      updateProfilePicture,
    }),
    [user, userRole, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
