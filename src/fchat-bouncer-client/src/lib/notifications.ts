/**
 * Cross-platform notification service for F-Chat Bouncer
 * Handles desktop and mobile notifications for PM messages
 */

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  silent?: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

class NotificationService {
  private isSupported: boolean;
  private permission: NotificationPermission;
  private isServiceWorkerReady: boolean = false;

  constructor() {
    // Check if we're in browser environment (SSR safety)
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window;
    this.permission = this.getPermissionStatus();
    this.initializeServiceWorker();
  }

  /**
   * Check if notifications are supported
   */
  public isNotificationSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Get current permission status
   */
  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported || typeof window === 'undefined') {
      return { granted: false, denied: true, default: false };
    }

    const permission = Notification.permission;
    return {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    };
  }

  /**
   * Request notification permission
   */
  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Notifications not supported in this browser');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = this.getPermissionStatus();
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Show a notification
   */
  public async showNotification(options: NotificationOptions): Promise<Notification | null> {
    if (!this.isSupported) {
      console.warn('Notifications not supported');
      return null;
    }

    if (!this.permission.granted) {
      console.warn('Notification permission not granted');
      return null;
    }

    try {
      // Use service worker if available, otherwise use direct notification
      if (this.isServiceWorkerReady && 'serviceWorker' in navigator) {
        return await this.showServiceWorkerNotification(options);
      } else {
        return this.showDirectNotification(options);
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  /**
   * Show notification via service worker (for mobile/PWA)
   */
  private async showServiceWorkerNotification(options: NotificationOptions): Promise<Notification | null> {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.ico',
        badge: options.badge || '/logo.ico',
        tag: options.tag,
        data: options.data,
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false
      });
      
      // Return a mock notification object for consistency
      return {
        close: () => {},
        onclick: null,
        onerror: null,
        onshow: null,
        onclose: null
      } as Notification;
    } catch (error) {
      console.error('Failed to show service worker notification:', error);
      return null;
    }
  }

  /**
   * Show direct notification (for desktop)
   */
  private showDirectNotification(options: NotificationOptions): Notification | null {
    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.ico',
        badge: options.badge || '/logo.ico',
        tag: options.tag,
        data: options.data,
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false
      });

      // Auto-close after 5 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      return notification;
    } catch (error) {
      console.error('Failed to show direct notification:', error);
      return null;
    }
  }

  /**
   * Show PM notification specifically
   */
  public async showPMNotification(
    senderName: string, 
    message: string, 
    characterName?: string,
    onOpenPM?: () => void
  ): Promise<Notification | null> {
    const title = `New PM from ${senderName}`;
    const body = message.length > 100 ? message.substring(0, 100) + '...' : message;
    
    const notification = await this.showNotification({
      title,
      body,
      icon: '/logo.ico',
      tag: `pm-${senderName}-${Date.now()}`,
      requireInteraction: true,
      data: {
        type: 'pm',
        sender: senderName,
        characterName,
        message
      },
      actions: [
        {
          action: 'open',
          title: 'Open PM',
          icon: '/logo.ico'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    });

    if (notification && onOpenPM) {
      notification.onclick = () => {
        onOpenPM();
        notification.close();
      };
    }

    return notification;
  }

  /**
   * Close all notifications with a specific tag
   */
  public async closeNotifications(tag: string): Promise<void> {
    if (!this.isSupported) return;

    try {
      if (this.isServiceWorkerReady && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const notifications = await registration.getNotifications({ tag });
        notifications.forEach(notification => notification.close());
      }
    } catch (error) {
      console.error('Failed to close notifications:', error);
    }
  }

  /**
   * Close all notifications
   */
  public async closeAllNotifications(): Promise<void> {
    if (!this.isSupported) return;

    try {
      if (this.isServiceWorkerReady && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const notifications = await registration.getNotifications();
        notifications.forEach(notification => notification.close());
      }
    } catch (error) {
      console.error('Failed to close all notifications:', error);
    }
  }

  /**
   * Initialize service worker for mobile notifications
   */
  private async initializeServiceWorker(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered:', registration);
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      this.isServiceWorkerReady = true;
      
      // Listen for service worker messages
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
          const { action, data } = event.data;
          this.handleNotificationAction(action, data);
        }
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
      this.isServiceWorkerReady = false;
    }
  }

  /**
   * Handle notification actions
   */
  private handleNotificationAction(action: string, data: any): void {
    if (typeof window === 'undefined') return;
    
    switch (action) {
      case 'open':
        // Focus the window and open the PM
        if (window.focus) {
          window.focus();
        }
        // Emit custom event for PM opening
        window.dispatchEvent(new CustomEvent('notification:open-pm', {
          detail: { sender: data.sender, characterName: data.characterName }
        }));
        break;
      case 'dismiss':
        // Just close the notification
        break;
    }
  }

  /**
   * Check if the app is in the foreground
   */
  public isAppInForeground(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'visible';
  }

  /**
   * Check if the app is on mobile
   */
  public isMobile(): boolean {
    return typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
}

// Create singleton instance
export const notificationService = new NotificationService();

// Export types and service
export default notificationService;
