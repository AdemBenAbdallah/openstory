import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { Star, Users } from 'lucide-react';
import type React from 'react';

type FilterValue = 'all' | 'favorites';

type TalentLibraryFiltersProps = {
  currentFilter: FilterValue;
};

export const TalentLibraryFilters: React.FC<TalentLibraryFiltersProps> = ({
  currentFilter,
}) => {
  const navigate = useNavigate();

  const filters: {
    value: FilterValue;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'all',
      label: 'All Talent',
      icon: <Users className="h-4 w-4" />,
    },
    {
      value: 'favorites',
      label: 'Favorites',
      icon: <Star className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex items-center gap-2 mb-6">
      {filters.map((filter) => (
        <Button
          key={filter.value}
          variant={currentFilter === filter.value ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() =>
            void navigate({
              to: '/talent',
              search: { filter: filter.value },
            })
          }
        >
          {filter.icon}
          {filter.label}
        </Button>
      ))}
    </div>
  );
};
