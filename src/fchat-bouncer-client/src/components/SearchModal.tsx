'use client';

import React, { useState, useEffect } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useAuthStore } from '@/stores/authStore';
import { SearchResult, SearchRequest } from '@/types';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Character, { CharacterData } from './Character';
import { signalRService } from '@/lib/signalr';
import { api } from '@/lib/api';
import kinksData from '@/kinks';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPM?: (characterName: string) => void;
}

interface KinkData {
  fetish_id: string;
  name: string;
}

interface SearchFieldsData {
  kinks: Record<string, KinkData>;
  genders: string[];
  orientations: string[];
  languages: string[];
  roles: string[];
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onOpenPM }) => {
  const { token } = useAuthStore();
  const { 
    results, 
    isLoading, 
    searchCriteria, 
    setResults, 
    setLoading, 
    setSearchCriteria, 
    clearResults 
  } = useSearchStore();

  const [searchFields, setSearchFields] = useState<SearchFieldsData | null>(null);
  const [localCriteria, setLocalCriteria] = useState<SearchRequest>({
    kinks: [],
    genders: [],
    orientations: [],
    languages: [],
    roles: []
  });

  // Load search fields data from local kinks.json
  useEffect(() => {
    if (isOpen && !searchFields) {
      // Convert the kinks array to a record for easier lookup
      const kinksRecord: Record<string, KinkData> = {};
      (kinksData as any).kinks.forEach((kink: KinkData) => {
        kinksRecord[kink.fetish_id] = kink;
      });

      setSearchFields({
        kinks: kinksRecord,
        genders: (kinksData as any).genders,
        orientations: (kinksData as any).orientations,
        languages: (kinksData as any).languages,
        roles: (kinksData as any).roles
      });
    }
  }, [isOpen, searchFields]);

  // Handle search submission
  const handleSearch = async () => {
    if (isLoading || !token) return;

    setLoading(true);
    clearResults();

    try {
      await api.searchCharacters(token, localCriteria);
      setSearchCriteria(localCriteria);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle SignalR search results
  useEffect(() => {
    const handleSearchResults = (data: { Results: SearchResult[] }) => {
      setResults(data.Results);
      setLoading(false);
    };

    signalRService.setSearchResultsCallback(handleSearchResults);

    return () => {
      // Cleanup is handled by SignalR service
    };
  }, [setResults, setLoading]);

  // Convert SearchResult to CharacterData
  const searchResultToCharacterData = (result: SearchResult): CharacterData => ({
    name: result.characterName,
    status: result.status,
    statusMessage: result.statusMessage,
    gender: result.gender,
    lastSeen: result.lastSeen,
    isOnline: result.isOnline
  });

  const handleArrayChange = (field: keyof SearchRequest, value: string, checked: boolean) => {
    setLocalCriteria(prev => ({
      ...prev,
      [field]: checked 
        ? [...(prev[field] || []), value]
        : (prev[field] || []).filter(item => item !== value)
    }));
  };

  const renderCheckboxGroup = (
    title: string,
    field: keyof SearchRequest,
    options: string[],
    className: string = "grid grid-cols-2 gap-2"
  ) => {
    if (!options || options.length === 0) {
      return null;
    }

    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {title}
        </label>
        <div className={`${className} max-h-32 overflow-y-auto`}>
          {options.map(option => (
            <label key={option} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={(localCriteria[field] || []).includes(option)}
                onChange={(e) => handleArrayChange(field, option, e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <MagnifyingGlassIcon className="h-6 w-6" />
              Character Search
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {!searchFields ? (
            <div className="text-center text-gray-400">
              Loading search options...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Search Criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Genders */}
                {renderCheckboxGroup(
                  "Gender",
                  "genders",
                  searchFields.genders,
                  "grid grid-cols-1 gap-2"
                )}

                {/* Orientations */}
                {renderCheckboxGroup(
                  "Orientation",
                  "orientations",
                  searchFields.orientations,
                  "grid grid-cols-1 gap-2"
                )}

                {/* Languages */}
                {renderCheckboxGroup(
                  "Language",
                  "languages",
                  searchFields.languages,
                  "grid grid-cols-2 gap-2"
                )}

                {/* Roles */}
                {renderCheckboxGroup(
                  "Role",
                  "roles",
                  searchFields.roles,
                  "grid grid-cols-1 gap-2"
                )}

                {/* Kinks */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Kinks
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-600 rounded p-2">
                    {searchFields.kinks && Object.entries(searchFields.kinks).map(([id, kink]) => (
                      <label key={id} className="flex items-center gap-2 text-sm text-gray-300 mb-1">
                        <input
                          type="checkbox"
                          checked={(localCriteria.kinks || []).includes(id)}
                          onChange={(e) => handleArrayChange("kinks", id, e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span>{kink.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Search Button */}
              <div className="flex justify-center">
                <button
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-3 px-8 rounded-lg transition-colors"
                >
                  {isLoading ? 'Searching...' : 'Search Characters'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search Results */}
        {results.length > 0 && (
          <div className="border-t border-gray-700">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-300 mb-4">
                Search Results ({results.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.map((result) => (
                  <div key={result.characterName} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                    <div className="flex-1">
                      <Character
                        character={searchResultToCharacterData(result)}
                        onClick={onOpenPM}
                        showStatusMessage={true}
                        variant="compact"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {!isLoading && results.length === 0 && searchCriteria && Object.keys(searchCriteria).length > 0 && (
          <div className="border-t border-gray-700 p-6 text-center text-gray-400">
            No characters found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchModal;
