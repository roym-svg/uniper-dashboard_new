import { motion } from 'framer-motion';
import { AlertOctagon, RotateCw } from 'lucide-react';

export default function ErrorState({ message, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center"
    >
      <div className="rounded-full bg-critical/10 p-3">
        <AlertOctagon className="h-8 w-8 text-critical" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Couldn't load inventory</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </motion.div>
  );
}
