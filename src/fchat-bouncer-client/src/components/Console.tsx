'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Console Component
 * 
 * A floating, resizable console window for displaying system messages, friend updates,
 * status changes, and other events of interest.
 * 
 * Usage:
 * - Import consoleUtils from this component
 * - Use consoleUtils.info(), consoleUtils.success(), consoleUtils.warning(), 
 *   consoleUtils.error(), consoleUtils.friend(), consoleUtils.status() to add messages
 * - Messages are automatically timestamped and categorized
 * 
 * Features:
 * - Draggable window
 * - Resizable window
 * - Minimizable
 * - Clear messages
 * - Different message types with icons and colors
 * - JSON data display for complex objects
 */

interface ConsoleMessage {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'friend' | 'status';
  message: string;
  data?: any;
}

interface ConsoleProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function Console({ isVisible, onClose }: ConsoleProps) {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ width: 400, height: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  const consoleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // Add a message to the console
  const addMessage = (type: ConsoleMessage['type'], message: string, data?: any) => {
    const newMessage: ConsoleMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
      data
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  // Clear all messages
  const clearMessages = () => {
    setMessages([]);
  };

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === dragRef.current || dragRef.current?.contains(e.target as Node)) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  // Handle mouse down for resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  // Handle mouse move for dragging and resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
      
      if (isResizing) {
        const newWidth = Math.max(200, resizeStart.width + (e.clientX - resizeStart.x));
        const newHeight = Math.max(150, resizeStart.height + (e.clientY - resizeStart.y));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart]);

  // Expose addMessage function globally for other components to use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).consoleAddMessage = addMessage;
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).consoleAddMessage;
      }
    };
  }, []);

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // Get message type styling
  const getMessageTypeStyle = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      case 'friend':
        return 'text-blue-400';
      case 'status':
        return 'text-purple-400';
      default:
        return 'text-gray-300';
    }
  };

  // Get message type icon
  const getMessageTypeIcon = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'friend':
        return '👥';
      case 'status':
        return '📊';
      default:
        return 'ℹ️';
    }
  };

  if (!isVisible) return null;

  return (
    <div
      ref={consoleRef}
      className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 'auto' : size.height,
        minWidth: 200,
        minHeight: 150
      }}
    >
      {/* Header */}
      <div
        ref={dragRef}
        className="bg-gray-800 px-3 py-2 rounded-t-lg cursor-move flex items-center justify-between border-b border-gray-600"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center space-x-2">
          <span className="text-white font-semibold text-sm">Console</span>
          <span className="text-gray-400 text-xs">({messages.length} messages)</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-gray-400 hover:text-white text-sm px-1"
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? '⬆️' : '⬇️'}
          </button>
          <button
            onClick={clearMessages}
            className="text-gray-400 hover:text-white text-sm px-1"
            title="Clear messages"
          >
            🗑️
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-1"
            title="Close console"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="flex flex-col h-full">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-900">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-4">
                No messages yet. Console will show friend updates, status changes, and other events.
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="text-xs">
                  <div className="flex items-start space-x-2">
                    <span className="text-gray-500 flex-shrink-0">
                      {formatTime(msg.timestamp)}
                    </span>
                    <span className="flex-shrink-0">
                      {getMessageTypeIcon(msg.type)}
                    </span>
                    <span className={`flex-1 ${getMessageTypeStyle(msg.type)}`}>
                      {msg.message}
                    </span>
                  </div>
                  {msg.data && (
                    <div className="ml-8 text-gray-400 text-xs">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(msg.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        onMouseDown={handleResizeMouseDown}
        style={{
          background: 'linear-gradient(-45deg, transparent 30%, #4B5563 30%, #4B5563 70%, transparent 70%)'
        }}
      />
    </div>
  );
}

// Export utility functions for other components to use
export const consoleUtils = {
  addMessage: (type: ConsoleMessage['type'], message: string, data?: any) => {
    if (typeof window !== 'undefined' && (window as any).consoleAddMessage) {
      (window as any).consoleAddMessage(type, message, data);
    }
  },
  
  // Convenience methods
  info: (message: string, data?: any) => {
    consoleUtils.addMessage('info', message, data);
  },
  
  success: (message: string, data?: any) => {
    consoleUtils.addMessage('success', message, data);
  },
  
  warning: (message: string, data?: any) => {
    consoleUtils.addMessage('warning', message, data);
  },
  
  error: (message: string, data?: any) => {
    consoleUtils.addMessage('error', message, data);
  },
  
  friend: (message: string, data?: any) => {
    consoleUtils.addMessage('friend', message, data);
  },
  
  status: (message: string, data?: any) => {
    consoleUtils.addMessage('status', message, data);
  }
};
