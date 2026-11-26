import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search songs, artists, or albums',
}) => {
  return (
    <div className="relative flex items-center">
      <Search
        className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3.5 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-2xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-500 border border-transparent focus:border-[var(--accent)] focus:outline-none transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
