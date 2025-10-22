// Firebase import
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ✅ Replace with your own Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDpuDVZXdT6CZ6MlgRAd8bbVYtuIVevzlI",
  authDomain: "zaroqt101.firebaseapp.com",
  databaseURL: "https://your-database-url.firebaseio.com",
  projectId: "zaroqt101",
  storageBucket: "zaroqt101.firebasestorage.app",
  messagingSenderId: "141083314351",
  appId: "1:141083314351:web:e7f7ce068c0c2c34a7ec5a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const postsRef = ref(db, "posts/");

const feedContainer = document.getElementById("feedContainer");

// Fetch posts live
onValue(postsRef, (snapshot) => {
  const data = snapshot.val();
  feedContainer.innerHTML = "";

  if (!data) {
    feedContainer.innerHTML = "<p class='loading'>No posts yet...</p>";
    return;
  }

  const posts = Object.values(data).reverse();

  posts.forEach((p) => {
    const postDiv = document.createElement("div");
    postDiv.classList.add("post");
    postDiv.innerHTML = `
      <div class="author">${p.author || "Admin"}</div>
      <div class="text">${p.text || ""}</div>
    `;
    feedContainer.appendChild(postDiv);
  });
});
