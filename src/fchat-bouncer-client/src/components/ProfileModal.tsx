'use client';

import { useState } from 'react';
import { ProfileData, KinkInfo, ProfileImage } from '@/types';
import { getCharacterNameStyle, getGenderDisplayName } from '@/lib/genderColors';
import { useChatStore } from '@/stores/chatStore';
import kinksData from '@/kinks';
import { bbcodeToHtml } from '@/lib/bbcode';

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
    const kink = profileData?.kinks?.find(k => k.kink_id === kinkId);
    return kink?.kink_pref || 'Not specified';
  };

  const renderDescriptionTab = () => {
    if (!profileData) return null;

    const description = profileData.description;

    if (!description) {
      return (
        <div className="text-gray-500 italic text-sm">
          No description available
        </div>
      );
    }

    try {
      const htmlDescription = bbcodeToHtml(description);
      return (
        <div 
          className="text-gray-300 text-sm break-words leading-relaxed"
          dangerouslySetInnerHTML={{ __html: htmlDescription }}
        />
      );
    } catch (error) {
      console.warn('Failed to render description BBCode:', error);
      return (
        <div className="text-gray-300 text-sm whitespace-pre-wrap break-words leading-relaxed">
          {description}
        </div>
      );
    }
  };

  const renderInfoTab = () => {
    if (!profileData) return null;

    const infoFields = Object.entries(profileData.info || {}).filter(([key, value]) => 
      typeof value === 'string' && value.trim()
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

    if (!profileData.kinks || profileData.kinks.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No kink preferences available
        </div>
      );
    }

    // Group kinks by preference
    const kinksByPreference: Record<string, KinkInfo[]> = {
      'fave': [],
      'yes': [],
      'maybe': [],
      'no': []
    };
    
    profileData.kinks.forEach((kink) => {
      const preference = kink.kink_pref.toLowerCase();
      if (kinksByPreference[preference]) {
        kinksByPreference[preference].push(kink);
      }
    });

    return (
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(kinksByPreference).map(([preference, kinks]) => (
          <div key={preference} className="space-y-2">
            <div className="font-medium text-white text-sm mb-2 flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs ${
                preference === 'yes' || preference === 'fave' ? 'bg-green-600 text-white' :
                preference === 'maybe' ? 'bg-yellow-600 text-white' :
                preference === 'no' ? 'bg-red-600 text-white' :
                'bg-gray-600 text-white'
              }`}>
                {preference.charAt(0).toUpperCase() + preference.slice(1)}
              </span>
              <span>({kinks.length})</span>
            </div>
            <div className="space-y-1 max-h-full overflow-y-auto">
              {kinks.length === 0 ? (
                <div className="text-gray-500 italic text-xs">None</div>
              ) : (
                kinks.sort((a, b) => 
                {
                  if(a.custom && !b.custom) {
                    return -1;
                  } else if(!a.custom && b.custom) {
                    return 1;
                  } else {
                    return a.kink_name.localeCompare(b.kink_name);
                  }
                }).map((kink, index) => (
                  <div key={index} className="text-gray-300 text-xs p-1 bg-gray-700 rounded">
                    <div className="font-medium">{kink.kink_name}</div>
                    {kink.custom && (
                      <div className="text-yellow-400 text-xs">(Custom)</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderImagesTab = () => {
    if (!profileData) return null;

    // Use the new structured images array
    const images = profileData.images || [];

    if (images.length === 0) {
      return (
        <div className="text-gray-500 italic text-sm">
          No images available
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {images.map((image, index) => (
          <div key={index} className="border border-gray-700 rounded-lg overflow-hidden">
            <img
              src={`https://static.f-list.net/images/charimage/${image.image_id}.${image.image_ext}`}
              alt={image.image_description || `Profile image ${index + 1}`}
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
            {image.image_description && (
              <div className="p-2 bg-gray-700 text-xs text-gray-300">
                <div className="font-medium">{image.image_description}</div>
              </div>
            )}
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
    
    switch (tab) {
      case 'description':
        return profileData.description ? 1 : 0;
      
      case 'info':
        return Object.keys(profileData.info || {}).length;
      
      case 'kinks':
        return profileData.kinks?.length || 0;
      
      case 'images':
        return profileData.images?.length || 0;
      
      default:
        return 0;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-[90vw] h-[90vh] mx-4 overflow-hidden flex flex-col">
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
        <div className="p-6 overflow-y-auto flex-1">
          {getTabContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 bg-gray-750 border-t border-gray-700">
          <div className="text-gray-400 text-xs">
            {profileData ? (
              `Info: ${getTabCount('info')}, Kinks: ${getTabCount('kinks')}`
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