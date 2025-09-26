'use client';

import { useState } from 'react';
import { ProfileData } from '@/types';
import { getCharacterNameStyle, getGenderDisplayName } from '@/lib/genderColors';
import { useChatStore } from '@/stores/chatStore';
import kinksData from '@/kinks';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfileData | null;
  characterName: string;
}

export default function ProfileModal({ isOpen, onClose, profileData, characterName }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'info' | 'kinks' | 'images'>('description');
  const { getProfileRequestStatus, isProfileStale, refreshProfile, requestProfileForCharacter } = useChatStore();

  const profileStatus = getProfileRequestStatus(characterName);
  const isStale = isProfileStale(characterName);

  const handleRefreshProfile = async () => {
    if (profileData) {
      console.log(`Refreshing profile for ${characterName}`);
      await refreshProfile(characterName);
    } else if (!profileData) {
      console.log(`Requesting profile for ${characterName}`);
      requestProfileForCharacter(characterName);
    }
  };

  if (!isOpen) return null;

  const formatFieldValue = (value: string): string => {
    // Handle BBCode and format long text nicely
    if (value.length > 200) {
      return value.substring(0, 200) + '...';
    }
    return value;
  };

  const renderFieldValue = (value: string): JSX.Element => {
    const formatted = formatFieldValue(value);
    return (
      <div className="text-gray-300 text-sm whitespace-pre-wrap break-words">
        {formatted}
      </div>
    );
  };

  const renderSection = (data: Record<string, string | any>, title: string) => {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No {title.toLowerCase()} fields available
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {entries.map(([key, value]) => (
          <div key={key} className="border-b border-gray-700 pb-2">
            <div className="font-medium text-white text-sm capitalize mb-1">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            </div>
            {typeof value === 'string' ? renderFieldValue(value) : (
              <div className="text-gray-400 text-xs">
                {JSON.stringify(value, null, 2)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const getKinkName = (kinkId: string): string => {
    const kink = kinksData.kinks.find(k => k.fetish_id === kinkId);
    return kink ? kink.name : `Unknown Kink (${kinkId})`;
  };

  const getKinkPreference = (kinkId: string): string => {
    // Look for kink preference in profile data
    const kinkKey = `kink_${kinkId}`;
    const preference = profileData?.info[kinkKey] || profileData?.select[kinkKey] || profileData?.additional[kinkKey];
    return preference || 'Not specified';
  };

  const renderDescriptionTab = () => {
    if (!profileData) return null;

    // Look for description fields
    const descriptionFields = ['description', 'Description', 'profile', 'Profile', 'about', 'About'];
    let description = '';
    
    for (const field of descriptionFields) {
      const value = profileData.info[field] || profileData.select[field] || profileData.additional[field];
      if (value && typeof value === 'string' && value.trim()) {
        description = value;
        break;
      }
    }

    if (!description) {
      return (
        <div className="text-gray-500 italic text-sm">
          No description available
        </div>
      );
    }

    return (
      <div className="text-gray-300 text-sm whitespace-pre-wrap break-words leading-relaxed">
        {description}
      </div>
    );
  };

  const renderInfoTab = () => {
    if (!profileData) return null;

    // Filter out kink fields and description fields
    const descriptionFields = ['description', 'Description', 'profile', 'Profile', 'about', 'About'];
    const kinkFields = Object.keys(profileData.info).filter(key => key.startsWith('kink_'));
    
    const infoFields = Object.entries(profileData.info).filter(([key, value]) => 
      !descriptionFields.includes(key) && 
      !kinkFields.includes(key) && 
      typeof value === 'string' && 
      value.trim()
    );

    if (infoFields.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No additional information available
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {infoFields.map(([key, value]) => (
          <div key={key} className="border-b border-gray-700 pb-2">
            <div className="font-medium text-white text-sm capitalize mb-1">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            </div>
            <div className="text-gray-300 text-sm whitespace-pre-wrap break-words">
              {value}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderKinksTab = () => {
    if (!profileData) return null;

    // Find all kink fields
    const kinkFields = Object.entries(profileData.info).filter(([key, value]) => 
      key.startsWith('kink_') && typeof value === 'string' && value.trim()
    );

    if (kinkFields.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No kink preferences available
        </div>
      );
    }

    // Group kinks by preference
    const kinksByPreference: Record<string, string[]> = {};
    
    kinkFields.forEach(([key, value]) => {
      const kinkId = key.replace('kink_', '');
      const kinkName = getKinkName(kinkId);
      
      if (!kinksByPreference[value]) {
        kinksByPreference[value] = [];
      }
      kinksByPreference[value].push(kinkName);
    });

    const preferenceOrder = ['Yes', 'Maybe', 'No', 'Fave'];
    const sortedPreferences = preferenceOrder.filter(pref => kinksByPreference[pref]);

    return (
      <div className="space-y-4">
        {sortedPreferences.map(preference => (
          <div key={preference} className="border-b border-gray-700 pb-3">
            <div className="font-medium text-white text-sm mb-2 flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs ${
                preference === 'Yes' || preference === 'Fave' ? 'bg-green-600 text-white' :
                preference === 'Maybe' ? 'bg-yellow-600 text-white' :
                preference === 'No' ? 'bg-red-600 text-white' :
                'bg-gray-600 text-white'
              }`}>
                {preference}
              </span>
              <span>({kinksByPreference[preference].length})</span>
            </div>
            <div className="text-gray-300 text-sm">
              {kinksByPreference[preference].join(', ')}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderImagesTab = () => {
    if (!profileData) return null;

    // Look for image fields
    const imageFields = ['image', 'Image', 'avatar', 'Avatar', 'picture', 'Picture', 'photo', 'Photo'];
    const images: string[] = [];

    for (const field of imageFields) {
      const value = profileData.info[field] || profileData.select[field] || profileData.additional[field];
      if (value && typeof value === 'string' && value.trim()) {
        // Check if it looks like a URL
        if (value.match(/^https?:\/\/.+/)) {
          images.push(value);
        }
      }
    }

    if (images.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No images available
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {images.map((imageUrl, index) => (
          <div key={index} className="border border-gray-700 rounded-lg overflow-hidden">
            <img
              src={imageUrl}
              alt={`Profile image ${index + 1}`}
              className="w-full h-auto max-h-96 object-contain bg-gray-900"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = '<div class="p-4 text-gray-500 italic text-sm">Failed to load image</div>';
                }
              }}
            />
          </div>
        ))}
      </div>
    );
  };

  const getTabContent = () => {
    if (!profileData) {
      return (
        <div className="text-center py-8">
          <div className="text-gray-500 italic mb-4">No profile data available</div>
          {profileStatus === 'failed' && (
            <div className="text-red-400 text-sm mb-4">
              Failed to load profile. Try requesting again.
            </div>
          )}
          {profileStatus === 'requesting' && (
            <div className="text-blue-400 text-sm">
              Loading profile data...
            </div>
          )}
          {profileStatus === 'idle' && (
            <button
              onClick={handleRefreshProfile}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
            >
              Request Profile
            </button>
          )}
        </div>
      );
    }

    switch (activeTab) {
      case 'description':
        return renderDescriptionTab();
      case 'info':
        return renderInfoTab();
      case 'kinks':
        return renderKinksTab();
      case 'images':
        return renderImagesTab();
      default:
        return null;
    }
  };

  const getTabCount = (tab: 'description' | 'info' | 'kinks' | 'images'): number => {
    if (!profileData) return 0;
    
    const descriptionFields = ['description', 'Description', 'profile', 'Profile', 'about', 'About'];
    const imageFields = ['image', 'Image', 'avatar', 'Avatar', 'picture', 'Picture', 'photo', 'Photo'];
    
    switch (tab) {
      case 'description':
        return descriptionFields.some(field => 
          profileData.info[field] || profileData.select[field] || profileData.additional[field]
        ) ? 1 : 0;
      
      case 'info':
        const kinkFields = Object.keys(profileData.info).filter(key => key.startsWith('kink_'));
        return Object.entries(profileData.info).filter(([key, value]) => 
          !descriptionFields.includes(key) && 
          !kinkFields.includes(key) && 
          typeof value === 'string' && 
          value.trim()
        ).length;
      
      case 'kinks':
        return Object.entries(profileData.info).filter(([key, value]) => 
          key.startsWith('kink_') && typeof value === 'string' && value.trim()
        ).length;
      
      case 'images':
        return imageFields.filter(field => {
          const value = profileData.info[field] || profileData.select[field] || profileData.additional[field];
          return value && typeof value === 'string' && value.trim() && value.match(/^https?:\/\/.+/);
        }).length;
      
      default:
        return 0;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">Character Profile</h2>
            <p className="text-sm flex items-center gap-2" style={profileData ? getCharacterNameStyle(profileData.gender) : undefined}>
              {characterName}
              {profileData && (
                <span className="text-xs text-gray-400">
                  ({getGenderDisplayName(profileData.gender)})
                </span>
              )}
              {profileStatus === 'requesting' && (
                <span className="text-xs text-blue-400 animate-spin">⟳</span>
              )}
              {profileStatus === 'failed' && (
                <span className="text-xs text-red-400">⚠ Failed</span>
              )}
              {profileData && isStale && (
                <span className="text-xs text-yellow-400">⟳ Stale</span>
              )}
            </p>
            {profileData && (
              <p className="text-gray-400 text-xs mt-1">
                Last updated: {new Date(profileData.timestamp).toLocaleString()}
              </p>
            )}
            {!profileData && profileStatus === 'idle' && (
              <p className="text-gray-500 text-xs mt-1">
                No profile data available
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh/Request button */}
            <button
              onClick={handleRefreshProfile}
              disabled={profileStatus === 'requesting'}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                profileStatus === 'requesting'
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title={
                !profileData ? 'Request profile data' :
                isStale ? 'Refresh stale profile data' :
                'Refresh profile data'
              }
            >
              {profileStatus === 'requesting' ? 'Loading...' :
               !profileData ? 'Request' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {(['description', 'info', 'kinks', 'images'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-white bg-gray-700 border-b-2 border-indigo-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-750'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="capitalize">{tab}</span>
                <span className="text-xs bg-gray-600 px-2 py-0.5 rounded-full">
                  {getTabCount(tab)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {getTabContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 bg-gray-750 border-t border-gray-700">
          <div className="text-gray-400 text-xs">
            {profileData ? (
              `Total fields: ${getTabCount('description') + getTabCount('info') + getTabCount('kinks') + getTabCount('images')}`
            ) : (
              'No profile data'
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}