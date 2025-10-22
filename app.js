// Telegram WebApp API
const tg = window.Telegram.WebApp;
tg.expand();

// Dummy feed data
let posts = [
  { id: 1, text: "🌅 Good morning Zebec world!", likes: 3, author: "Zaro" },
  { id: 2, text: "🔥 Working on new mini app features!", likes: 5, author: "DevTeam" }
];

// Load feed
function loadFeed(order = "newest") {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  let sorted = [...posts];
  if (order === "oldest") sorted.reverse();

  sorted.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <p>${p.text}</p>
      <div class="meta">
        <span>@${p.author}</span>
        <button onclick="likePost(${p.id})">❤️ ${p.likes}</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function likePost(id) {
  const post = posts.find(p => p.id === id);
  post.likes++;
  loadFeed();
}

// Tab events
document.getElementById("newest").onclick = e => {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  e.target.classList.add("active");
  loadFeed("newest");
};
document.getElementById("oldest").onclick = e => {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  e.target.classList.add("active");
  loadFeed("oldest");
};

// Footer events
document.getElementById("home").onclick = () => {
  tg.showAlert("Home Feed Active");
};
document.getElementById("add").onclick = () => {
  tg.showPopup({
    title: "Create Post",
    message: "Enter new post text below",
    buttons: [{ id: "ok", type: "default", text: "OK" }, { type: "cancel" }]
  });
};
document.getElementById("profile").onclick = () => {
  const user = tg.initDataUnsafe.user;
  tg.showAlert(`👤 Username: ${user?.username || "Guest"}`);
};

// Load default feed
loadFeed();
