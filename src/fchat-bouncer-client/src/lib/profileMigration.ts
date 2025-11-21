/**
 * Migration utility to move profiles from localStorage to IndexedDB
 */

import { indexedDBService } from './indexeddb';

export interface LegacyProfileData {
  character: string;
  gender: string;
  info?: any;
  [key: string]: any;
}

export class ProfileMigration {
  private static readonly LEGACY_STORAGE_KEY = 'chat-storage';

  /**
   * Check if there are legacy profiles in localStorage that need migration
   */
  static async hasLegacyProfiles(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      
      const legacyData = localStorage.getItem(this.LEGACY_STORAGE_KEY);
      if (!legacyData) return false;
      
      const parsed = JSON.parse(legacyData);
      return parsed.state?.profiles && Object.keys(parsed.state.profiles).length > 0;
    } catch (error) {
      console.debug('Error checking for legacy profiles:', error);
      return false;
    }
  }

  /**
   * Migrate profiles from localStorage to IndexedDB
   */
  static async migrateProfiles(): Promise<{ migrated: number; errors: number }> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Migration can only run in browser environment');
      }

      // Initialize IndexedDB
      await indexedDBService.initialize();

      // Get legacy data from localStorage
      const legacyData = localStorage.getItem(this.LEGACY_STORAGE_KEY);
      if (!legacyData) {
        console.debug('No legacy data found to migrate');
        return { migrated: 0, errors: 0 };
      }

      const parsed = JSON.parse(legacyData);
      const legacyProfiles = parsed.state?.profiles || {};
      
      if (Object.keys(legacyProfiles).length === 0) {
        console.debug('No legacy profiles found to migrate');
        return { migrated: 0, errors: 0 };
      }

      console.debug(`Found ${Object.keys(legacyProfiles).length} legacy profiles to migrate`);

      let migrated = 0;
      let errors = 0;

      // Migrate each profile
      for (const [characterName, profileData] of Object.entries(legacyProfiles)) {
        try {
          await indexedDBService.storeProfile(characterName, profileData as LegacyProfileData, 'FULL');
          migrated++;
          console.debug(`Migrated profile for ${characterName}`);
        } catch (error) {
          console.debug(`Failed to migrate profile for ${characterName}:`, error);
          errors++;
        }
      }

      // Clean up legacy profiles from localStorage
      if (migrated > 0) {
        try {
          const updatedData = { ...parsed };
          delete updatedData.state.profiles;
          delete updatedData.state.profileRequestStatus;
          delete updatedData.state.profileLastRequested;
          
          localStorage.setItem(this.LEGACY_STORAGE_KEY, JSON.stringify(updatedData));
          console.debug('Cleaned up legacy profile data from localStorage');
        } catch (error) {
          console.debug('Failed to clean up legacy data:', error);
        }
      }

      console.debug(`Migration completed: ${migrated} profiles migrated, ${errors} errors`);
      return { migrated, errors };

    } catch (error) {
      console.debug('Profile migration failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status and statistics
   */
  static async getMigrationStatus(): Promise<{
    hasLegacy: boolean;
    indexedDBCount: number;
    indexedDBSize: number;
  }> {
    try {
      const hasLegacy = await this.hasLegacyProfiles();
      const indexedDBInfo = await indexedDBService.getStorageInfo();
      
      return {
        hasLegacy,
        indexedDBCount: indexedDBInfo.count,
        indexedDBSize: indexedDBInfo.estimatedSize
      };
    } catch (error) {
      console.debug('Error getting migration status:', error);
      return {
        hasLegacy: false,
        indexedDBCount: 0,
        indexedDBSize: 0
      };
    }
  }
}

export default ProfileMigration;
