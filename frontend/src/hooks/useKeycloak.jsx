import i18n from '@/i18n';
import Keycloak from 'keycloak-js';
import ENV from '@/config/env.config';
import { debugLog } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';

// Global state management
let keycloakSingleton = null;
let keycloakInitPromise = null;
let initializationState = 'idle'; // 'idle', 'initializing', 'initialized', 'failed'
let globalError = null;

// State synchronization for all hook instances
const stateSubscribers = new Set();

const KEYCLOAK_CONFIG = {
  url: ENV.KEYCLOAK.SERVER_URL,
  realm: ENV.KEYCLOAK.REALM,
  clientId: ENV.KEYCLOAK.CLIENT,
};

const KEYCLOAK_INIT_OPTIONS = {
  onLoad: 'login-required',
  checkLoginIframe: false,
  locale: i18n.language,
  silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html'
};

// Helper function to notify all subscribers of state changes
const notifyStateChange = (newState) => {
  stateSubscribers.forEach(subscriber => {
    try {
      subscriber(newState);
    } catch (error) {
      console.error('Error notifying state subscriber:', error);
    }
  });
};

// Reset global state (used during logout)
const resetGlobalState = () => {
  keycloakSingleton = null;
  keycloakInitPromise = null;
  initializationState = 'idle';
  globalError = null;
  
  // Notify all subscribers of reset
  notifyStateChange({
    type: 'RESET',
    authenticated: false,
    loading: false,
    error: null
  });
};

/**
 * Keycloak Hook - Manage Keycloak authentication state and actions
 */
export const useKeycloak = () => {
  const [keycloak, setKeycloak] = useState(keycloakSingleton);
  const [authenticated, setAuthenticated] = useState(keycloakSingleton?.authenticated || false);
  const [loading, setLoading] = useState(initializationState === 'initializing');
  const [error, setError] = useState(globalError);
  const [userInfo, setUserInfo] = useState(null);
  const [token, setToken] = useState(keycloakSingleton?.token || null);
  const [refreshToken, setRefreshToken] = useState(keycloakSingleton?.refreshToken || null);
  
  const updateTokenTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  
  // Subscribe to global state changes
  useEffect(() => {
    const handleStateChange = (newState) => {
      if (!isMountedRef.current) return;
      
      switch (newState.type) {
        case 'RESET':
          setKeycloak(null);
          setAuthenticated(false);
          setLoading(false);
          setError(null);
          setUserInfo(null);
          setToken(null);
          setRefreshToken(null);
          break;
        case 'INITIALIZED':
          setKeycloak(newState.keycloak);
          setAuthenticated(newState.authenticated);
          setLoading(false);
          setError(null);
          break;
        case 'ERROR':
          setError(newState.error);
          setLoading(false);
          break;
        case 'TOKEN_UPDATED':
          setToken(newState.token);
          setRefreshToken(newState.refreshToken);
          break;
      }
    };

    stateSubscribers.add(handleStateChange);
    
    return () => {
      stateSubscribers.delete(handleStateChange);
      isMountedRef.current = false;
    };
  }, []);

  // Get client roles
  const getClientRoles = useCallback((keycloakInstance = keycloak) => {
    if (!keycloakInstance?.authenticated) return [];
    
    const clientAccess = keycloakInstance.resourceAccess?.[KEYCLOAK_CONFIG.clientId];
    return clientAccess?.roles || [];
  }, [keycloak]);

  // Get user roles
  const getUserRoles = useCallback((keycloakInstance = keycloak) => {
    if (!keycloakInstance?.authenticated) return [];
    
    const realmRoles = keycloakInstance.realmAccess?.roles || [];
    const clientRoles = getClientRoles(keycloakInstance);
    
    return [...realmRoles, ...clientRoles];
  }, [keycloak, getClientRoles]);

  // Check if user has super role
  const hasSuperRole = useCallback((keycloakInstance = keycloak) => {
    if (!keycloakInstance?.authenticated) return false;
    
    const userRoles = getUserRoles(keycloakInstance);
    return userRoles.includes(ENV.KEYCLOAK.SUPER_ROLE);
  }, [keycloak, getUserRoles]);

  // New: Determine custom role
  const isCustomRole = (roleName) => {
    const defaultRoles = [
      "two-shoulder", "offline_access", "uma_authorization"
    ];
    if (roleName.startsWith("default-roles-")) return false;
    if (defaultRoles.includes(roleName)) return false;
    return true;
  };

  // Load user info
  const loadUserInfo = useCallback(async (keycloakInstance = keycloak) => {
    if (!keycloakInstance?.authenticated || !isMountedRef.current) return null;

    try {
      const profile = await keycloakInstance.loadUserProfile();
      
      // Get user locale from token or profile attributes
      const userLocale = keycloakInstance.tokenParsed?.locale || 
                        profile.attributes?.locale?.[0] || 
                        profile.locale;
      
      // Update i18n language if locale exists and user hasn't manually set it
      const savedLanguage = localStorage.getItem('app-language');
      const supportedLanguages = ['en', 'zh-TW'];
      
      if (userLocale && supportedLanguages.includes(userLocale)) {
        if (!savedLanguage || savedLanguage !== userLocale) {
          if (i18n.language !== userLocale) {
            i18n.changeLanguage(userLocale);
            localStorage.setItem('app-language', userLocale);
          }
        }
      }
      
      const userInfo = {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        name: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
        locale: userLocale,
        roles: getUserRoles(keycloakInstance),
        realmRoles: keycloakInstance.realmAccess?.roles || [],
        clientRoles: getClientRoles(keycloakInstance),
        hasSuperRole: hasSuperRole(keycloakInstance),
      };
      
      if (isMountedRef.current) {
        setUserInfo(userInfo);
      }
      
      return userInfo;
    } catch (err) {
      console.error('Failed to load user info:', err);
      const errorMessage = `Failed to load user info: ${err?.message || err}`;
      
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      
      return null;
    }
  }, [keycloak, getUserRoles, getClientRoles, hasSuperRole]);

  // Setup token auto-refresh
  const setupTokenRefresh = useCallback((keycloakInstance = keycloak) => {
    if (!keycloakInstance || !isMountedRef.current) return;

    if (updateTokenTimeoutRef.current) {
      clearTimeout(updateTokenTimeoutRef.current);
      updateTokenTimeoutRef.current = null;
    }

    const updateToken = async () => {
      if (!isMountedRef.current || !keycloakInstance) return;

      try {
        const refreshed = await keycloakInstance.updateToken(30);
        
        if (refreshed && isMountedRef.current) {
          debugLog('Token updated');
          
          const newToken = keycloakInstance.token;
          const newRefreshToken = keycloakInstance.refreshToken;
          
          setToken(newToken);
          setRefreshToken(newRefreshToken);

          // Notify all subscribers
          notifyStateChange({
            type: 'TOKEN_UPDATED',
            token: newToken,
            refreshToken: newRefreshToken
          });

          // Print token
          debugLog('Updated token:', newToken);

          // Token updated successfully
        }

        if (isMountedRef.current) {
          updateTokenTimeoutRef.current = setTimeout(updateToken, 5 * 60 * 1000);
        }
        
      } catch (err) {
        console.error('Token update failed:', err);
        
        if (isMountedRef.current) {
          // Token refresh failed, likely need to re-login
          console.error('Re-login required');
          setError('Authentication session expired. Please login again.');
        }
      }
    };

    updateToken();
  }, [keycloak]);

  // Initialize Keycloak
  const initKeycloak = useCallback(async () => {
    // If already initializing or initialized, return existing instance
    if (initializationState === 'initializing') {
      return keycloakInitPromise;
    }
    
    if (initializationState === 'initialized' && keycloakSingleton) {
      return keycloakSingleton;
    }

    // If failed before, reset and try again
    if (initializationState === 'failed') {
      resetGlobalState();
    }

    initializationState = 'initializing';
    globalError = null;
    
    // Notify all subscribers
    notifyStateChange({
      type: 'LOADING',
      loading: true,
      error: null
    });

    if (!keycloakInitPromise) {
      keycloakInitPromise = (async () => {
        try {
          debugLog('Initializing Keycloak...', KEYCLOAK_CONFIG);
          
          const keycloakInstance = new Keycloak(KEYCLOAK_CONFIG);
          
          // Add event listeners for better state management
          keycloakInstance.onTokenExpired = () => {
            debugLog('Token expired, refreshing...');
            keycloakInstance.updateToken(30).catch(() => {
              console.error('Token refresh failed');
            });
          };

          keycloakInstance.onAuthRefreshSuccess = () => {
            debugLog('Token refresh success');
          };

          keycloakInstance.onAuthRefreshError = () => {
            console.error('Token refresh error');
          };

          keycloakInstance.onAuthLogout = () => {
            debugLog('User logged out');
            resetGlobalState();
          };

          const authenticated = await keycloakInstance.init(KEYCLOAK_INIT_OPTIONS);
          
          keycloakSingleton = keycloakInstance;
          initializationState = 'initialized';
          
          // Notify all subscribers
          notifyStateChange({
            type: 'INITIALIZED',
            keycloak: keycloakInstance,
            authenticated
          });          
          debugLog('Keycloak initialized', keycloakInstance);
          
          return { keycloakInstance, authenticated };
          
        } catch (error) {
          console.error('Keycloak initialization failed:', error);
          initializationState = 'failed';
          globalError = error;
          
          // Notify all subscribers
          notifyStateChange({
            type: 'ERROR',
            error: error.message || 'Keycloak initialization failed'
          });
          
          throw error;
        }
      })();
    }

    const { keycloakInstance, authenticated } = await keycloakInitPromise;

    if (isMountedRef.current) {
      setKeycloak(keycloakInstance);      
      setAuthenticated(authenticated);

      if (authenticated) {
        setToken(keycloakInstance.token);
        setRefreshToken(keycloakInstance.refreshToken);
        
        // Check and update language from token if user hasn't manually set it
        const userLocale = keycloakInstance.tokenParsed?.locale;
        const savedLanguage = localStorage.getItem('app-language');
        const supportedLanguages = ['en', 'zh-TW'];
        
        if (userLocale && supportedLanguages.includes(userLocale)) {
          if (!savedLanguage || savedLanguage !== userLocale) {
            if (i18n.language !== userLocale) {
              i18n.changeLanguage(userLocale);
              localStorage.setItem('app-language', userLocale);
            }
          }
        }
        
        // Load user data
        await loadUserInfo(keycloakInstance);
        
        setupTokenRefresh(keycloakInstance);
        debugLog('Keycloak token:', { token: keycloakInstance.token });
      }
      
      setLoading(false);
    }
    
    return keycloakInstance;
  }, [loadUserInfo, setupTokenRefresh]);

  const hasRole = useCallback((requiredRole) => {
    if (!authenticated || !requiredRole) {
      return false;
    }

    // Check if user has super role first - super role has all permissions
    if (hasSuperRole()) {
      return true;
    }

    // Check if user has the required role
    const userRoles = getUserRoles();
    return userRoles.includes(requiredRole);
  }, [authenticated, getUserRoles, hasSuperRole]);

  // Logout - Enhanced with complete cleanup
  const logout = useCallback(async (options = {}) => {
    if (!keycloak) return;

    try {
      debugLog('Starting logout process...');
      
      // Clear token refresh timeout
      if (updateTokenTimeoutRef.current) {
        clearTimeout(updateTokenTimeoutRef.current);
        updateTokenTimeoutRef.current = null;
      }

      // Clear local state first
      if (isMountedRef.current) {
        setAuthenticated(false);
        setUserInfo(null);
        setToken(null);
        setRefreshToken(null);
        setLoading(true);
      }

      // Clear global state
      resetGlobalState();

      // Perform Keycloak logout
      await keycloak.logout({
        redirectUri: window.location.origin,
        ...options
      });

    } catch (err) {
      console.error('Logout failed:', err);
      const errorMessage = `Logout failed: ${err.message}`;
      
      if (isMountedRef.current) {
        setError(errorMessage);
        setLoading(false);
      }
      
      // Even if logout fails, reset local state
      resetGlobalState();
    }
  }, [keycloak]);

  // Update profile
  const updateProfile = useCallback(async () => {
    if (!keycloak?.authenticated) {
      throw new Error('User not authenticated');
    }

    try {
      if (isMountedRef.current) {
        setLoading(true);
      }
      
      await keycloak.accountManagement();
      
      if (isMountedRef.current) {
        setLoading(false);
      }
    } catch (err) {
      console.error('Update profile failed:', err);
      const errorMessage = `Update profile failed: ${err.message}`;
      
      if (isMountedRef.current) {
        setError(errorMessage);
        setLoading(false);
      }
      
      throw err;
    }
  }, [keycloak]);

  // Manually update token
  const updateToken = useCallback(async (minValidity = 30) => {
    if (!keycloak) {
      throw new Error('Keycloak not initialized');
    }

    try {
      const refreshed = await keycloak.updateToken(minValidity);
      
      if (refreshed && isMountedRef.current) {
        const newToken = keycloak.token;
        const newRefreshToken = keycloak.refreshToken;
        
        setToken(newToken);
        setRefreshToken(newRefreshToken);
        
        // Notify all subscribers
        notifyStateChange({
          type: 'TOKEN_UPDATED',
          token: newToken,
          refreshToken: newRefreshToken
        });
        
        debugLog('Token manually updated');
        debugLog('Token after manual update:', newToken);

        // Token updated successfully
      }
      
      return refreshed;
    } catch (err) {
      console.error('Manual token update failed:', err);
      throw err;
    }
  }, [keycloak]);

  // Get current token
  const getToken = useCallback(() => {
    return keycloak?.token || null;
  }, [keycloak]);

  // Check if token is expired
  const isTokenExpired = useCallback((minValidity = 0) => {
    if (!keycloak) return true;
    return keycloak.isTokenExpired(minValidity);
  }, [keycloak]);

  // Initialize on component mount - improved logic
  useEffect(() => {
    isMountedRef.current = true;
    
    // Only initialize if not already initialized or initializing
    if (initializationState === 'idle' || initializationState === 'failed') {
      initKeycloak().catch(err => {
        console.error('useKeycloak initialization failed:', err);
      });
    } else if (initializationState === 'initialized' && keycloakSingleton) {
      // Sync with existing singleton
      setKeycloak(keycloakSingleton);
      setAuthenticated(keycloakSingleton.authenticated || false);
      setToken(keycloakSingleton.token || null);
      setRefreshToken(keycloakSingleton.refreshToken || null);
      setLoading(false);
    }
    
    return () => {
      isMountedRef.current = false;
      
      if (updateTokenTimeoutRef.current) {
        clearTimeout(updateTokenTimeoutRef.current);
        updateTokenTimeoutRef.current = null;
      }
    };
  }, [initKeycloak]);

  // Return hook state and methods
  return {
    // State
    keycloak,
    authenticated,
    loading,
    error,
    userInfo,
    token,
    refreshToken,

    // Methods
    logout,
    updateProfile,
    updateToken,
    loadUserInfo,

    // Token related
    getToken,
    isTokenExpired,

    // Permission related
    hasRole,
    getUserRoles,
    hasSuperRole,

    // Initialization
    initKeycloak,
    
    // Additional state info
    isInitialized: initializationState === 'initialized',
    isInitializing: initializationState === 'initializing',
    initializationFailed: initializationState === 'failed'
  };
};

export default useKeycloak;