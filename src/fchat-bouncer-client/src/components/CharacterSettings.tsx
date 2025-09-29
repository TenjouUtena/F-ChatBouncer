'use client';

import React, { useState, useEffect } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useChatStore } from '@/stores/chatStore';
import { XMarkIcon, CogIcon, BellIcon, EyeIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

interface CharacterSettingsProps {
  characterName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface CharacterSettings {
  autoJoinChannels: boolean;
  showNotifications: boolean;
  showPMNotifications?: boolean;
  showChannelNotifications?: boolean;
  showTypingNotifications?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  messageHistoryLimit: number;
  autoScroll: boolean;
  showTimestamps: boolean;
  theme: 'dark' | 'light' | 'auto';
}

const defaultSettings: CharacterSettings = {
  autoJoinChannels: false,
  showNotifications: true,
  showPMNotifications: true,
  showChannelNotifications: false,
  showTypingNotifications: false,
  requireInteraction: false,
  silent: false,
  messageHistoryLimit: 1000,
  autoScroll: true,
  showTimestamps: true,
  theme: 'dark'
};

export default function CharacterSettings({ characterName, isOpen, onClose }: CharacterSettingsProps) {
  const { connections, getConnection } = useCharacterStore();
  const { getSelectedChannelsForCharacter } = useChatStore();
  const [settings, setSettings] = useState<CharacterSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    if (characterName) {
      const savedSettings = localStorage.getItem(`character-settings-${characterName}`);
      if (savedSettings) {
        try {
          setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
        } catch (error) {
          console.error('Failed to parse character settings:', error);
        }
      }
    }
  }, [characterName]);

  // Save settings to localStorage
  const saveSettings = async (newSettings: CharacterSettings) => {
    setIsLoading(true);
    try {
      localStorage.setItem(`character-settings-${characterName}`, JSON.stringify(newSettings));
      setSettings(newSettings);
      
      // Apply settings immediately
      applySettings(newSettings);
    } catch (error) {
      console.error('Failed to save character settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applySettings = (newSettings: CharacterSettings) => {
    // Apply theme
    if (newSettings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (newSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      // Auto theme - use system preference
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const handleSettingChange = (key: keyof CharacterSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  const resetToDefaults = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      saveSettings(defaultSettings);
    }
  };

  const connection = getConnection(characterName);
  const joinedChannels = getSelectedChannelsForCharacter(characterName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <CogIcon className="w-6 h-6 text-gray-400" />
            <div>
              <h2 className="text-xl font-semibold text-white">Character Settings</h2>
              <p className="text-sm text-gray-300">{characterName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Character Info */}
          <div className="mb-6 p-4 bg-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Character Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-300">Status:</span>
                <span className={`ml-2 px-2 py-1 rounded text-xs ${
                  connection?.isConnected 
                    ? 'bg-green-900/20 text-green-300' 
                    : 'bg-red-900/20 text-red-300'
                }`}>
                  {connection?.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div>
                <span className="text-gray-300">Joined Channels:</span>
                <span className="ml-2 font-medium text-white">{joinedChannels.length}</span>
              </div>
            </div>
          </div>

          {/* Settings Sections */}
          <div className="space-y-6">
            {/* Notifications */}
            <div>
              <h3 className="flex items-center gap-2 font-medium text-white mb-3">
                <BellIcon className="w-5 h-5" />
                Notifications
              </h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Enable Notifications</span>
                    <p className="text-xs text-gray-400">Receive browser notifications for new messages</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showNotifications}
                    onChange={(e) => handleSettingChange('showNotifications', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                  />
                </label>
                
                {settings.showNotifications && (
                  <div className="ml-4 space-y-2 border-l-2 border-gray-600 pl-4">
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-200">PM Notifications</span>
                        <p className="text-xs text-gray-400">Notify for private messages</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showPMNotifications ?? true}
                        onChange={(e) => handleSettingChange('showPMNotifications', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                      />
                    </label>
                    
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-200">Channel Notifications</span>
                        <p className="text-xs text-gray-400">Notify for channel messages</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showChannelNotifications ?? false}
                        onChange={(e) => handleSettingChange('showChannelNotifications', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                      />
                    </label>
                    
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-200">Typing Notifications</span>
                        <p className="text-xs text-gray-400">Notify when someone is typing</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showTypingNotifications ?? false}
                        onChange={(e) => handleSettingChange('showTypingNotifications', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                      />
                    </label>
                    
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-200">Require Interaction</span>
                        <p className="text-xs text-gray-400">Keep notifications until dismissed</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.requireInteraction ?? false}
                        onChange={(e) => handleSettingChange('requireInteraction', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Behavior */}
            <div>
              <h3 className="flex items-center gap-2 font-medium text-white mb-3">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                Chat Behavior
              </h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Auto-scroll to Bottom</span>
                    <p className="text-xs text-gray-400">Automatically scroll to new messages</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoScroll}
                    onChange={(e) => handleSettingChange('autoScroll', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Show Timestamps</span>
                    <p className="text-xs text-gray-400">Display message timestamps</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showTimestamps}
                    onChange={(e) => handleSettingChange('showTimestamps', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                  />
                </label>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Message History Limit</span>
                    <p className="text-xs text-gray-400">Maximum messages to keep in memory</p>
                  </div>
                  <select
                    value={settings.messageHistoryLimit}
                    onChange={(e) => handleSettingChange('messageHistoryLimit', parseInt(e.target.value))}
                    className="px-3 py-1 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-700 text-white"
                  >
                    <option value={500}>500 messages</option>
                    <option value={1000}>1,000 messages</option>
                    <option value={2000}>2,000 messages</option>
                    <option value={5000}>5,000 messages</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div>
              <h3 className="flex items-center gap-2 font-medium text-white mb-3">
                <EyeIcon className="w-5 h-5" />
                Appearance
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Theme</span>
                    <p className="text-xs text-gray-400">Choose your preferred theme</p>
                  </div>
                  <select
                    value={settings.theme}
                    onChange={(e) => handleSettingChange('theme', e.target.value as 'dark' | 'light' | 'auto')}
                    className="px-3 py-1 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-700 text-white"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="auto">Auto (System)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Channel Behavior */}
            <div>
              <h3 className="flex items-center gap-2 font-medium text-white mb-3">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                Channel Behavior
              </h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-200">Auto-join New Channels</span>
                    <p className="text-xs text-gray-400">Automatically join channels when receiving messages</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoJoinChannels}
                    onChange={(e) => handleSettingChange('autoJoinChannels', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700 bg-gray-700">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-gray-200 bg-gray-600 border border-gray-500 rounded-lg hover:bg-gray-500 transition-colors"
          >
            Reset to Defaults
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-200 bg-gray-600 border border-gray-500 rounded-lg hover:bg-gray-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
