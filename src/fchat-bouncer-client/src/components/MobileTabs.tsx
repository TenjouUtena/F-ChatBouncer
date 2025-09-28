'use client';

import React from 'react';
import { MessageSquare, Users, Settings } from 'lucide-react';

interface MobileTabsProps {
  activeTab: string | null;
  onTabClick: (tab: string) => void;
  unreadCounts?: {
    channels?: number;
    friends?: number;
    characters?: number;
  };
  className?: string;
}

export default function MobileTabs({ activeTab, onTabClick, unreadCounts = {}, className = '' }: MobileTabsProps) {
  const tabs = [
    { 
      id: 'channels', 
      label: 'Channels', 
      icon: MessageSquare,
      unreadCount: unreadCounts.channels || 0
    },
    { 
      id: 'friends', 
      label: 'Friends', 
      icon: Users,
      unreadCount: unreadCounts.friends || 0
    },
    { 
      id: 'characters', 
      label: 'Characters', 
      icon: Settings,
      unreadCount: unreadCounts.characters || 0
    }
  ];

  return (
    <div className={`fixed left-0 top-20 z-30 lg:hidden ${className}`}>
      <div className="flex flex-col space-y-2">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabClick(tab.id)}
              className={`w-12 h-12 rounded-r-lg border border-gray-600 border-l-0 flex items-center justify-center transition-all duration-200 relative ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              title={tab.label}
            >
              <IconComponent className="w-5 h-5" />
              {tab.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
