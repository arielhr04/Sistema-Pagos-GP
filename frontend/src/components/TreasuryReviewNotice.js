import { CheckCircle } from 'lucide-react';

const formatReviewDate = (dateString) => {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const TreasuryReviewNotice = ({ reviewedAt }) => {
  if (!reviewedAt) {
    return null;
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm font-semibold">Revisada por tesorería</span>
      </div>
      <p className="mt-1 pl-6 text-xs text-green-700/80">
        {formatReviewDate(reviewedAt)}
      </p>
    </div>
  );
};

export default TreasuryReviewNotice;