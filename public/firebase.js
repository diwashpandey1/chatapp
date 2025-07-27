// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDlmg7Pzw7mEGB5H-p5lvIIxSoHjs17xLA",
  authDomain: "theappthatchat.firebaseapp.com",
  projectId: "theappthatchat",
  storageBucket: "theappthatchat.firebasestorage.app",
  messagingSenderId: "712137459184",
  appId: "1:712137459184:web:839a09d228855176eb4935",
  measurementId: "G-6MFKS8GRWT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);