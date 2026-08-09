import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { getStatusMeta } from '../lib/faultStatus.js';

// Icon + label always ship together — status color never carries meaning alone.
export default function StatusBadge({ faultStatus }) {
  const { role, label } = getStatusMeta(faultStatus);
  const isGood = role === 'good';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        isGood
          ? 'bg-good/10 text-good ring-good/20'
          : 'bg-critical/10 text-critical ring-critical/20'
      }`}
    >
      {isGood ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}
