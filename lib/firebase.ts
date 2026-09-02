// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/**
 * Anonymous auth. Flag Wars stores who owns which territory, so the database
 * rules have to be able to check that a write really comes from the player it
 * claims to - a localStorage id anyone can edit is not enough for that.
 * Requires Authentication > Sign-in method > Anonymous to be enabled in the
 * Firebase console; every other mode keeps working without it.
 */
export const auth = getAuth(app);

/**
 * Reports the anonymous session this browser already has, or null - without
 * creating one. Flag Wars calls this on load so a returning player sees their
 * empire straight away, while a first-time visitor still gets no account until
 * they actually attack something.
 */
export function observeSession(onChange: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, onChange);
}

let signInPromise: Promise<User> | null = null;

export function ensureSignedIn(): Promise<User> {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (!signInPromise) {
        signInPromise = new Promise<User>((resolve, reject) => {
            const stop = onAuthStateChanged(auth, (user) => {
                if (!user) return;
                stop();
                resolve(user);
            });
            signInAnonymously(auth).catch((error) => {
                stop();
                signInPromise = null;
                reject(error);
            });
        });
    }
    return signInPromise;
}
