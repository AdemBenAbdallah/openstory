import { Badge } from '@/ui/badge';
import { Skeleton } from '@/ui/skeleton';
import { getAnalysisModelById } from '@/models/models.config';

export const ModelBadge = ({ model }: { model?: string }) => {
  if (!model) {
    return <Skeleton className="w-[100px] h-[20px]" />;
  }

  return (
    <Badge
      variant={
        (getAnalysisModelById(model)?.qualityRank ?? 99) <= 4
          ? 'default'
          : 'secondary'
      }
      className="text-xs"
    >
      {getAnalysisModelById(model)?.name || model}
    </Badge>
  );
};
