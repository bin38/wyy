document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        currentPlaylist: [],
        currentIndex: 0,
        currentSong: null,
        isPlaying: false,
        lyrics: [],
    };

    // --- DOM ELEMENTS ---
    const mainContent = document.getElementById('mainContent');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    const player = document.getElementById('player');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const songArtwork = document.getElementById('songArtwork');
    const songTitle = document.getElementById('songTitle');
    const songArtist = document.getElementById('songArtist');
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const qualitySelect = document.getElementById('qualitySelect');
    const downloadBtn = document.getElementById('downloadBtn');
    const lyricBtn = document.getElementById('lyricBtn');
    
    const lyricPanel = document.getElementById('lyricPanel');
    const closeLyricBtn = document.getElementById('closeLyricBtn');
    const lyricContent = document.getElementById('lyricContent');
    
    const audioPlayer = document.getElementById('audioPlayer');

    const API_BASE_URL = '/api';

    // --- API HELPERS ---
    const api = {
        getTopLists: () => fetch(`${API_BASE_URL}/toplists`).then(res => res.json()),
        getPlaylist: (id) => fetch(`${API_BASE_URL}/playlist?id=${id}`).then(res => res.json()),
        search: (query) => fetch(`${API_BASE_URL}/search?query=${query}&type=music`).then(res => res.json()),
        getSongUrl: (id, quality) => fetch(`${API_BASE_URL}/song/url?id=${id}&quality=${quality}`).then(res => res.json()),
        getLyric: (id) => fetch(`${API_BASE_URL}/lyric?id=${id}`).then(res => res.json()),
    };

    // --- UI RENDERING ---
    function renderTopLists(lists) {
        mainContent.innerHTML = '<div class="top-lists"></div>';
        const container = mainContent.querySelector('.top-lists');
        lists.forEach(group => {
            group.data.forEach(list => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.dataset.id = list.id;
                item.innerHTML = `
                    <img src="${list.coverImg}" alt="${list.title}">
                    <p>${list.title}</p>
                `;
                item.addEventListener('click', () => loadPlaylist(list.id));
                container.appendChild(item);
            });
        });
    }

    function renderPlaylist(playlist) {
        mainContent.innerHTML = '<div class="playlist"></div>';
        const container = mainContent.querySelector('.playlist');
        state.currentPlaylist = playlist;
        playlist.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'song-item';
            item.dataset.index = index;
            item.innerHTML = `
                <img src="${song.artwork}" alt="${song.title}" class="artwork" width="40" height="40">
                <div class="song-item-info">
                    <p>${song.title}</p>
                    <p>${song.artist}</p>
                </div>
            `;
            item.addEventListener('click', () => playSong(index));
            container.appendChild(item);
        });
    }
    
    function renderSearchResults(results) {
        renderPlaylist(results.data);
    }

    // --- PLAYER LOGIC ---
    function loadPlaylist(id) {
        api.getPlaylist(id).then(result => {
            renderPlaylist(result.data);
        });
    }

    function playSong(index) {
        state.currentIndex = index;
        state.currentSong = state.currentPlaylist[index];
        state.isPlaying = true;

        updatePlayerUI();
        loadSongMedia();
        loadLyrics();
    }

    function updatePlayerUI() {
        if (!state.currentSong) return;
        songArtwork.src = state.currentSong.artwork;
        songTitle.textContent = state.currentSong.title;
        songArtist.textContent = state.currentSong.artist;
        playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    async function loadSongMedia() {
        const quality = qualitySelect.value;
        const result = await api.getSongUrl(state.currentSong.id, quality);
        if (result && result.url) {
            audioPlayer.src = result.url;
            audioPlayer.play();
        } else {
            alert('获取歌曲链接失败，可能是VIP或无版权歌曲。');
            nextSong();
        }
    }

    function togglePlayPause() {
        if (!state.currentSong) return;
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
        updatePlayerUI();
    }
    
    function prevSong() {
        if (!state.currentSong) return;
        let newIndex = state.currentIndex - 1;
        if (newIndex < 0) {
            newIndex = state.currentPlaylist.length - 1;
        }
        playSong(newIndex);
    }
    
    function nextSong() {
        if (!state.currentSong) return;
        let newIndex = state.currentIndex + 1;
        if (newIndex >= state.currentPlaylist.length) {
            newIndex = 0;
        }
        playSong(newIndex);
    }
    
    function updateProgress() {
        if (audioPlayer.duration) {
            progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
            totalDurationEl.textContent = formatTime(audioPlayer.duration);
            updateLyricHighlight();
        }
    }

    function seek() {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
        }
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // --- LYRIC LOGIC ---
    async function loadLyrics() {
        lyricContent.innerHTML = '';
        state.lyrics = [];
        const result = await api.getLyric(state.currentSong.id);
        if (result && result.rawLrc) {
            parseLyrics(result.rawLrc);
        } else {
            lyricContent.innerHTML = '<p>暂无歌词</p>';
        }
    }

    function parseLyrics(lrc) {
        state.lyrics = [];
        const lines = lrc.split('\n');
        for (const line of lines) {
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4].trim();
                if (text) {
                    state.lyrics.push({ time, text });
                }
            }
        }
        renderLyrics();
    }
    
    function renderLyrics() {
        lyricContent.innerHTML = '';
        state.lyrics.forEach(line => {
            const p = document.createElement('p');
            p.textContent = line.text;
            p.dataset.time = line.time;
            lyricContent.appendChild(p);
        });
    }

    function updateLyricHighlight() {
        const currentTime = audioPlayer.currentTime;
        let activeLine = null;
        for (let i = 0; i < state.lyrics.length; i++) {
            if (currentTime >= state.lyrics[i].time) {
                activeLine = i;
            } else {
                break;
            }
        }

        if (activeLine !== null) {
            const allLines = lyricContent.querySelectorAll('p');
            allLines.forEach((p, index) => {
                if (index === activeLine) {
                    p.classList.add('active');
                    p.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    p.classList.remove('active');
                }
            });
        }
    }

    // --- DOWNLOAD LOGIC ---
    function downloadSong() {
        if (!state.currentSong) {
            alert('请先选择一首歌');
            return;
        }
        const a = document.createElement('a');
        a.href = audioPlayer.src;
        a.download = `${state.currentSong.title} - ${state.currentSong.artist}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', togglePlayPause);
        prevBtn.addEventListener('click', prevSong);
        nextBtn.addEventListener('click', nextSong);
        progressBar.addEventListener('input', seek);
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('ended', nextSong);
        
        searchBtn.addEventListener('click', () => {
            if (searchInput.value) {
                api.search(searchInput.value).then(renderSearchResults);
            }
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value) {
                api.search(searchInput.value).then(renderSearchResults);
            }
        });

        lyricBtn.addEventListener('click', () => lyricPanel.classList.add('show'));
        closeLyricBtn.addEventListener('click', () => lyricPanel.classList.remove('show'));
        
        qualitySelect.addEventListener('change', () => {
            if (state.currentSong) {
                loadSongMedia();
            }
        });
        
        downloadBtn.addEventListener('click', downloadSong);
    }

    // --- INITIALIZATION ---
    function init() {
        api.getTopLists().then(renderTopLists);
        setupEventListeners();
    }

    init();
}); 