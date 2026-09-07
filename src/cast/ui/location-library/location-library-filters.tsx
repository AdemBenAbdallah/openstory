import { Input } from '@/components/ui/input';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';

type LocationLibraryFiltersProps = {
  currentSearch?: string;
};

export const LocationLibraryFilters: React.FC<LocationLibraryFiltersProps> = ({
  currentSearch,
}) => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(currentSearch ?? '');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== (currentSearch ?? '')) {
        void navigate({
          to: '/locations',
          search: {
            search: searchValue || undefined,
          },
          replace: true,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, currentSearch, navigate]);

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search locations…"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
};
