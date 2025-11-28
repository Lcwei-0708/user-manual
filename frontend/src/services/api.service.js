import axios from 'axios';
import { ENV } from '@/config/env.config';
import { handleApiError, setErrorHandler } from './error.service';
import { toast } from 'sonner';

const apiClient = axios.create({
  baseURL: ENV.API.BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let getTokenFunction = null;
let logoutFunction = null;
let updateTokenFunction = null;
let isRefreshingToken = false;

export const setTokenGetter = (getToken, logout, updateToken = null) => {
  getTokenFunction = getToken;
  logoutFunction = logout;
  updateTokenFunction = updateToken;
};

export { setErrorHandler };

apiClient.interceptors.request.use(
  async (config) => {
    if (config.noToken) {
      delete config.headers.Authorization;
      return config;
    }

    if (config.headers && config.headers.Authorization) {
      return config;
    }

    if (!getTokenFunction) {
      return config;
    }

    try {
      const latestToken = getTokenFunction();
      
      if (latestToken) {
        config.headers.Authorization = `Bearer ${latestToken}`;
      } else {
        delete config.headers.Authorization;
      }
    } catch (error) {
      delete config.headers.Authorization;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config;
    const showSuccessToast = config?.showSuccessToast;
    const messageMap = config?.messageMap;
    const successMessage = config?.successMessage || (messageMap && messageMap.success);
    
    if (successMessage && showSuccessToast === true) {
      toast.success(successMessage);
    }
    
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest?.noToken && !isRefreshingToken) {
      const errorMessage = error.response?.data?.message || '';
      const isPasswordError = errorMessage.includes('Current password is incorrect') || 
                             errorMessage.includes('password is incorrect') ||
                             errorMessage.toLowerCase().includes('incorrect password');
      
      if (isPasswordError) {
        error.customStatus = 'incorrect';
      } else {
        // Token expired: try to refresh
        if (!originalRequest._retry && updateTokenFunction) {
          originalRequest._retry = true;
          isRefreshingToken = true;
          
          try {
            const refreshed = await updateTokenFunction(30);
            
            if (refreshed) {
              const newToken = getTokenFunction();
              if (newToken) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                const result = await apiClient(originalRequest);
                isRefreshingToken = false;
                return result;
              }
            }
            
            // If token refresh failed, logout
            if (logoutFunction) {
              logoutFunction();
              originalRequest.showErrorToast = false;
            }
          } catch (tokenError) {
            // Token refresh failed, logout
            if (logoutFunction) {
              logoutFunction();
              originalRequest.showErrorToast = false;
            }
          } finally {
            isRefreshingToken = false;
          }
        } else if (logoutFunction) {
          // No retry or no updateToken function, logout
          logoutFunction();
          originalRequest.showErrorToast = false;
        }
      }
    }
    
    handleApiError(error, logoutFunction);
    return Promise.reject(error);
  }
);

const wrapApiCall = (apiCall) => {
  return apiCall
    .then(data => ({
      data,
      status: 'success',
      error: null,
    }))
    .catch(error => {
      return {
        data: null,
        status: 'error',
        error: {
          message: error.response?.data?.message || error.message || 'Request failed',
          status: error.response?.status,
          code: error.code,
        },
      };
    });
};

export const apiService = {
  /**
   * @param {string} url - API endpoint
   * @param {object} params - Query parameters
   * @param {object} config - Axios config
   * @param {boolean} config.noToken - Skip authentication token (default: false)
   * @param {boolean} config.showErrorToast - Show error toast (default: false)
   * @param {boolean} config.showSuccessToast - Show success toast (default: false)
   * @param {string} config.customMessage - Custom error message
   * @param {boolean} config.returnStatus - Return status object instead of just data (default: false)
   * @returns {Promise} - Returns data by default, or { data, status, error } if returnStatus is true
   */
  get: (url, params = {}, config = {}) => {
    const { returnStatus, ...restConfig } = config;
    const apiCall = apiClient.get(url, { params, ...restConfig });
    return returnStatus ? wrapApiCall(apiCall) : apiCall;
  },

  /**
   * @param {string} url - API endpoint
   * @param {object} data - Request body data
   * @param {object} config - Axios config
   * @param {boolean} config.noToken - Skip authentication token (default: false)
   * @param {boolean} config.showErrorToast - Show error toast (default: false)
   * @param {boolean} config.showSuccessToast - Show success toast (default: false)
   * @param {string} config.customMessage - Custom error message
   * @param {boolean} config.returnStatus - Return status object instead of just data (default: false)
   * @returns {Promise} - Returns data by default, or { data, status, error } if returnStatus is true
   */
  post: (url, data = {}, config = {}) => {
    const { returnStatus, ...restConfig } = config;
    const apiCall = apiClient.post(url, data, restConfig);
    return returnStatus ? wrapApiCall(apiCall) : apiCall;
  },

  /**
   * @param {string} url - API endpoint
   * @param {object} data - Request body data
   * @param {object} config - Axios config
   * @param {boolean} config.noToken - Skip authentication token (default: false)
   * @param {boolean} config.showErrorToast - Show error toast (default: false)
   * @param {boolean} config.showSuccessToast - Show success toast (default: false)
   * @param {string} config.customMessage - Custom error message
   * @param {boolean} config.returnStatus - Return status object instead of just data (default: false)
   * @returns {Promise} - Returns data by default, or { data, status, error } if returnStatus is true
   */
  put: (url, data = {}, config = {}) => {
    const { returnStatus, ...restConfig } = config;
    const apiCall = apiClient.put(url, data, restConfig);
    return returnStatus ? wrapApiCall(apiCall) : apiCall;
  },

  /**
   * @param {string} url - API endpoint
   * @param {object} config - Axios config
   * @param {boolean} config.noToken - Skip authentication token (default: false)
   * @param {boolean} config.showErrorToast - Show error toast (default: false)
   * @param {boolean} config.showSuccessToast - Show success toast (default: false)
   * @param {string} config.customMessage - Custom error message
   * @param {boolean} config.returnStatus - Return status object instead of just data (default: false)
   * @returns {Promise} - Returns data by default, or { data, status, error } if returnStatus is true
   */
  delete: (url, config = {}) => {
    const { returnStatus, ...restConfig } = config;
    const apiCall = apiClient.delete(url, restConfig);
    return returnStatus ? wrapApiCall(apiCall) : apiCall;
  },

  /**
   * @param {string} url - API endpoint
   * @param {FormData} formData - Form data to upload
   */
  upload: (url, formData) => {
    return apiClient.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export default apiService;