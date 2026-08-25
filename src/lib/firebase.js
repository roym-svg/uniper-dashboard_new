import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase project: inventory-system-aea81
// This apiKey is not a secret in the traditional sense — Firebase web app
// keys are meant to ship in client-side code; access is actually controlled
// by Firebase Auth + your Firebase project's security rules, not by hiding
// this value. Still fine to rotate it in the Firebase console if you ever
// want to.
//
// Exported (not just used locally) because createTechnicianAccount() in
// userProfile.js needs it to spin up a SECOND, independent Firebase App
// instance — that's what lets an admin create a new user's Auth account
// without Firebase silently switching the admin's own browser session over
// to the newly created user.
export const firebaseConfig = {
  apiKey: 'AIzaSyBl8A5fG4CEz60LPac_Rt9CPt9ijXXdTEo',
  authDomain: 'inventory-system-aea81.firebaseapp.com',
  projectId: 'inventory-system-aea81',
  storageBucket: 'inventory-system-aea81.firebasestorage.app',
  messagingSenderId: '444175502101',
  appId: '1:444175502101:web:821033a78fbe30cd95f71c',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
