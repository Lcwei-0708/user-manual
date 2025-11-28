import apiService from './api.service';
import i18n from '@/i18n';
import ENV from "@/config/env.config";

const BASE_WEBPUSH = '/webpush';

export const webpushService = {
  subscribe: (subscriptionData, config = {}) => 
    apiService.post(`${BASE_WEBPUSH}/subscribe`, subscriptionData, {
      showErrorToast: ENV.DEBUG ? true : false,
      showSuccessToast: ENV.DEBUG ? true : false,
      messageMap: {
        success: i18n.t('webpush.subscribe.messages.success', { defaultValue: 'Web Push subscription successful' }),
        ...config.messageMap,
      },
      ...config,
    }),

  unsubscribe: (endpoint, config = {}) => 
    apiService.post(`${BASE_WEBPUSH}/unsubscribe`, { endpoint }, {
      showErrorToast: ENV.DEBUG ? true : false,
      showSuccessToast: ENV.DEBUG ? true : false,
      messageMap: {
        success: i18n.t('webpush.unsubscribe.messages.success', { defaultValue: 'Web Push unsubscription successful' }),
        ...config.messageMap,
      },
      ...config,
    }),

  getSubscriptions: (config = {}) => 
    apiService.get(`${BASE_WEBPUSH}/subscriptions`, {}, {
      showErrorToast: false,
      showSuccessToast: false,
      messageMap: {
        success: i18n.t('webpush.getSubscriptions.messages.success', { defaultValue: 'Subscriptions retrieved successfully' }),
        ...config.messageMap,
      },
      ...config,
    }),
};

export default webpushService; 