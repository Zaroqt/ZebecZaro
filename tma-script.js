// *****************************************************************
// ZZ Feed - Telegram Mini App Script (Final Fix - Music Playback Fix)
// *****************************************************************

 //********** SET YOUR ADMIN CHAT ID(s) HERE ******** 
    const ADMIN_CHAT_IDS = [ 
    1924452453, 
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

// (HELPER FUNCTIONS: stringToColor, showToast, copyToClipboard, isAdminUser - ယခင်အတိုင်း)
// ...

// (DATA/STORAGE HANDLERS: loadPostsRealtime, toggleLike, updateLikeCountDisplay - ယခင်အတိုင်း)
// ...

// (POSTS UI LOGIC: getPostLikeCount, createPostElement, performDeletePost, addPostEventListeners, setupPostFilters - ယခင်အတိုင်း)
// ...

// (ADMIN POST LOGIC: setupAdminPostLogic - ယခင်အတိုင်း)
// ...


// ===========================================
//          MODAL & MUSIC LOGIC (Music Playback Final Fix)
// ===========================================

function openModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('active'));
    const fab = document.getElementById('post-add-button');
    // Fix: fab ကို ပိတ်ထားပါ။
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
        // Fix: Home screen မှာ ပြန်ပေါ်လာရင် fab ကို ပြန်ပြပါ။
        if (homeScreen && homeScreen.classList.contains('active') && is_admin) {
            const fab = document.getElementById('post-add-button');
            if (fab) fab.style.display = 'flex'; 
        }
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

/**
 * 💡 Music Playback Fix: iOS/Telegram WebApp တွေမှာ နှိပ်လို့ မရတဲ့ ပြဿနာ ဖြေရှင်းဖို့
 * Play Promise ကို သေချာ ကိုင်တွယ်ပြီး User Interaction ကို အာမခံထားသည်။
 */
function toggleVolume() { 
    if (!audioPlayer) return;

    if (audioPlayer.paused) {
        audioPlayer.volume = isMusicMuted ? 0 : 1;
        
        // 🚨 FINAL FIX: Play Promise ကို စနစ်တကျ ကိုင်တွယ်ခြင်း
        const playPromise = audioPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Play Successfully
                showToast(isMusicMuted ? "Music started (Muted)." : "Music started playing.");
            }).catch(e => {
                // Play Failed (ဥပမာ: User Click မဟုတ်ဘဲ ခေါ်လို့)
                console.error("Failed to play audio:", e);
                showToast('Playback Failed. Please tap the volume icon again.');
            });
        }
    } else {
        // Toggle Mute/Unmute
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

// (PROFILE & NAVIGATION LOGIC: updateProfileDisplay, setupProfileListeners, switchScreen, addNavigationListeners - ယခင်အတိုင်း)
// ...

// (MAIN ENTRY: main, setupTMA - ယခင်အတိုင်း)
// ...

document.addEventListener('DOMContentLoaded', setupTMA);
