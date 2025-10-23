// *****************************************************************
// ZZ Feed - Telegram Mini App Script (Modular Firebase & Public Pathing FIX)
// *****************************************************************

// *** MODULAR FIREBASE IMPORTS (Defined globally in index.html, needed for type safety/clarity) ***
// These functions are assumed to be available globally (e.g., window.db, window.appId) after 
// the module script in index.html runs, but we declare them here to avoid linter warnings.
// NOTE: Since this is NOT a module file, we use the global variables.
const db = window.db; 
const auth = window.auth; 
const appId = window.appId; 

// We need to import these functions if this were a module, but since it's loaded after 
// the Firebase module in index.html, we must assume the non-imported global existence 
// or define them here for clarity if they were imported functions.
// For a non-module script, we need the modular functions directly from the window scope 
// or use the global functions available from the modular CDN imports.
// To ensure the code runs, we'll redefine the necessary Firestore methods locally for easy reference.
const { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, getDoc, serverTimestamp } = 
    typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue
        ? { // Fallback for environments where the new modular functions aren't globally available
            collection: (db, path) => ({ collection: path, db: db }),
            query: (colRef, ...constraints) => ({ colRef, constraints }),
            orderBy: (field, direction) => ({ field, direction }),
            onSnapshot: (q, callback, errorCallback) => { console.error("Firestore functions not available."); return () => {}; },
            addDoc: (colRef, data) => Promise.reject(new Error("Firestore functions not available.")),
            deleteDoc: (docRef) => Promise.reject(new Error("Firestore functions not available.")),
            doc: (db, path) => ({ db, path }),
            getDoc: (docRef) => Promise.reject(new Error("Firestore functions not available.")),
            serverTimestamp: () => new Date(),
          } 
        : window; // Assume modular functions are available globally in the Canvas environment

// ********** SET YOUR ADMIN CHAT ID(s) HERE **********
// IDs should be integers as returned by Telegram
const ADMIN_CHAT_IDS = [ 
    1924452453, // Replace with your actual ID
    6440295843, 
    6513916873, 
    // Add additional Admin IDs here:
]; 
// *************************************************

// --- Global Variables & Constants ---
const POSTS_COLLECTION = 'tma_zzfeed_posts'; // Canvas Public Path: /artifacts/{appId}/public/data/tma_zzfeed_posts
const LIKES_COLLECTION = 'tma_zzfeed_likes'; // Canvas Public Path: /artifacts/{appId}/public/data/tma_zzfeed_likes
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
//          HELPER FUNCTIONS
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
//          DATA/STORAGE HANDLERS (MODULAR & PATHING UPDATED)
// ===========================================

// Helper to get the correct public collection reference
function getPublicCollectionRef(collectionName) {
    if (!db || !appId) {
        console.error("Database or App ID not available.");
        return null;
    }
    // MANDATORY Canvas Public Path: /artifacts/{appId}/public/data/{collectionName}
    return collection(db, `artifacts/${appId}/public/data/${collectionName}`);
}

function loadPostsRealtime(userId) { 
    if (!db) {
        const container = document.getElementById('posts-container');
        if(container) container.innerHTML = '<p class="initial-loading-text" style="color:var(--tg-theme-destructive-text-color);">❌ Database Not Initialized. Check index.html config.</p>';
        return;
    }
    if (unsubscribeFromPosts) { unsubscribeFromPosts(); }
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = '<p class="initial-loading-text">Connecting to server...</p>';

    const postsColRef = getPublicCollectionRef(POSTS_COLLECTION);
    if (!postsColRef) return;

    const sortField = 'timestamp';
    const sortDirection = currentPostFilter === 'new-posts' ? 'desc' : 'asc';
    
    // Create query using modular functions
    const postsQuery = query(postsColRef, orderBy(sortField, sortDirection));

    unsubscribeFromPosts = onSnapshot(postsQuery, async (snapshot) => {
        const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
        container.innerHTML = '<p class="initial-loading-text" style="color:var(--tg-theme-destructive-text-color);">❌ Failed to load posts. Check Security Rules/Network.</p>';
        showToast("Error connecting to database.");
    });
}

async function toggleLike(e, userId) { 
    if (!db) { showToast("Database not ready."); return; }
    const likeButton = e.currentTarget;
    const postId = likeButton.getAttribute('data-post-id');
    
    // Like document reference using modular doc function
    const likeDocRef = doc(db, `artifacts/${appId}/public/data/${LIKES_COLLECTION}`, `${postId}_${userId}`);
    
    try {
        const d = await getDoc(likeDocRef);
        let change = 0;
        let isLikedNow = false;

        if (d.exists()) {
            await deleteDoc(likeDocRef);
            change = -1;
            isLikedNow = false;
            showToast("Unliked.");
        } else {
            // Using addDoc or setDoc is fine, setDoc used here to explicitly use the unique ID
            await setDoc(likeDocRef, { 
                postId: postId, 
                userId: userId, 
                timestamp: serverTimestamp() 
            });
            change = 1;
            isLikedNow = true;
            showToast("Liked!");
        }
        updateLikeCountDisplay(likeButton, change, isLikedNow);
    } catch (error) {
        console.error("Error toggling like:", error);
        showToast("Action failed. Try again. (Check Security Rules)");
    }
}

function updateLikeCountDisplay(likeButton, change, isLikedNow) {
    const currentCountText = likeButton.textContent.replace(/[^0-9]/g, ''); 
    let currentCount = parseInt(currentCountText) || 0;
    const newCount = Math.max(0, currentCount + change);
    likeButton.innerHTML = `<i class="fas fa-heart"></i> ${newCount}`;
    likeButton.classList.toggle('liked', isLikedNow);
}

// NOTE: We rely on the onSnapshot listener to update the count display automatically.
// The initial count is fetched by the snapshot which includes the like status.
// getPostLikeCount function is not strictly needed for the initial rendering 
// if we use a different approach (e.g., getting likes metadata alongside posts)
// but since the original implementation calculated likes on the fly, 
// and that is prone to network issues, we will keep the original function 
// but it is best to calculate likes on the fly in the component if possible, 
// or rely on the Realtime Snapshot for a single source of truth.

// Reverting to the original plan of calculating the count on the fly for initial load, 
// as onSnapshot does not easily give a full count across a large collection.
async function getPostLikeCount(postId) {
    if (!db) return 0;
    try {
        const likesColRef = getPublicCollectionRef(LIKES_COLLECTION);
        // Using a query to count documents that match the postId pattern
        const snapshot = await getDocs(query(likesColRef, where('postId', '==', postId)));
        return snapshot.size;
    } catch (error) {
        // If query fails (e.g., missing index or permission), return 0
        console.error("Error fetching like count for post:", postId, error);
        return 0;
    }
}


async function createPostElement(post, userId) { 
    const postId = post.id;
    const postElement = document.createElement('div');
    postElement.className = 'post-card';
    postElement.setAttribute('data-post-id', postId);
    
    let isLiked = false;
    if (db) {
        // Check if the current user has liked this specific post
        const likeDoc = await getDoc(doc(db, `artifacts/${appId}/public/data/${LIKES_COLLECTION}`, `${postId}_${userId.toString()}`));
        isLiked = likeDoc.exists();
    }

    // Rely on the count function (since we can't filter likes inside the main post query)
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
    if (!isAdminUser(userId) || !db) {
        showToast("Only Admins can delete posts or database not ready.");
        return;
    }
    // Modular doc reference and deleteDoc
    const postRef = doc(db, `artifacts/${appId}/public/data/${POSTS_COLLECTION}`, postId);
    deleteDoc(postRef).then(() => {
        showToast("Post deleted successfully!");
    }).catch(error => {
        console.error("Error removing document: ", error);
        showToast("Deletion failed on server. (Check Security Rules)");
    });
}

function addPostEventListeners(userId) { 
    document.querySelectorAll('.like-btn').forEach(button => {
        button.onclick = (e) => toggleLike(e, userId); 
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.onclick = (e) => {
            const postId = e.currentTarget.getAttribute('data-post-id');
            // Use Telegram's native confirmation dialog if available
            if (tg && tg.showConfirm) {
                tg.showConfirm('Are you sure you want to delete this post?', (ok) => {
                    if (ok) performDeletePost(postId, userId);
                });
            } else {
                // Fallback to custom toast warning since window.confirm is restricted
                showToast("Deletion feature blocked in current environment. Ask Admin.");
                console.warn("Using window.confirm is blocked. Delete action requires manual Admin confirmation.");
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
//          ADMIN POST LOGIC 
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
                if (!db) {
                    showToast("Error: Database not initialized. Please refresh.");
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
                
                submitPostBtn.disabled = true;
                submitPostBtn.textContent = 'Posting...';

                // Use modular addDoc and serverTimestamp with correct public collection path
                const postsColRef = getPublicCollectionRef(POSTS_COLLECTION);
                if (!postsColRef) {
                    showToast("Posting failed: Invalid collection reference.");
                    submitPostBtn.disabled = false;
                    submitPostBtn.textContent = 'Post Now';
                    return;
                }

                const newPost = {
                    authorId: currentUserId.toString(),
                    authorName: currentUserName || 'Admin', 
                    isAdmin: true,
                    content: content,
                    timestamp: serverTimestamp(), // Modular function reference
                };
                
                addDoc(postsColRef, newPost) // Use modular addDoc
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
                        // THIS IS THE CRITICAL ERROR CATCH FOR POSTING FAILURE
                        console.error("Error writing document (Check Security Rules): ", error);
                        showToast(`Posting Failed! (Check Security Rules for Public Path): ${error.message}`);
                    })
                    .finally(() => {
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


// ===========================================
//          MODAL & MUSIC LOGIC 
// ===========================================

function openModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    document.body.style.overflow = 'hidden'; 
    modal.classList.add('active');

    const fab = document.getElementById('post-add-button');
    if (fab) fab.style.display = 'none'; 
    
    modal.onclick = (e) => {
        if (e.target === modal) { 
            closeModal(modalId);
        }
    };
}

function closeModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('active');
    modal.onclick = null; 

    setTimeout(() => {
        if (!document.querySelector('.modal-overlay.active')) {
             document.body.style.overflow = '';
        }
       
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen && homeScreen.classList.contains('active') && is_admin) {
            const fab = document.getElementById('post-add-button');
            if (fab) fab.style.display = 'flex'; 
        }
    }, 300); 
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
//          MAIN ENTRY
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
    // Wait for Firebase to initialize and authenticate before proceeding
    if (!window.db || !auth.currentUser) {
        // Retry main after a short delay if Firebase isn't fully ready
        setTimeout(main, 50);
        return;
    }

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
            // Mocking showConfirm to use Toast instead of alert/confirm
            showConfirm: (msg, callback) => { showToast(msg); callback(true); }, 
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

        // Since Firebase is loaded asynchronously via the module script, we must wait for it.
        // We will call main() from the module script after Firebase is initialized.
        // For local testing without the module script, you must manually ensure window.db exists.
    }
}

// In the Canvas environment, the module script in index.html will call main() after Firebase setup.
// If not in Canvas, we still need to wait for the DOM.
document.addEventListener('DOMContentLoaded', () => {
    // Only call setupTMA if we are not in the Canvas environment (where the module script loads everything)
    if (!window.db) {
        setupTMA(); // This executes the non-Canvas fallback path
    }
});
