/**
 * React hook for managing notifications
 */

import { useState, useEffect, useCallback } from 'react';
import { notificationService, NotificationPermission } from '@/lib/notifications';
import { useAuthStore } from '@/stores/authStore';

export interface NotificationSettings {
  enabled: boolean;
  showPMNotifications: boolean;
  showChannelNotifications: boolean;
  showTypingNotifications: boolean;
  requireInteraction: boolean;
  silent: boolean;
}

const defaultSettings: NotificationSettings = {
  enabled: false,
  showPMNotifications: true,
  showChannelNotifications: false,
  showTypingNotifications: false,
  requireInteraction: false,
  silent: false
};

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    notificationService.getPermissionStatus()
  );
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [isSupported, setIsSupported] = useState(notificationService.isNotificationSupported());
  const { user } = useAuthStore();

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('notification-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.error('Failed to parse notification settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('notification-settings', JSON.stringify(settings));
  }, [settings]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await notificationService.requestPermission();
    setPermission(notificationService.getPermissionStatus());
    return granted;
  }, []);

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Show PM notification
  const showPMNotification = useCallback(async (
    senderName: string,
    message: string,
    characterName?: string,
    onOpenPM?: () => void
  ) => {
    if (!settings.enabled || !settings.showPMNotifications || !permission.granted) {
      return null;
    }

    // Don't show notification if app is in foreground and user is active
    if (notificationService.isAppInForeground() && document.hasFocus()) {
      return null;
    }

    return await notificationService.showPMNotification(
      senderName,
      message,
      characterName,
      onOpenPM
    );
  }, [settings.enabled, settings.showPMNotifications, permission.granted]);

  // Show channel notification
  const showChannelNotification = useCallback(async (
    channelName: string,
    messageCount: number
  ) => {
    if (!settings.enabled || !settings.showChannelNotifications || !permission.granted) {
      return null;
    }

    // Don't show notification if app is in foreground and user is active
    if (notificationService.isAppInForeground() && document.hasFocus()) {
      return null;
    }

    const title = `New messages in #${channelName}`;
    const body = `${messageCount} new message${messageCount > 1 ? 's' : ''}`;

    return await notificationService.showNotification({
      title,
      body,
      tag: `channel-${channelName}`,
      requireInteraction: settings.requireInteraction,
      silent: settings.silent,
      data: {
        type: 'channel',
        channel: channelName,
        messageCount
      }
    });
  }, [settings.enabled, settings.showChannelNotifications, permission.granted]);

  // Show typing notification
  const showTypingNotification = useCallback(async (
    senderName: string,
    status: 'typing' | 'paused'
  ) => {
    if (!settings.enabled || !settings.showTypingNotifications || !permission.granted) {
      return null;
    }

    // Don't show notification if app is in foreground and user is active
    if (notificationService.isAppInForeground() && document.hasFocus()) {
      return null;
    }

    const title = `${senderName} is ${status === 'typing' ? 'typing' : 'paused'}`;
    const body = `In PM with ${senderName}`;

    return await notificationService.showNotification({
      title,
      body,
      tag: `typing-${senderName}`,
      requireInteraction: false,
      silent: true, // Typing notifications should be silent
      data: {
        type: 'typing',
        sender: senderName,
        status
      }
    });
  }, [settings.enabled, settings.showTypingNotifications, permission.granted]);

  // Close notifications
  const closeNotifications = useCallback(async (tag: string) => {
    await notificationService.closeNotifications(tag);
  }, []);

  // Close all notifications
  const closeAllNotifications = useCallback(async () => {
    await notificationService.closeAllNotifications();
  }, []);

  // Check if notifications are enabled and permission is granted
  const isNotificationReady = useCallback(() => {
    return isSupported && permission.granted && settings.enabled;
  }, [isSupported, permission.granted, settings.enabled]);

  // Listen for notification events
  useEffect(() => {
    const handleNotificationOpenPM = (event: CustomEvent) => {
      const { sender, characterName } = event.detail;
      console.log('Notification: Open PM with', sender, 'for character', characterName);
      // This will be handled by the ChatInterface component
    };

    window.addEventListener('notification:open-pm', handleNotificationOpenPM as EventListener);

    return () => {
      window.removeEventListener('notification:open-pm', handleNotificationOpenPM as EventListener);
    };
  }, []);

  return {
    // State
    permission,
    settings,
    isSupported,
    isReady: isNotificationReady(),
    
    // Actions
    requestPermission,
    updateSettings,
    showPMNotification,
    showChannelNotification,
    showTypingNotification,
    closeNotifications,
    closeAllNotifications,
    
    // Utilities
    isAppInForeground: notificationService.isAppInForeground.bind(notificationService),
    isMobile: notificationService.isMobile.bind(notificationService)
  };
}
