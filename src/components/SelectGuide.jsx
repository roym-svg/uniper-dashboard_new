import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, UserRound, ChevronRight, Boxes, UserPlus, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import CreateUserModal from './CreateUserModal.jsx';

// This screen is only ever rendered for admins now — technicians are routed
// straight to their own Dashboard by App.jsx and never see the full
// technician list, so no role prop/check is needed here.
export default function SelectGuide({ boxes }) {
  const [query, setQuery] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);

  const guides = useMemo(() => {
    const counts = new Map();
    boxes.forEach((box) => {
      const name = (box.guideName || '').trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [boxes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter((g) => g.name.toLowerCase().includes(q));
  }, [guides, query]);

  function selectGuide(name) {
    const url = new URL(window.location.href);
    url.searchParams.set('guide', name);
    window.location.href = url.toString();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-50 px-6 py-16"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
        <button
          onClick={() => setShowCreateUser(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-blue-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          משתמש חדש
        </button>
        <button
          onClick={() => signOut(auth)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-500 shadow-soft transition hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          התנתקות
        </button>
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <Boxes className="h-7 w-7 text-brand" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Uniper Inventory</h1>
        <p className="mt-2 text-slate-500">Select your name to view your set-top boxes.</p>

        <div className="relative mx-auto mt-8 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search technician name…"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2"
          />
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((g, i) => (
          <motion.button
            key={g.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            onClick={() => selectGuide(g.name)}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
              <UserRound className="h-5 w-5 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{g.name}</p>
              <p className="text-xs text-slate-500">
                {g.count} {g.count === 1 ? 'box' : 'boxes'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand" />
          </motion.button>
        ))}

        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-sm text-slate-400">No technicians match "{query}".</p>
        )}
      </div>

      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} />}
    </motion.div>
  );
}
