import apiService from './api.service';
import i18n from '@/i18n';
import ENV from "@/config/env.config";

const BASE_USER = '/user';

export const userService = {
  getInfo: (config = {}) => 
    apiService.get(`${BASE_USER}/info`, {}, {
      showErrorToast: ENV.DEBUG ? true : false,
      showSuccessToast: false,
      messageMap: {
        success: i18n.t('user.getInfo.messages.success', { defaultValue: 'User info retrieved successfully' }),
        ...config.messageMap,
      },
      ...config,
    }),

  update: (userData, config = {}) => 
    apiService.put(`${BASE_USER}/update`, userData, {
      showErrorToast: true,
      showSuccessToast: true,
      messageMap: {
        success: i18n.t('user.update.messages.success', { defaultValue: 'User info updated successfully' }),
        400: i18n.t('errors.400.message', { defaultValue: 'Failed to update user info' }),
        409: i18n.t('errors.409.message', { defaultValue: 'Email already exists' }),
        ...config.messageMap,
      },
      ...config,
    }),

  changePassword: (passwordData, config = {}) => 
    apiService.post(`${BASE_USER}/change-password`, passwordData, {
      showErrorToast: true,
      showSuccessToast: true,
      messageMap: {
        success: i18n.t('user.changePassword.messages.success', { defaultValue: 'Password changed successfully' }),
        incorrect: i18n.t('user.changePassword.messages.incorrect', { defaultValue: 'Current password is incorrect' }),
        ...config.messageMap,
      },
      ...config,
    }),
};

export default userService; 