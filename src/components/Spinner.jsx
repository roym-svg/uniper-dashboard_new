import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function Spinner({ label = 'Loading inventory…' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50"
    >
      <Loader2 className="h-10 w-10 animate-spin text-brand" />
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </motion.div>
  );
}
