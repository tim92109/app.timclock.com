import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, tokenManager } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Check if user is authenticated on app load
  useEffect(() => {
    // With HttpOnly cookies, we can't check token presence client-side
    // Instead, verify token via API which will send cookies automatically
    authAPI.verifyToken()
      .then(() => {
        return authAPI.getProfile();
      })
      .then((response) => {
        setUser(response.data.user);
        setIsAuthenticated(true);
      })
      .catch(() => {
        // Token is invalid, clear it
        tokenManager.removeToken();
        tokenManager.removeRefreshToken();
        setUser(null);
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: authAPI.login,
    onSuccess: (response) => {
      const { user, tokens } = response.data;
      tokenManager.setToken(tokens.accessToken);
      tokenManager.setRefreshToken(tokens.refreshToken);
      setUser(user);
      setIsAuthenticated(true);
      toast.success('Login successful!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Login failed');
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: authAPI.register,
    onSuccess: (response) => {
      const { user, tokens } = response.data;
      tokenManager.setToken(tokens.accessToken);
      tokenManager.setRefreshToken(tokens.refreshToken);
      setUser(user);
      setIsAuthenticated(true);
      toast.success('Registration successful!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Registration failed');
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authAPI.logout,
    onSuccess: () => {
      tokenManager.removeToken();
      tokenManager.removeRefreshToken();
      setUser(null);
      setIsAuthenticated(false);
      queryClient.clear();
      toast.success('Logged out successfully');
    },
    onError: () => {
      // Even if logout fails on server, clear local data
      tokenManager.removeToken();
      tokenManager.removeRefreshToken();
      setUser(null);
      setIsAuthenticated(false);
      queryClient.clear();
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: authAPI.updateProfile,
    onSuccess: (response) => {
      setUser(response.data.user);
      toast.success('Profile updated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: authAPI.changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to change password');
    },
  });

  const login = (credentials) => {
    return loginMutation.mutateAsync(credentials)
      .then(() => {
        // After successful login, refetch user profile
        return authAPI.getProfile();
      })
      .then((profileResponse) => {
        setUser(profileResponse.data.user);
      });
  };

  const register = (userData) => {
    return registerMutation.mutateAsync(userData);
  };

  const logout = () => {
    logoutMutation.mutate();
  };

  const updateProfile = (data) => {
    return updateProfileMutation.mutateAsync(data);
  };

  const changePassword = (data) => {
    return changePasswordMutation.mutateAsync(data);
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    isLoginLoading: loginMutation.isPending,
    isRegisterLoading: registerMutation.isPending,
    isLogoutLoading: logoutMutation.isPending,
    isUpdateProfileLoading: updateProfileMutation.isPending,
    isChangePasswordLoading: changePasswordMutation.isPending,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};