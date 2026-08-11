import React from 'react';

export function StatusBadge({ status }) {
  // קביעת צבע הרקע והטקסט לפי התוכן בעברית
  let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200'; // ירוק - ברירת מחדל (אצל המדריך)

  if (status && status.includes('נאסף מניתוק')) {
    badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200'; // כתום/צהוב
  } else if (status && status.includes('בדרך')) {
    badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200'; // כחול
  } else if (status && (status.includes('מחסן') || status.includes('משרד'))) {
    badgeStyle = 'bg-purple-50 text-purple-700 border-purple-200'; // סגול
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeStyle}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {status || 'אצל המדריך'}
    </span>
  );
}

export default StatusBadge;