import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import type { Message } from '@/types';

interface UseChannelMessagesOptions {
  characterName?: string | null;
  channelId?: string | null;
  limit?: number;
  autoScroll?: boolean;
}

interface UseChannelMessagesResult {
  messages: Message[];
  containerRef: React.RefObject<HTMLDivElement>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  isNearBottom: (threshold?: number) => boolean;
}

export function useChannelMessages({
  characterName,
  channelId,
  limit = 50,
  autoScroll = true
}: UseChannelMessagesOptions): UseChannelMessagesResult {
  const containerRef = useRef<HTMLDivElement>(null);

  const selectMessages = useCallback(
    (state: ReturnType<typeof useChatStore.getState>) => {
      if (!characterName || !channelId) {
        return [] as Message[];
      }
      return state.getRecentMessagesForChannel(characterName, channelId, limit);
    },
    [characterName, channelId, limit]
  );

  const messages = useChatStore(selectMessages);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
  }, []);

  const isNearBottom = useCallback((threshold: number = 120) => {
    const container = containerRef.current;
    if (!container) return true;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= threshold;
  }, []);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    if (isNearBottom()) {
      scrollToBottom('smooth');
    }
  }, [messages.length, autoScroll, isNearBottom, scrollToBottom]);

  const safeMessages = useMemo(() => messages ?? [], [messages]);

  return {
    messages: safeMessages,
    containerRef,
    scrollToBottom,
    isNearBottom
  };
}

