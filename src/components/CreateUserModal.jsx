import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Mail, Lock, User, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { createTechnicianAccount } from '../lib/userProfile.js';

const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'כתובת האימייל הזו כבר רשומה במערכת',
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/weak-password': 'הסיסמה חלשה מדי (נדרשים לפחות 6 תווים)',
  'auth/network-request-failed': 'בעיית תקשורת עם השרת. בדוק את החיבור לאינטרנט ונסה שוב',
  'missing-fields': 'יש למלא את כל השדות',
};
const DEFAULT_ERROR_MESSAGE = 'אירעה שגיאה ביצירת המשתמש. נסה שוב';

export default function CreateUserModal({ onClose, onCreated, initialFullName = '' }) {
  const [fullName, setFullName] = useState(initialFullName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('technician');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const created = await createTechnicianAccount({ email, password, fullName, role });
      setSuccess(
        created.linkedExisting
          ? `המשתמש "${created.displayName}" כבר היה קיים — הקישור לפרופיל עודכן בהצלחה`
          : `המשתמש "${created.displayName}" נוצר בהצלחה`
      );
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('technician');
      onCreated?.(created);
    } catch (err) {
      setError(ERROR_MESSAGES[err?.code] || ERROR_MESSAGES[err?.message] || DEFAULT_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                <UserPlus className="h-4.5 w-4.5 text-brand" />
              </div>
              <h2 className="text-base font-bold text-slate-900">משתמש חדש</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="סגור"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
            <div>
              <label htmlFor="new-user-fullname" className="mb-1 block text-xs font-medium text-slate-500">
                שם מלא (לצורך התאמה לגיליון)
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-user-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="לדוגמה: דוד דסטה"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-user-email" className="mb-1 block text-xs font-medium text-slate-500">
                אימייל
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="off"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-user-password" className="mb-1 block text-xs font-medium text-slate-500">
                סיסמה זמנית
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  autoComplete="new-password"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-user-role" className="mb-1 block text-xs font-medium text-slate-500">
                תפקיד
              </label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="new-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={submitting}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
                >
                  <option value="technician">טכנאי</option>
                  <option value="admin">מנהל</option>
                </select>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg bg-good/10 px-3 py-2 text-sm font-medium text-good"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </motion.div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                סגירה
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'יוצר…' : 'יצירת משתמש'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
