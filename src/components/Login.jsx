import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, AlertCircle, Boxes } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase.js';

// Firebase auth error codes -> Hebrew messages. Falls back to a generic
// "wrong credentials" message for anything not listed here, so we never
// leak raw Firebase error text (or which part was wrong) to the UI.
const ERROR_MESSAGES = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/user-not-found': 'שם משתמש או סיסמה שגויים, נסה שוב',
  'auth/wrong-password': 'שם משתמש או סיסמה שגויים, נסה שוב',
  'auth/invalid-credential': 'שם משתמש או סיסמה שגויים, נסה שוב',
  'auth/user-disabled': 'המשתמש הזה חסום. פנה למנהל המערכת',
  'auth/too-many-requests': 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות',
  'auth/network-request-failed': 'בעיית תקשורת עם השרת. בדוק את החיבור לאינטרנט ונסה שוב',
};
const DEFAULT_ERROR_MESSAGE = 'שם משתמש או סיסמה שגויים, נסה שוב';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // No further action needed here: App's onAuthStateChanged listener
      // picks up the new Firebase session and swaps this screen out on its own.
    } catch (err) {
      setError(ERROR_MESSAGES[err?.code] || DEFAULT_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-soft"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <Boxes className="h-7 w-7 text-brand" />
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">Uniper Inventory</h1>
        <p className="mt-1 text-center text-sm text-slate-500">התחברות למערכת</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="login-email" className="mb-1 block text-xs font-medium text-slate-500">
              אימייל
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="אימייל"
                autoComplete="username"
                disabled={submitting}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-slate-500">
              סיסמה
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="סיסמה"
                autoComplete="current-password"
                disabled={submitting}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none ring-brand/30 transition focus:ring-2 disabled:opacity-60"
              />
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

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'מתחבר…' : 'התחברות'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
