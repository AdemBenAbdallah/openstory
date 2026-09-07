import { Button } from '@/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/empty';
import { Link } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';

export const DefaultNotFound: React.FC = () => {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          The page you're looking for doesn't exist or you don't have access to
          it.
        </EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" size="sm" asChild>
        <Link to="/">Go home</Link>
      </Button>
    </Empty>
  );
};
