import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFuc0OrQlN2zvKJAKwDOXrMjR1JI8ndfY",
  authDomain: "lecture-summarizer-a88d2.firebaseapp.com",
  projectId: "lecture-summarizer-a88d2",
  storageBucket: "lecture-summarizer-a88d2.firebasestorage.app",
  messagingSenderId: "666947587243",
  appId: "1:666947587243:web:e68c00334c28e3a98dbbee",
  measurementId: "G-6FJN43TCHW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

