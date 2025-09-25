import { useCallback, useRef, useEffect } from 'react';
import { signalRService } from '@/lib/signalr';

interface UseTypingStatusProps {
  isPMChannel: boolean;
  pmCharacterName?: string;
  activeCharacter?: string;
}

interface UseTypingStatusReturn {
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleInputChange: (hasContent: boolean) => void;
  handleBlur: () => void;
}

export function useTypingStatus({ 
  isPMChannel, 
  pmCharacterName, 
  activeCharacter 
}: UseTypingStatusProps): UseTypingStatusReturn {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pausedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingStatusRef = useRef<'typing' | 'paused' | 'clear' | null>(null);
  const hasTypedRef = useRef<boolean>(false);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (pausedTimeoutRef.current) {
        clearTimeout(pausedTimeoutRef.current);
      }
    };
  }, []);

  const sendTypingNotification = useCallback(async (status: 'typing' | 'paused' | 'clear') => {
    // Only send TPN for PM channels and if we have the required info
    if (!isPMChannel || !pmCharacterName || !activeCharacter) {
      return;
    }

    // Don't send duplicate status
    if (lastTypingStatusRef.current === status) {
      return;
    }

    try {
      await signalRService.sendTypingNotification(pmCharacterName, status);
      lastTypingStatusRef.current = status;
      console.log(`Sent TPN to ${pmCharacterName}: ${status}`);
    } catch (error) {
      console.error('Failed to send typing notification:', error);
    }
  }, [isPMChannel, pmCharacterName, activeCharacter]);

  const handleTypingStart = useCallback(() => {
    if (!isPMChannel || !pmCharacterName) return;

    // Clear any existing timeouts
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (pausedTimeoutRef.current) {
      clearTimeout(pausedTimeoutRef.current);
    }

    // Send typing status immediately
    sendTypingNotification('typing');
    hasTypedRef.current = true;

    // Set timeout to send 'paused' status after 3 seconds of no activity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingNotification('paused');
    }, 3000);
  }, [isPMChannel, pmCharacterName, sendTypingNotification]);

  const handleTypingStop = useCallback(() => {
    if (!isPMChannel || !pmCharacterName) return;

    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Clear paused timeout
    if (pausedTimeoutRef.current) {
      clearTimeout(pausedTimeoutRef.current);
      pausedTimeoutRef.current = null;
    }

    // Only send 'paused' if we were typing
    if (lastTypingStatusRef.current === 'typing') {
      sendTypingNotification('paused');
    }
  }, [isPMChannel, pmCharacterName, sendTypingNotification]);

  const handleInputChange = useCallback((hasContent: boolean) => {
    if (!isPMChannel || !pmCharacterName) return;

    if (hasContent) {
      // User is typing - start typing status
      handleTypingStart();
    } else {
      // User cleared the input - send clear status if they had typed before
      if (hasTypedRef.current) {
        sendTypingNotification('clear');
        hasTypedRef.current = false;
        
        // Clear timeouts
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        if (pausedTimeoutRef.current) {
          clearTimeout(pausedTimeoutRef.current);
          pausedTimeoutRef.current = null;
        }
      }
    }
  }, [isPMChannel, pmCharacterName, handleTypingStart, sendTypingNotification]);

  const handleBlur = useCallback(() => {
    if (!isPMChannel || !pmCharacterName) return;

    // Clear timeouts
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (pausedTimeoutRef.current) {
      clearTimeout(pausedTimeoutRef.current);
      pausedTimeoutRef.current = null;
    }

    // Send clear status on blur
    sendTypingNotification('clear');
    hasTypedRef.current = false;
  }, [isPMChannel, pmCharacterName, sendTypingNotification]);

  return {
    handleTypingStart,
    handleTypingStop,
    handleInputChange,
    handleBlur,
  };
}
