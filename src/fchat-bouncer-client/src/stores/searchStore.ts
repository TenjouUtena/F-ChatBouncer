import { create } from 'zustand';
import { SearchState, SearchResult, SearchRequest } from '@/types';

interface SearchStore extends SearchState {
  setResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setOpen: (open: boolean) => void;
  setSearchCriteria: (criteria: SearchRequest) => void;
  clearResults: () => void;
  addResult: (result: SearchResult) => void;
  removeResult: (characterName: string) => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  // Initial state
  results: [],
  isLoading: false,
  isOpen: false,
  searchCriteria: {},

  // Actions
  setResults: (results: SearchResult[]) => {
    set({ results });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setOpen: (open: boolean) => {
    set({ isOpen: open });
  },

  setSearchCriteria: (criteria: SearchRequest) => {
    set({ searchCriteria: criteria });
  },

  clearResults: () => {
    set({ results: [] });
  },

  addResult: (result: SearchResult) => {
    set((state) => ({
      results: [...state.results, result]
    }));
  },

  removeResult: (characterName: string) => {
    set((state) => ({
      results: state.results.filter(result => result.characterName !== characterName)
    }));
  },
}));
