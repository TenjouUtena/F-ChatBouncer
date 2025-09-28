import { ProfileData } from '@/types';
import { useLightweightCharacterStore } from '@/stores/lightweightCharacterStore';

/**
 * Migrates existing profile data to the new dual storage system
 * This should be called once when the app starts to migrate existing localStorage data
 */
export function migrateExistingProfileData(): void {
  try {
    if (typeof window === 'undefined') return;
    
    console.log('Starting profile data migration...');
    
    // Check if migration has already been done
    const migrationKey = 'fchat-bouncer-migration-completed';
    if (localStorage.getItem(migrationKey)) {
      console.log('Profile data migration already completed');
      return;
    }
    
    // Get existing chat-storage data
    const existingData = localStorage.getItem('chat-storage');
    if (!existingData) {
      console.log('No existing profile data to migrate');
      localStorage.setItem(migrationKey, 'true');
      return;
    }
    
    let parsedData: any;
    try {
      parsedData = JSON.parse(existingData);
    } catch (error) {
      console.error('Failed to parse existing chat-storage data:', error);
      localStorage.setItem(migrationKey, 'true');
      return;
    }
    
    const existingProfiles = parsedData.state?.profiles || {};
    const lightweightStore = useLightweightCharacterStore.getState();
    
    let migratedCount = 0;
    
    // Migrate each existing profile to lightweight storage
    Object.entries(existingProfiles).forEach(([characterName, profileData]: [string, any]) => {
      try {
        if (profileData && typeof profileData === 'object' && profileData.gender) {
          const species = profileData.info?.species || profileData.info?.Species || 'Unknown';
          lightweightStore.addCharacter(characterName, profileData.gender, species);
          migratedCount++;
        }
      } catch (error) {
        console.warn(`Failed to migrate profile for ${characterName}:`, error);
      }
    });
    
    console.log(`Profile data migration completed. Migrated ${migratedCount} characters to lightweight storage.`);
    
    // Mark migration as completed
    localStorage.setItem(migrationKey, 'true');
    
  } catch (error) {
    console.error('Error during profile data migration:', error);
    // Still mark as completed to prevent retry loops
    localStorage.setItem('fchat-bouncer-migration-completed', 'true');
  }
}

/**
 * Cleans up old storage entries that are no longer needed
 */
export function cleanupOldStorageEntries(): void {
  try {
    if (typeof window === 'undefined') return;
    
    console.log('Cleaning up old storage entries...');
    
    // List of keys that might be old or unnecessary
    const keysToCheck = [
      'chat-storage-backup',
      'fchat-bouncer-old-profiles',
      'character-profiles-old'
    ];
    
    let cleanedCount = 0;
    keysToCheck.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        cleanedCount++;
        console.log(`Removed old storage key: ${key}`);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old storage entries`);
    } else {
      console.log('No old storage entries found to clean up');
    }
    
  } catch (error) {
    console.error('Error during storage cleanup:', error);
  }
}

/**
 * Gets storage statistics for both lightweight and full profile storage
 */
export function getStorageStatistics(): {
  lightweightCharacters: number;
  fullProfiles: number;
  lightweightSize: number;
  fullProfileSize: number;
  totalSize: number;
} {
  try {
    if (typeof window === 'undefined') {
      return {
        lightweightCharacters: 0,
        fullProfiles: 0,
        lightweightSize: 0,
        fullProfileSize: 0,
        totalSize: 0
      };
    }
    
    const lightweightStore = useLightweightCharacterStore.getState();
    const lightweightCharacters = Object.keys(lightweightStore.characters).length;
    const lightweightSize = lightweightStore.getStorageSize();
    
    // Get full profile data size
    const chatStorageData = localStorage.getItem('chat-storage');
    let fullProfiles = 0;
    let fullProfileSize = 0;
    
    if (chatStorageData) {
      try {
        const parsed = JSON.parse(chatStorageData);
        const profiles = parsed.state?.profiles || {};
        fullProfiles = Object.keys(profiles).length;
        fullProfileSize = new Blob([JSON.stringify(profiles)]).size;
      } catch (error) {
        console.warn('Failed to parse chat-storage for size calculation:', error);
      }
    }
    
    const totalSize = lightweightSize + fullProfileSize;
    
    return {
      lightweightCharacters,
      fullProfiles,
      lightweightSize,
      fullProfileSize,
      totalSize
    };
    
  } catch (error) {
    console.error('Error getting storage statistics:', error);
    return {
      lightweightCharacters: 0,
      fullProfiles: 0,
      lightweightSize: 0,
      fullProfileSize: 0,
      totalSize: 0
    };
  }
}
