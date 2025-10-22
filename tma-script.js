// **********************************************
// ********** SET YOUR ADMIN CHAT ID(s) HERE **********
// **********************************************
const ADMIN_CHAT_IDS = [
    1924452453, 
    6440295843, 
    6513916873, 
    // Add additional Admin IDs here:
    // 123456789, 
]; 
// *************************************************

// --- LOCAL STORAGE KEYS ---
const POSTS_STORAGE_KEY = 'tma_community_posts_v5';
const LIKES_STORAGE_KEY = 'tma_user_likes_v5';
const TEMP_MUSIC_KEY = 'tma_temp_music_url_v5';

// --- Global Variables ---
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


// ===========================================
//          HELPER FUNCTIONS
// ===========================================

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
//          DATA STORAGE HANDLERS (Local)
// ===========================================

function getPosts() { 
    try {
        const posts = JSON.parse(localStorage.getItem(POSTS_STORAGE_KEY) || '[]');
        return Array.isArray(posts) ? posts.filter(p => p && p.id && p.content) : [];
    } catch (e) {
        console.error("Error loading posts:", e);
        showToast("Error loading posts data.");
        return [];
    }
}

function savePosts(posts) { 
    try {
        localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts));
    } catch (e) {
        console.error("Error saving posts:", e);
        showToast("Error saving data. Storage full?");
    }
}

function getLikes() { 
    try {
        const likes = JSON.parse(localStorage.getItem(LIKES_STORAGE_KEY) || '{}');
        return typeof likes === 'object' && likes !== null ? likes : {};
    } catch (e) {
        console.error("Error loading likes:", e);
        return {};
    }
}

function saveLikes(likes) { 
    try {
        localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(likes));
    } catch (e) {
        console.error("Error saving likes:", e);
    }
}

// ===========================================
//          POSTS & LIKES LOGIC 
// ===========================================

function isAdminUser(userId) {
    return ADMIN_CHAT_IDS.includes(parseInt(userId));
}

/** Creates the HTML element for a single post. (FIXED DELETE BUTTON STRING) */
function createPostElement(post, userId) { 
    const likes = getLikes();
    const userIdStr = userId.toString();
    const postIdStr = post.id.toString();
    const postLikesArray = Array.isArray(likes[postIdStr]) ? likes[postIdStr].map(String) : [];
    const isLiked = postLikesArray.includes(userIdStr);
    
    const isAdmin = isAdminUser(userId);
    
    const postElement = document.createElement('div');
    postElement.className = 'post-card';
    postElement.setAttribute('data-post-id', post.id);
    
    const displayLikesCount = postLikesArray.length;
    
    // **FIXED:** The delete button HTML string was missing. Re-inserting it correctly.
    const deleteButton = isAdmin 
        ? `<button class="delete-btn" data-post-id="${post.id}"><i class="fas fa-trash"></i> Delete</button>` 
        : '';

    postElement.innerHTML = `
        <p class="post-content">${post.content}</p>
        <div class="post-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" aria-label="${isLiked ? 'Unlike' : 'Like'} Post">
                <i class="fas fa-heart"></i> 
                ${displayLikesCount}
            </button>
            ${deleteButton} 
        </div>
    `;
    return postElement;
} 

function loadPosts(userId) { 
    currentUserId = userId;
    let posts = getPosts();
    const container = document.getElementById('posts-container');
    
    if (!container) return;
    container.innerHTML = '<p class="initial-loading-text">Fetching posts...</p>';

    if (currentPostFilter === 'new-posts') {
        posts.sort((a, b) => b.timestamp - a.timestamp);
    } else if (currentPostFilter === 'old-posts') {
        posts.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    container.innerHTML = '';
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="initial-loading-text">No posts found yet. Be the first to post!</p>';
    } else {
        posts.forEach(post => container.appendChild(createPostElement(post, userId)));
    }
    
    addPostEventListeners(userId); 
}

function performDeletePost(postId, userId) { 
    if (!isAdminUser(userId)) { 
        showToast("Only Admins can delete posts.");
        return;
    }
    
    let posts = getPosts();
    const updatedPosts = posts.filter(p => p.id !== postId);
    savePosts(updatedPosts);
    
    let likes = getLikes();
    delete likes[postId];
    saveLikes(likes);
    
    showToast("Post deleted successfully.");
    loadPosts(userId); 
}

function toggleLike(e, userId) { 
    const postIdAttr = e.currentTarget.getAttribute('data-post-id');
    const postId = parseInt(postIdAttr);
    if (isNaN(postId)) { 
        console.error("Invalid postId for like toggle:", postIdAttr); 
        return; 
    }
    
    const postIdStr = postId.toString();
    const userIdStr = userId.toString();
    
    let likes = getLikes();
    likes[postIdStr] = Array.isArray(likes[postIdStr]) ? likes[postIdStr].map(String) : [];
    const isLiked = likes[postIdStr].includes(userIdStr);

    if (isLiked) {
        likes[postIdStr] = likes[postIdStr].filter(id => id !== userIdStr);
        showToast("Unliked.");
    } else {
        likes[postIdStr].push(userIdStr);
        showToast("Liked!");
    }
    
    saveLikes(likes);
    loadPosts(currentUserId); 
}

function addPostEventListeners(userId) { 
    document.querySelectorAll('.like-btn').forEach(button => {
        button.onclick = (e) => toggleLike(e, userId); 
    });

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.onclick = (e) => {
            const postId = parseInt(e.currentTarget.getAttribute('data-post-id'));
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
                loadPosts(currentUserId); 
            }
        });
    });
}

// ===========================================
//          MODAL & MUSIC LOGIC 
// ===========================================

function openModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('active'));
    
    const fab = document.getElementById('post-add-button');
    if (fab) fab.style.display = 'none'; 
}

function closeModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen && homeScreen.classList.contains('active') && is_admin) {
            const fab = document.getElementById('post-add-button');
            if (fab) fab.style.display = 'flex'; 
        }
    }, 400); 
}

function updateMusicStatus(isPlaying) { 
    if (!musicStatusSpan || !volumeToggleIcon) return;
    let statusText = isPlaying ? `🎶 Music Playing ${isMusicMuted ? '(Muted)' : ''} 🎶` : 'Music Paused (Tap Icon to Play)';
    musicStatusSpan.textContent = statusText;
    
    if (isPlaying) {
        volumeToggleIcon.classList.toggle('fa-volume-up', !isMusicMuted);
        volumeToggleIcon.classList.toggle('fa-volume-off', isMusicMuted);
        volumeToggleIcon.title = isMusicMuted ? "Unmute Music" : "Mute Music";
    } else {
        volumeToggleIcon.classList.remove('fa-volume-up');
        volumeToggleIcon.classList.add('fa-volume-off');
        volumeToggleIcon.title = "Start Playing Music";
    }
}

function toggleVolume() { 
    if (!audioPlayer) return;

    if (audioPlayer.paused) {
        audioPlayer.volume = isMusicMuted ? 0 : 1;
        audioPlayer.play().then(() => {
            showToast(isMusicMuted ? "Music started (Muted)." : "Music started playing.");
        }).catch(e => {
            console.error("Failed to play on user click:", e);
            showToast('Playback Failed. Tap screen first, or check music link.');
        });
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
        console.error("Audio error:", e);
        audioPlayer.pause();
        updateMusicStatus(false);
        showToast("Music Load Error. Playing stopped."); 
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
                if (urlInput) urlInput.value = localStorage.getItem(TEMP_MUSIC_KEY) === INITIAL_DEFAULT_URL ? '' : localStorage.getItem(TEMP_MUSIC_KEY) || ''; 
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
        if (file) {
            const url = URL.createObjectURL(file); 
            setMusicUrl(url, file.name); 
        }
        e.target.value = null; 
    };
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
        if (cancelPostBtn) cancelPostBtn.onclick = () => closeModal('post-modal');

        if (submitPostBtn && postInput) {
            submitPostBtn.onclick = () => {
                const content = postInput.value.trim();

                if (content.length >= 5 && content.length <= 500) { 
                    let posts = getPosts();
                    const newPost = {
                        id: Date.now(),
                        authorId: currentUserId,
                        authorName: currentUserName || 'Admin', 
                        isAdmin: true,
                        content: content,
                        timestamp: Date.now(),
                    };
                    
                    posts.push(newPost);
                    savePosts(posts);
                    
                    postInput.value = ''; 
                    
                    const newPostsTab = document.getElementById('new-posts-tab');
                    if (newPostsTab) newPostsTab.click();
                    
                    closeModal('post-modal'); 
                    showToast("Announcement posted successfully!");
                    
                } else {
                    showToast("Post must be between 5 and 500 characters.");
                }
            };
        }
    } else {
        if (postAddButton) postAddButton.style.display = 'none';
    }
}

// ===========================================
//          PROFILE LOGIC
// ===========================================

function updateProfileDisplay(userId, fullName, username, is_admin) { 
    const displayUsername = username ? `@${username}` : 'Username N/A';
    
    document.getElementById('profile-display-name').textContent = fullName || 'User';
    document.getElementById('profile-display-username').textContent = displayUsername;
    document.getElementById('telegram-chat-id').textContent = userId.toString();
    
    const adminStatusEl = document.getElementById('admin-status');
    adminStatusEl.textContent = is_admin ? 'Administrator' : 'Regular User';
    adminStatusEl.style.backgroundColor = is_admin ? 'var(--tg-theme-accent)' : 'var(--tg-theme-link-color)';
    
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

// ===========================================
//          NAVIGATION & MAIN ENTRY
// ===========================================

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

    // Get the height of the header for padding calculation
    const headerHeight = fixedHeaderArea ? fixedHeaderArea.offsetHeight : 0;

    if (targetScreenId === 'profile-screen') {
        // Profile screen needs special handling for header visibility
        if (fixedHeaderArea) fixedHeaderArea.style.display = 'none';
        if (contentArea) contentArea.style.paddingTop = '20px'; // Less padding
        if (fab) fab.style.display = 'none';
    } else { // home-screen
        // Home screen uses the fixed header, so content needs padding
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
    loadPosts(currentUserId);
    
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
                '--tg-theme-text-color': themeParams.text_color || '#ffffff',
                '--tg-theme-link-color': themeParams.link_color || '#4c8cff',
                '--tg-theme-hint-color': themeParams.hint_color || '#90a4ae',
                '--tg-theme-button-color': themeParams.button_color || '#4c8cff',
                '--tg-theme-button-text-color': themeParams.button_text_color || '#ffffff',
                '--tg-theme-secondary-bg-color': themeParams.secondary_bg_color || '#1a202c',
                '--tg-theme-destructive-text-color': themeParams.destructive_text_color || '#ff5252'
            };
            
            for (const [prop, value] of Object.entries(themeMap)) {
                root.style.setProperty(prop, value);
            }
            document.body.style.backgroundColor = themeMap['--tg-theme-bg-color'];
        }

        main();
        
    } else {
        console.warn("Telegram WebApp SDK not found. Running in fallback mode.");
        
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
        root.style.setProperty('--tg-theme-link-color', '#4c8cff');
        document.body.style.backgroundColor = 'var(--tg-theme-bg-color)';

        main();
    }
}

document.addEventListener('DOMContentLoaded', setupTMA);
