// Centralized management of all environment variables for frontend (Vite/React only).
// Add new variables here.

// Helper function to get protocol based on SSL_ENABLE
const getProtocol = (sslEnabled, ws = false) => {
  return ws ? (sslEnabled ? 'wss' : 'ws') : (sslEnabled ? 'https' : 'http');
};

// Vite
const SSL_ENABLE = import.meta.env.VITE_SSL_ENABLE === 'true';
const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST || 'localhost';
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 5000;

export const ENV = {
  DEBUG: process.env.NODE_ENV === 'development' || false,
  SSL_ENABLE,
  API: {
    BASE_URL: `${getProtocol(SSL_ENABLE)}://${BACKEND_HOST}:${BACKEND_PORT}/api`,
  },
  KEYCLOAK: {
    SERVER_URL: import.meta.env.VITE_KEYCLOAK_SERVER_URL,
    REALM: import.meta.env.VITE_KEYCLOAK_REALM,
    CLIENT: import.meta.env.VITE_KEYCLOAK_CLIENT,
    SUPER_ROLE: import.meta.env.VITE_KEYCLOAK_SUPER_ROLE || 'tsadmin',
  },
  WEBSOCKET: {
    URL: `${getProtocol(SSL_ENABLE, true)}://${BACKEND_HOST}:${BACKEND_PORT}/ws/`,
    RECONNECT_INTERVAL: parseInt(import.meta.env.VITE_WEBSOCKET_RECONNECT_INTERVAL) || 3000,
    MAX_RECONNECT_ATTEMPTS: parseInt(import.meta.env.VITE_WEBSOCKET_MAX_RECONNECT_ATTEMPTS) || 5,
  },
  VAPID: {
    PUBLIC_KEY: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  },
};

export default ENV;