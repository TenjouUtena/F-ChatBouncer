/**
 * Migration utility to move character data from localStorage to IndexedDB
 */

import { characterIndexedDBService } from './characterIndexedDB';

export interface LegacyCharacterConnection {
  characterName: string;
  isConnected: boolean;
  isActive: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: string;
  connectedAt: string;
  fchatUsername?: string;
}

export interface LegacyLightweightCharacterData {
  character: string;
  gender: string;
  species: string;
  lastSeen: number;
}

export class CharacterMigration {
  private static readonly CHARACTER_STORAGE_KEY = 'character-store';
  private static readonly LIGHTWEIGHT_STORAGE_KEY = 'character-gender-cache';

  /**
   * Check if there are legacy character connections in localStorage that need migration
   */
  static async hasLegacyCharacterConnections(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      
      const legacyData = localStorage.getItem(this.CHARACTER_STORAGE_KEY);
      if (!legacyData) return false;
      
      const parsed = JSON.parse(legacyData);
      return parsed.state?.connections && Array.isArray(parsed.state.connections) && parsed.state.connections.length > 0;
    } catch (error) {
      console.error('Error checking for legacy character connections:', error);
      return false;
    }
  }

  /**
   * Check if there are legacy lightweight characters in localStorage that need migration
   */
  static async hasLegacyLightweightCharacters(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      
      const legacyData = localStorage.getItem(this.LIGHTWEIGHT_STORAGE_KEY);
      if (!legacyData) return false;
      
      const parsed = JSON.parse(legacyData);
      return parsed.state?.characters && Object.keys(parsed.state.characters).length > 0;
    } catch (error) {
      console.error('Error checking for legacy lightweight characters:', error);
      return false;
    }
  }

  /**
   * Migrate character connections from localStorage to IndexedDB
   */
  static async migrateCharacterConnections(): Promise<{ migrated: number; errors: number }> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Migration can only run in browser environment');
      }

      // Initialize IndexedDB
      await characterIndexedDBService.initialize();

      // Get legacy data from localStorage
      const legacyData = localStorage.getItem(this.CHARACTER_STORAGE_KEY);
      if (!legacyData) {
        console.log('No legacy character connection data found to migrate');
        return { migrated: 0, errors: 0 };
      }

      const parsed = JSON.parse(legacyData);
      const legacyConnections = parsed.state?.connections || [];
      
      if (legacyConnections.length === 0) {
        console.log('No legacy character connections found to migrate');
        return { migrated: 0, errors: 0 };
      }

      console.log(`Found ${legacyConnections.length} legacy character connections to migrate`);

      let migrated = 0;
      let errors = 0;

      // Migrate each connection
      for (const connection of legacyConnections) {
        try {
          await characterIndexedDBService.storeConnection(connection as LegacyCharacterConnection);
          migrated++;
          console.log(`Migrated connection for ${connection.characterName}`);
        } catch (error) {
          console.error(`Failed to migrate connection for ${connection.characterName}:`, error);
          errors++;
        }
      }

      // Clean up legacy connections from localStorage
      if (migrated > 0) {
        try {
          const updatedData = { ...parsed };
          delete updatedData.state.connections;
          delete updatedData.state.activeCharacter;
          delete updatedData.state.connectionStatus;
          
          localStorage.setItem(this.CHARACTER_STORAGE_KEY, JSON.stringify(updatedData));
          console.log('Cleaned up legacy character connection data from localStorage');
        } catch (error) {
          console.error('Failed to clean up legacy character connection data:', error);
        }
      }

      console.log(`Character connection migration completed: ${migrated} connections migrated, ${errors} errors`);
      return { migrated, errors };

    } catch (error) {
      console.error('Character connection migration failed:', error);
      throw error;
    }
  }

  /**
   * Migrate lightweight characters from localStorage to IndexedDB
   */
  static async migrateLightweightCharacters(): Promise<{ migrated: number; errors: number }> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Migration can only run in browser environment');
      }

      // Initialize IndexedDB
      await characterIndexedDBService.initialize();

      // Get legacy data from localStorage
      const legacyData = localStorage.getItem(this.LIGHTWEIGHT_STORAGE_KEY);
      if (!legacyData) {
        console.log('No legacy lightweight character data found to migrate');
        return { migrated: 0, errors: 0 };
      }

      const parsed = JSON.parse(legacyData);
      const legacyCharacters = parsed.state?.characters || {};
      
      if (Object.keys(legacyCharacters).length === 0) {
        console.log('No legacy lightweight characters found to migrate');
        return { migrated: 0, errors: 0 };
      }

      console.log(`Found ${Object.keys(legacyCharacters).length} legacy lightweight characters to migrate`);

      let migrated = 0;
      let errors = 0;

      // Migrate each lightweight character
      for (const [characterName, characterData] of Object.entries(legacyCharacters)) {
        try {
          const data = characterData as LegacyLightweightCharacterData;
          await characterIndexedDBService.storeLightweightCharacter({
            character: data.character,
            gender: data.gender,
            species: data.species,
            lastSeen: data.lastSeen
          });
          migrated++;
          console.log(`Migrated lightweight character ${characterName}`);
        } catch (error) {
          console.error(`Failed to migrate lightweight character ${characterName}:`, error);
          errors++;
        }
      }

      // Clean up legacy lightweight characters from localStorage
      if (migrated > 0) {
        try {
          const updatedData = { ...parsed };
          delete updatedData.state.characters;
          
          localStorage.setItem(this.LIGHTWEIGHT_STORAGE_KEY, JSON.stringify(updatedData));
          console.log('Cleaned up legacy lightweight character data from localStorage');
        } catch (error) {
          console.error('Failed to clean up legacy lightweight character data:', error);
        }
      }

      console.log(`Lightweight character migration completed: ${migrated} characters migrated, ${errors} errors`);
      return { migrated, errors };

    } catch (error) {
      console.error('Lightweight character migration failed:', error);
      throw error;
    }
  }

  /**
   * Migrate all character data (connections and lightweight characters)
   */
  static async migrateAllCharacterData(): Promise<{
    connections: { migrated: number; errors: number };
    lightweight: { migrated: number; errors: number };
  }> {
    try {
      console.log('Starting character data migration...');
      
      const connectionsResult = await this.migrateCharacterConnections();
      const lightweightResult = await this.migrateLightweightCharacters();
      
      console.log('Character data migration completed:', {
        connections: connectionsResult,
        lightweight: lightweightResult
      });
      
      return {
        connections: connectionsResult,
        lightweight: lightweightResult
      };
    } catch (error) {
      console.error('Character data migration failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status and statistics
   */
  static async getMigrationStatus(): Promise<{
    hasLegacyConnections: boolean;
    hasLegacyLightweight: boolean;
    indexedDBInfo: { connections: number; lightweight: number; estimatedSize: number };
  }> {
    try {
      const hasLegacyConnections = await this.hasLegacyCharacterConnections();
      const hasLegacyLightweight = await this.hasLegacyLightweightCharacters();
      const indexedDBInfo = await characterIndexedDBService.getStorageInfo();
      
      return {
        hasLegacyConnections,
        hasLegacyLightweight,
        indexedDBInfo
      };
    } catch (error) {
      console.error('Error getting character migration status:', error);
      return {
        hasLegacyConnections: false,
        hasLegacyLightweight: false,
        indexedDBInfo: { connections: 0, lightweight: 0, estimatedSize: 0 }
      };
    }
  }
}

export default CharacterMigration;
