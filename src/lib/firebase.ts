import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyAagXYc1JP-sGJj1C_os2AU8HRhD5o5hJc",
    authDomain: "minube-vibes.firebaseapp.com",
    projectId: "minube-vibes",
    storageBucket: "minube-vibes.firebasestorage.app",
    messagingSenderId: "984999907406",
    appId: "1:984999907406:web:92891151994d32ed6f331f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
