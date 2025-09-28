'use client';

import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  position?: 'left' | 'right';
  className?: string;
}

export default function MobileDrawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  className = ''
}: MobileDrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 ${position === 'left' ? 'left-12' : 'right-0'} h-full w-80 max-w-[85vw] bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${className}`}
        style={{
          transform: isOpen ? 'translateX(0)' : `translateX(${position === 'left' ? '-100%' : '100%'})`
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-full">
          {children}
        </div>
      </div>
    </>
  );
}
