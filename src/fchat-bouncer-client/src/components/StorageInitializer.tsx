'use client';

import { useEffect } from 'react';
import { migrateExistingProfileData, cleanupOldStorageEntries } from '@/lib/storageMigration';

export default function StorageInitializer() {
  useEffect(() => {
    // Run migration and cleanup on app start
    migrateExistingProfileData();
    cleanupOldStorageEntries();
  }, []);

  // This component doesn't render anything
  return null;
}
