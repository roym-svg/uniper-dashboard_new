import { motion } from 'framer-motion';
import { Boxes, CheckCircle2, AlertTriangle } from 'lucide-react';

const CARD_CONFIG = [
  { key: 'total', label: 'סה"כ ממירים', icon: Boxes, accent: 'text-brand', bg: 'bg-brand/10' },
  { key: 'healthy', label: 'אצל המדריך', icon: CheckCircle2, accent: 'text-good', bg: 'bg-good/10' },
  { key: 'faulty', label: 'נאסף מניתוק / תקול', icon: AlertTriangle, accent: 'text-critical', bg: 'bg-critical/10' },
];

export default function StatCards({ total, healthy, faulty }) {
  const values = { total, healthy, faulty };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARD_CONFIG.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.bg}`}>
              <Icon className={`h-6 w-6 ${card.accent}`} />
            </div>
            <div>
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">{values[card.key] ?? 0}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}