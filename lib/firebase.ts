// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import {
    GoogleAuthProvider, connectAuthEmulator, deleteUser, getAuth, linkWithPopup, onAuthStateChanged, reauthenticateWithPopup,
    signInAnonymously, signInWithCredential, signInWithPopup, signOut, type User,
} from "firebase/auth";

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

/**
 * App Check: the database only answers requests that come from this site, not
 * from a script replaying the public config. Off until a reCAPTCHA v3 site key
 * is set, and even then nothing is refused until enforcement is switched on in
 * the console - run it unenforced first and watch how many real requests
 * would fail. In dev it uses a debug token, printed to the console on the
 * first load, which has to be registered in the console before enforcement.
 */
const appCheckKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
if (appCheckKey) {
    if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckKey), isTokenAutoRefreshEnabled: true });
}

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
 * `VITE_FIREBASE_EMULATORS=1` points the app at the local emulators (`npm run
 * emulators`) instead of the live project, so signing in, the cloud save and
 * the rules can be tried without touching real players' data. The auth
 * emulator stands in for Google with a page of made-up accounts.
 */
if (import.meta.env.VITE_FIREBASE_EMULATORS === "1") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
}

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

// A promise from before a sign-out would hand back the account that just left.
onAuthStateChanged(auth, (user) => {
    if (!user) signInPromise = null;
});

/**
 * The session this browser has, or a new anonymous one. Waits for the stored
 * session to load first: `signInAnonymously` replaces any signed-in user that
 * is not anonymous, so asking before the Google session was restored would
 * silently sign a Google player out on any page that signs in on mount.
 */
export function ensureSignedIn(): Promise<User> {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (!signInPromise) {
        signInPromise = auth.authStateReady()
            .then(() => auth.currentUser ?? signInAnonymously(auth).then((credential) => credential.user))
            .catch((error) => {
                signInPromise = null;
                throw error;
            });
    }
    return signInPromise;
}

/** A Google account, as opposed to the silent anonymous one the multiplayer modes use. */
export function isGoogleUser(user: User | null): user is User {
    return !!user && !user.isAnonymous && user.providerData.some((p) => p.providerId === "google.com");
}

function googleProvider() {
    const provider = new GoogleAuthProvider();
    // Without this a browser with one Google session signs straight into it, and a shared computer picks the wrong person.
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
}

/**
 * Signs in with Google. An anonymous session is upgraded in place, so the uid
 * - and with it every World Conqueror territory - stays the same. If that
 * Google account already has a uid of its own (it was used on another device),
 * the browser switches to it; the anonymous account's land stays where it is.
 * Only the basic profile is requested: the app never sees mail or Drive.
 */
export async function signInWithGoogle(): Promise<User> {
    await auth.authStateReady();
    const provider = googleProvider();
    const current = auth.currentUser;
    let user: User;
    if (current?.isAnonymous) {
        try {
            user = (await linkWithPopup(current, provider)).user;
        } catch (error) {
            const credential = (error as { code?: string }).code === "auth/credential-already-in-use"
                ? GoogleAuthProvider.credentialFromError(error as never)
                : null;
            if (!credential) throw error;
            user = (await signInWithCredential(auth, credential)).user;
        }
    } else {
        user = (await signInWithPopup(auth, provider)).user;
    }
    // A freshly linked account still carries the anonymous token; the database rules read the new one.
    await user.getIdToken(true);
    return user;
}

export function signOutUser(): Promise<void> {
    return signOut(auth);
}

/** Asks Google to confirm who this is. Deleting an account needs a sign-in from the last few minutes. */
export async function reauthenticate(user: User): Promise<void> {
    await reauthenticateWithPopup(user, googleProvider());
}

/** Deletes the account from Firebase Auth - the uid, the email, the link to Google. */
export function deleteAccount(user: User): Promise<void> {
    return deleteUser(user);
}
