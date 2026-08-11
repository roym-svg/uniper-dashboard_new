import React from 'react';

export default function StatusBadge({ status }) {
  const statusStr = String(status || '');
  
  // זיהוי ערכות מאיסוף או תקולות
  const isCollected = statusStr.includes('איסוף') || statusStr.includes('ניתוק') || statusStr.toLowerCase().includes('collected');
  const isFaulty = statusStr.includes('תקול');

  if (isCollected || isFaulty) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        {statusStr || 'נאסף מניתוק (אצל המדריך)'}
      </span>
    );
  }

  // ברירת מחדל: תקין ואצל המדריך
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      {statusStr || 'אצל המדריך'}
    </span>
  );
}