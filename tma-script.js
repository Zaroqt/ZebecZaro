// *****************************************************************
// ZZ Feed - Telegram Mini App Script (FINAL FULL FIX: Clickability Lock Removed)
// *****************************************************************

// ********** SET YOUR ADMIN CHAT ID(s) HERE **********
const ADMIN_CHAT_IDS = [ 
    1924452453, // Replace with your actual ID
    6440295843, 
    6513916873, 
    // Add additional Admin IDs here:
]; 
// *************************************************

// --- Global Variables & Constants ---
const POSTS_COLLECTION = 'tma_zzfeed_posts'; 
const LIKES_COLLECTION = 'tma_zzfeed_likes'; 
const TEMP_MUSIC_KEY = 'tma_temp_music_url_v5';
const INITIAL_DEFAULT_URL = 'https://archive.org/download/lofi-chill-1-20/lofi_chill_03_-_sleepwalker.mp3'; 

let audioPlayer;
let musicStatusSpan;
let volumeToggleIcon;
let currentUserId = 0; 
let currentUserName = 'Guest';
let currentUserUsername = 'anonymous'; 
let is_admin = false; 
let currentPostFilter = 'new-posts'; 
let isMusicMuted = false; 
let tg = null;
let unsubscribeFromPosts = null; 

// ===========================================
//          HELPER FUNCTIONS (unchanged)
// ===========================================
function showToast(message) { 
    const toast = document.getElementById('custom-toast');
    if (!toast) return;
    clearTimeout(toast.timeoutId);
    toast.textContent = message;
    toast.classList.add('show');
    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function isAdminUser(userId) {
    return ADMIN_CHAT_IDS.includes(parseInt(userId));
}

function stringToColor(str) { 
    let hash = 0; for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        const brightened = Math.floor(value * 0.7 + 0x55); 
        color += ('00' + brightened.toString(16)).substr(-2);
    }
    return color;
}

function copyToClipboard(text, successMsg = 'Copied successfully.') { 
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => performLegacyCopy(text));
    } else {
        performLegacyCopy(text);
    }
}

function performLegacyCopy(text) { 
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, 99999); 
    try {
        document.execCommand('copy');
        showToast('Copied successfully (Legacy).');
    } catch (err) {
        showToast('Copy failed, please select and copy manually.');
    }
    document.body.removeChild(tempInput);
}


// ===========================================
//          DATA/STORAGE HANDLERS (unchanged)
// ===========================================

function loadPostsRealtime(userId) { 
    if (!window.db) {
        const container = document.getElementById('posts-container');
        if(container) container.innerHTML = '<p class="initial-loading-text" style="color:var(--tg-theme-destructive-text-color);">❌ Database Not Initialized. Check index.html config.</p>';
        return;
    }
    if (unsubscribeFromPosts) { unsubscribeFromPosts(); }
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = '<p class="initial-loading-text">Connecting to server...</p>';

    let query = window.db.collection(POSTS_COLLECTION);
    const sortField = 'timestamp';
    const sortDirection = currentPostFilter === 'new-posts' ? 'desc' : 'asc';
    query = query.orderBy(sortField, sortDirection);

    unsubscribeFromPosts = query.onSnapshot(async (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        container.innerHTML = ''; 
        
        if (posts.length === 0) {
            container.innerHTML = '<p class="initial-loading-text">No posts found yet. Be the first to post!</p>';
        } else {
            const postElements = await Promise.all(posts.map(post => createPostElement(post, userId)));
            postElements.forEach(el => container.appendChild(el));
        }
        addPostEventListeners(userId); 
    }, error => {
        console.error("Error listening to posts:", error);
        container.innerHTML = '<p class="initial-loading-text" style="color:var(--tg-theme-destructive-text-color);">❌ Failed to load posts from server. Check firewall/rules.</p>';
        showToast("Error connecting to database.");
    });
}

async function toggleLike(e, userId) { 
    if (!window.db) { showToast("Database not ready."); return; }
    const likeButton = e.currentTarget;
    const postId = likeButton.getAttribute('data-post-id');
    const likeDocRef = window.db.collection(LIKES_COLLECTION).doc(`${postId}_${userId}`);
    
    try {
        const doc = await likeDocRef.get();
        let change = 0;
        let isLikedNow = false;

        if (doc.exists) {
            await likeDocRef.delete();
            change = -1;
            isLikedNow = false;
            showToast("Unliked.");
        } else {
            await likeDocRef.set({ postId: postId, userId: userId, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            change = 1;
            isLikedNow = true;
            showToast("Liked!");
        }
        updateLikeCountDisplay(likeButton, change, isLikedNow);
    } catch (error) {
        console.error("Error toggling like:", error);
        showToast("Action failed. Try again.");
    }
}

function updateLikeCountDisplay(likeButton, change, isLikedNow) {
    const currentCountText = likeButton.textContent.replace(/[^0-9]/g, ''); 
    let currentCount = parseInt(currentCountText) || 0;
    const newCount = Math.max(0, currentCount + change);
    likeButton.innerHTML = `<i class="fas fa-heart"></i> ${newCount}`;
    likeButton.classList.toggle('liked', isLikedNow);
}

async function getPostLikeCount(postId) {
    if (!window.db) return 0;
    try {
        const snapshot = await window.db.collection(LIKES_COLLECTION)
                                 .where('postId', '==', postId)
                                 .get();
        return snapshot.size;
    } catch (error) {
        return 0;
    }
}

async function createPostElement(post, userId) { 
    const postId = post.id;
    const postElement = document.createElement('div');
    postElement.className = 'post-card';
    postElement.setAttribute('data-post-id', postId);
    
    let isLiked = false;
    if (window.db) {
        const likeDoc = await window.db.collection(LIKES_COLLECTION).doc(`${postId}_${userId}`).get();
        isLiked = likeDoc.exists;
    }

    const displayLikesCount = await getPostLikeCount(postId);
    const isAdmin = isAdminUser(userId);
    const deleteButton = isAdmin 
        ? `<button class="delete-btn" data-post-id="${postId}"><i class="fas fa-trash"></i> Delete</button>` 
        : '';
    const adminBadge = post.isAdmin ? '<span class="admin-badge">Admin</span>' : '';

    postElement.innerHTML = `
        ${adminBadge}
        <p class="post-content">${post.content}</p>
        <div class="post-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${postId}" aria-label="${isLiked ? 'Unlike' : 'Like'} Post">
                <i class="fas fa-heart"></i> 
                ${displayLikesCount}
            </button>
            ${deleteButton} 
        </div>
    `;
    return postElement;
} 

function performDeletePost(postId, userId) { 
    if (!isAdminUser(userId) || !window.db) {
        showToast("Only Admins can delete posts or database not ready.");
        return;
    }
    const postRef = window.db.collection(POSTS_COLLECTION).doc(postId);
    postRef.delete().then(() => {
        showToast("Post deleted successfully!");
    }).catch(error => {
        console.error("Error removing document: ", error);
        showToast("Deletion failed on server.");
    });
}

function addPostEventListeners(userId) { 
    document.querySelectorAll('.like-btn').forEach(button => {
        button.onclick = (e) => toggleLike(e, userId); 
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.onclick = (e) => {
            const postId = e.currentTarget.getAttribute('data-post-id');
            if (tg && tg.showConfirm) {
                tg.showConfirm('Are you sure you want to delete this post?', (ok) => {
                    if (ok) performDeletePost(postId, userId);
                });
            } else {
                if (window.confirm('Are you sure you want to delete this post?')) {
                    performDeletePost(postId, userId);
                }
            }
        };
    });
}

function setupPostFilters() { 
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.getAttribute('data-filter');
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            
            if (currentPostFilter !== filter) {
                currentPostFilter = filter;
                const contentArea = document.querySelector('.content');
                if (contentArea) contentArea.scrollTop = 0; 
                loadPostsRealtime(currentUserId); 
            }
        });
    });
}


// ===========================================
//          ADMIN POST LOGIC (unchanged)
// ===========================================

function setupAdminPostLogic(isAdmin) { 
    const postAddButton = document.getElementById('post-add-button');
    const submitPostBtn = document.getElementById('submit-post-btn');
    const cancelPostBtn = document.getElementById('cancel-post-btn');
    const postInput = document.getElementById('post-input');

    if (isAdmin) {
        if (postAddButton) postAddButton.style.display = 'flex';
        if (postAddButton) postAddButton.onclick = () => openModal('post-modal');
        if (cancelPostBtn) { 
            cancelPostBtn.onclick = () => {
                postInput.value = ''; 
                closeModal('post-modal');
            };
        }

        if (submitPostBtn && postInput) {
            submitPostBtn.onclick = () => {
                if (!isAdminUser(currentUserId) || !window.db) {
                    showToast("Error: Authorization or Database not ready.");
                    closeModal('post-modal');
                    return;
                }
                
                const content = postInput.value.trim();
                
                if (content.length < 5 || content.length > 500) {
                    showToast("Post must be between 5 and 500 characters.");
                    return;
                }
                
                submitPostBtn.disabled = true;
                submitPostBtn.textContent = 'Posting...';

                const newPost = {
                    authorId: currentUserId,
                    authorName: currentUserName || 'Admin', 
                    isAdmin: true,
                    content: content,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                };
                
                window.db.collection(POSTS_COLLECTION).add(newPost)
                    .then(() => {
                        postInput.value = ''; 
                        const newPostsTab = document.getElementById('new-posts-tab');
                        if (newPostsTab) {
                           newPostsTab.click(); 
                        }
                        
                        closeModal('post-modal'); 
                        showToast("Announcement posted successfully!");
                    })
                    .catch(error => {
                        console.error("Error writing document: ", error);
                        showToast(`Posting failed! Server error: ${error.message}`);
                    })
                    .finally(() => {
                        submitPostBtn.disabled = false;
                        submitPostBtn.textContent = 'Post Now';
                    });
            };
        }// *****************************************************************
// ZZ Feed - Telegram Mini App Script (FINAL FIX: Posting Error Handling)
// *****************************************************************

// ... (Previous code remains the same until setupAdminPostLogic)

// ===========================================
//          ADMIN POST LOGIC (Posting Error Final Fix)
// ===========================================

function setupAdminPostLogic(isAdmin) { 
    const postAddButton = document.getElementById('post-add-button');
    const submitPostBtn = document.getElementById('submit-post-btn');
    const cancelPostBtn = document.getElementById('cancel-post-btn');
    const postInput = document.getElementById('post-input');

    if (isAdmin) {
        if (postAddButton) postAddButton.style.display = 'flex';
        if (postAddButton) postAddButton.onclick = () => openModal('post-modal');
        if (cancelPostBtn) { 
            cancelPostBtn.onclick = () => {
                postInput.value = ''; 
                closeModal('post-modal');
            };
        }

        if (submitPostBtn && postInput) {
            submitPostBtn.onclick = () => {
                // 🚨 CRITICAL CHECK: Database ready ရှိမရှိ စစ်ပါ
                if (!window.db) {
                    showToast("Error: Database not initialized. Check Firebase config in index.html.");
                    closeModal('post-modal');
                    return;
                }
                if (!isAdminUser(currentUserId)) {
                     showToast("Error: Authorization failed. You are not recognized as Admin.");
                     closeModal('post-modal');
                     return;
                }
                
                const content = postInput.value.trim();
                
                if (content.length < 5 || content.length > 500) {
                    showToast("Post must be between 5 and 500 characters.");
                    return;
                }
                
                // Posting state ကို စတင်ပါ
                submitPostBtn.disabled = true;
                submitPostBtn.textContent = 'Posting...';

                const newPost = {
                    authorId: currentUserId,
                    authorName: currentUserName || 'Admin', 
                    isAdmin: true,
                    content: content,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                };
                
                window.db.collection(POSTS_COLLECTION).add(newPost)
                    .then(() => {
                        postInput.value = ''; 
                        
                        // New Post တင်ပြီးရင် Feed ကို New Posts Tab ကို ပြန်ပြောင်းပါ
                        const newPostsTab = document.getElementById('new-posts-tab');
                        if (newPostsTab) {
                           newPostsTab.click(); 
                        }
                        
                        closeModal('post-modal'); 
                        showToast("Announcement posted successfully!");
                    })
                    .catch(error => {
                        // 🚨 ERROR CATCH: Database Error ကို ဖမ်းပြီး User ကို ပြပါ
                        console.error("Error writing document (Check Security Rules): ", error);
                        showToast(`Posting Failed! (Check Console & Security Rules): ${error.message}`);
                    })
                    .finally(() => {
                        // 🚨 FINAL FIX: အခြေအနေမကောင်းရင်တောင် Button ကို ပြန်ဖွင့်ပေးပါ
                        submitPostBtn.disabled = false;
                        submitPostBtn.textContent = 'Post Now';
                    });
            };
        }
    } else {
        if (postAddButton) postAddButton.style.display = 'none';
        if (postAddButton) postAddButton.onclick = null;
    }
}

// ... (The rest of the tma-script.js code remains the same)


// ===========================================
//          MODAL & MUSIC LOGIC (CRITICAL FINAL FIX)
// ===========================================

function openModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // 🚨 CRITICAL FIX: active class ထည့်ပြီး CSS ကနေ visibility/opacity ကို ဖွင့်ပါ
    document.body.style.overflow = 'hidden'; 
    modal.classList.add('active');

    const fab = document.getElementById('post-add-button');
    if (fab) fab.style.display = 'none'; 
    
    // Modal Overlay ကို နှိပ်ပြီး ပိတ်နိုင်စေရန်
    modal.onclick = (e) => {
        // modal-content ကို နှိပ်တာ မဟုတ်ရင် (i.e. overlay ကို နှိပ်ရင်)
        if (e.target === modal) { 
            closeModal(modalId);
        }
    };
}

function closeModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // 🚨 CRITICAL FIX: active class ကို ဖယ်ရှားပြီး CSS transition 0.4s စတင်ပါ
    modal.classList.remove('active');
    
    // 0.4s စောင့်ပြီးမှ pointer-events ကို လုံးဝပြန်ဖွင့်ရန် body scroll logic ကို ထည့်သွင်းထားသည်
    setTimeout(() => {
        // အခြား Modal တစ်ခုခု ပွင့်နေသေးရင် scroll ကို မဖွင့်ပါ
        if (!document.querySelector('.modal-overlay.active')) {
             document.body.style.overflow = '';
        }
       
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen && homeScreen.classList.contains('active') && is_admin) {
            const fab = document.getElementById('post-add-button');
            if (fab) fab.style.display = 'flex'; 
        }
        
        // Overlay Click Listener ကို ရှင်းလင်းပါ
        modal.onclick = null; 
    }, 400); 
}

function updateMusicStatus(isPlaying) { 
    if (!musicStatusSpan || !volumeToggleIcon) return;
    let statusText = isPlaying 
        ? `🎶 Music Playing ${isMusicMuted ? '(Muted)' : ''} 🎶` 
        : 'Music Paused (Tap Icon to Play)';
    musicStatusSpan.textContent = statusText;
    
    if (isPlaying) {
        volumeToggleIcon.className = `fas ${isMusicMuted ? 'fa-volume-off' : 'fa-volume-up'}`;
        volumeToggleIcon.title = isMusicMuted ? "Unmute Music" : "Mute Music";
    } else {
        volumeToggleIcon.className = 'fas fa-volume-off';
        volumeToggleIcon.title = "Start Playing Music";
    }
}

function toggleVolume() { 
    if (!audioPlayer) return;

    if (audioPlayer.paused) {
        audioPlayer.volume = isMusicMuted ? 0 : 1;
        
        const playPromise = audioPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                showToast(isMusicMuted ? "Music started (Muted)." : "Music started playing.");
            }).catch(e => {
                console.error("Failed to play audio on click:", e);
                showToast('Playback Failed. Please tap the volume icon again to allow play.');
                updateMusicStatus(false);
            });
        }
    } else {
        isMusicMuted = !isMusicMuted;
        audioPlayer.volume = isMusicMuted ? 0 : 1;
        showToast(isMusicMuted ? "Music muted." : "Music unmuted.");
        updateMusicStatus(true);
    }
}

function setupMusicPlayer() { 
    audioPlayer = document.getElementById('audio-player');
    musicStatusSpan = document.getElementById('current-music-status');
    volumeToggleIcon = document.getElementById('volume-toggle');
    
    if (!audioPlayer) return;
    let initialUrl = localStorage.getItem(TEMP_MUSIC_KEY) || INITIAL_DEFAULT_URL;
    audioPlayer.src = initialUrl;
    audioPlayer.loop = true;
    audioPlayer.volume = isMusicMuted ? 0 : 1;
    
    if(volumeToggleIcon) volumeToggleIcon.onclick = toggleVolume;
    
    audioPlayer.onplay = () => updateMusicStatus(true);
    audioPlayer.onpause = () => updateMusicStatus(false);
    
    audioPlayer.onerror = (e) => { 
        console.error("Audio error details:", e);
        audioPlayer.pause();
        updateMusicStatus(false);
        showToast("Music Load Error. Playing stopped. Check URL or file."); 
    };
    
    updateMusicStatus(false); 
}

function setMusicUrl(url, sourceName) { 
    if (!url || !audioPlayer) return;
    
    if (!url.match(/^https?:\/\/.+\..+$/) && url !== INITIAL_DEFAULT_URL && !url.startsWith('blob:')) {
        showToast("Invalid URL format. http/https required.");
        return;
    }
    
    localStorage.setItem(TEMP_MUSIC_KEY, url);
    audioPlayer.src = url;
    audioPlayer.load();
    audioPlayer.pause(); 
    
    closeModal('music-modal');
    closeModal('url-input-modal');
    showToast(`${sourceName} set. Tap the Volume Icon to play.`);
}

function addMusicEventListeners() { 
    document.getElementById('music-button').onclick = () => openModal('music-modal');
    document.getElementById('cancel-music-modal-btn').onclick = () => closeModal('music-modal');
    
    document.querySelectorAll('.music-option-list .music-option').forEach(option => {
        option.onclick = (e) => {
            const type = e.currentTarget.getAttribute('data-music-type');
            if (type === 'default') {
                setMusicUrl(INITIAL_DEFAULT_URL, "Default Track"); 
            } else if (type === 'url') {
                closeModal('music-modal'); 
                openModal('url-input-modal'); 
                const urlInput = document.getElementById('music-url-input');
                const savedUrl = localStorage.getItem(TEMP_MUSIC_KEY);
                if (urlInput) urlInput.value = (savedUrl && savedUrl !== INITIAL_DEFAULT_URL) ? savedUrl : ''; 
            }
        };
    });

    document.getElementById('close-url-modal-btn').onclick = () => {
        closeModal('url-input-modal');
        openModal('music-modal'); 
    };
    
    document.getElementById('play-url-btn').onclick = () => {
        const url = document.getElementById('music-url-input').value.trim();
        if (url) {
            setMusicUrl(url, "Custom URL"); 
        } else {
            showToast("Please enter a valid Music URL.");
        }
    };
    
    const fileInput = document.getElementById('music-upload-input');
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('audio/')) {
            const url = URL.createObjectURL(file); 
            setMusicUrl(url, file.name); 
        } else {
             showToast("Please select a valid audio file.");
        }
        e.target.value = null; 
    };
}


// ===========================================
//          MAIN ENTRY (unchanged)
// ===========================================

function updateProfileDisplay(userId, fullName, username, is_admin) { 
    const displayUsername = username ? `@${username}` : 'Username N/A';
    document.getElementById('profile-display-name').textContent = fullName || 'User';
    document.getElementById('profile-display-username').textContent = displayUsername;
    document.getElementById('telegram-chat-id').textContent = userId.toString();
    const adminStatusEl = document.getElementById('admin-status');
    adminStatusEl.textContent = is_admin ? 'Administrator' : 'Regular User';
    adminStatusEl.style.backgroundColor = is_admin ? 'var(--tg-theme-link-color)' : 'var(--tg-theme-hint-color)';
    
    const tgUser = tg ? tg.initDataUnsafe.user : null;
    const tgPhotoUrl = tgUser ? tgUser.photo_url : null;
    const profileAvatarPlaceholder = document.getElementById('profile-avatar-placeholder');

    if (profileAvatarPlaceholder) {
        if (tgPhotoUrl) {
            profileAvatarPlaceholder.innerHTML = `<img src="${tgPhotoUrl}" alt="${fullName || 'Profile Photo'}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            profileAvatarPlaceholder.style.backgroundColor = 'transparent';
            profileAvatarPlaceholder.textContent = '';
        } else {
            const userColor = stringToColor(userId.toString());
            const initial = (fullName.charAt(0) || 'U').toUpperCase();
            profileAvatarPlaceholder.innerHTML = ''; 
            profileAvatarPlaceholder.style.backgroundColor = userColor;
            profileAvatarPlaceholder.textContent = initial;
            profileAvatarPlaceholder.style.fontSize = '1.5rem';
        }
    }
}

function setupProfileListeners() { 
    const copyBtn = document.getElementById('chat-id-copy-btn');
    if (copyBtn) copyBtn.onclick = () => copyToClipboard(currentUserId.toString(), 'User ID copied.');
    const closeBtn = document.getElementById('tma-close-btn');
    if (closeBtn) closeBtn.onclick = () => tg && tg.close ? tg.close() : showToast("Mini App Close API Not Available."); 
}

function switchScreen(targetScreenId) { 
    document.querySelectorAll('.content .screen').forEach(screen => screen.classList.remove('active'));
    const targetScreen = document.getElementById(targetScreenId);
    if (targetScreen) targetScreen.classList.add('active');
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-screen') === targetScreenId);
    });
    
    const fixedHeaderArea = document.querySelector('.fixed-header-area');
    const fab = document.getElementById('post-add-button');
    const contentArea = document.querySelector('.content');
    const headerHeight = fixedHeaderArea ? fixedHeaderArea.offsetHeight : 0;
    
    if (targetScreenId === 'profile-screen') {
        if (fixedHeaderArea) fixedHeaderArea.style.display = 'none';
        if (contentArea) contentArea.style.paddingTop = '20px'; 
        if (fab) fab.style.display = 'none';
    } else { // home-screen
        if (fixedHeaderArea) fixedHeaderArea.style.display = 'block';
        if (contentArea) contentArea.style.paddingTop = `${headerHeight + 20}px`; 
        if (fab && is_admin) fab.style.display = 'flex'; 
    }
    if (contentArea) contentArea.scrollTop = 0;
}

function addNavigationListeners() { 
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => switchScreen(e.currentTarget.getAttribute('data-screen')));
    });
}

function main() { 
    const user = tg.initDataUnsafe.user;
    if (user && user.id) {
        currentUserId = parseInt(user.id);
        const nameParts = [user.first_name, user.last_name].filter(Boolean);
        currentUserName = nameParts.length > 0 ? nameParts.join(' ') : 'Anonymous User';
        currentUserUsername = user.username || null;
        is_admin = isAdminUser(currentUserId);
    }
    
    addNavigationListeners();
    setupPostFilters();
    setupMusicPlayer();
    addMusicEventListeners();
    setupProfileListeners();
    setupAdminPostLogic(is_admin);
    
    updateProfileDisplay(currentUserId, currentUserName, currentUserUsername, is_admin);
    
    loadPostsRealtime(currentUserId);
    
    switchScreen('home-screen');
    if (tg.MainButton) tg.MainButton.hide();
    tg.ready(); 
}

function setupTMA() { 
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        const themeParams = tg.themeParams;
        if (themeParams) {
            const root = document.documentElement;
            const themeMap = {
                '--tg-theme-bg-color': themeParams.bg_color || '#0d1117',
                '--tg-theme-secondary-bg-color': themeParams.secondary_bg_color || '#1a202c',
                '--tg-theme-text-color': themeParams.text_color || '#ffffff',
                '--tg-theme-link-color': '#20b2aa', 
                '--tg-theme-button-color': '#4caf50', 
                '--tg-theme-button-text-color': themeParams.button_text_color || '#ffffff',
                '--tg-theme-destructive-text-color': '#ff9800', 
                '--tg-theme-hint-color': '#bdbdbd'
            };
            
            for (const [prop, value] of Object.entries(themeMap)) {
                root.style.setProperty(prop, value);
            }
            document.body.style.backgroundColor = themeMap['--tg-theme-bg-color'];
        }
        main();
    } else {
        console.warn("Telegram WebApp SDK not found. Running in fallback mode (Local Testing).");
        
        const mockAdminId = ADMIN_CHAT_IDS.length > 0 ? ADMIN_CHAT_IDS[0] : 123456789; 
        tg = {
            initDataUnsafe: { user: { id: mockAdminId, first_name: "Local", last_name: "Tester", username: "local_tester", photo_url: null } },
            themeParams: {},
            ready: () => console.log('TMA Mock Ready'),
            close: () => console.log('TMA Mock Close'),
            showConfirm: (msg, callback) => callback(window.confirm(msg)),
            HapticFeedback: { impactOccurred: () => console.log('Haptic: Light') },
            MainButton: { hide: () => console.log('MainButton: Hide') }
        };

        const root = document.documentElement;
        root.style.setProperty('--tg-theme-bg-color', '#0d1117');
        root.style.setProperty('--tg-theme-text-color', '#ffffff');
        root.style.setProperty('--tg-theme-secondary-bg-color', '#1a202c');
        root.style.setProperty('--tg-theme-link-color', '#20b2aa');
        root.style.setProperty('--tg-theme-button-color', '#4caf50');
        root.style.setProperty('--tg-theme-destructive-text-color', '#ff9800');
        root.style.setProperty('--tg-theme-hint-color', '#bdbdbd');
        document.body.style.backgroundColor = 'var(--tg-theme-bg-color)';

        main();
    }
}

document.addEventListener('DOMContentLoaded', setupTMA);
