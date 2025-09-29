// DEPRECATED: This file is no longer used. All character state management has been moved to useCharacterIndexedDBStore.
// This file is kept for backward compatibility but should not be imported in new code.
// 
// To migrate existing code:
// 1. Replace `import { useCharacterStore } from '@/stores/characterStore'` 
//    with `import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore'`
// 2. Replace `useCharacterStore` with `useCharacterIndexedDBStore`
// 3. The API is identical, so no other changes are needed

export { useCharacterIndexedDBStore as useCharacterStore } from './characterIndexedDBStore';
export type { CharacterConnection } from './characterIndexedDBStore';
