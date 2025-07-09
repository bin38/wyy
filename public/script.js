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
        importPlaylist: (url) => fetch(`${API_BASE_URL}/import-playlist?url=${encodeURIComponent(url)}`).then(res => res.json()),
    };

    // --- UTILITY FUNCTIONS ---
    function fixImageUrl(url) {
        if (!url) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23333"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="20">封面</text></svg>';
        return url.replace(/^http:/, 'https:');
    }

    function showLoading() {
        mainContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">加载中...</div>';
    }

    function showError(message) {
        mainContent.innerHTML = `<div style="text-align: center; padding: 50px; color: #ff6b6b;">${message}</div>`;
    }

    // --- UI RENDERING ---
    function renderTopLists(lists) {
        console.log('Rendering toplists:', lists);
        mainContent.innerHTML = '<div class="top-lists"></div>';
        const container = mainContent.querySelector('.top-lists');
        
        lists.forEach(group => {
            if (group.data && group.data.length > 0) {
                group.data.forEach(list => {
                    const item = document.createElement('div');
                    item.className = 'list-item';
                    item.dataset.id = list.id;
                    
                    const imageUrl = fixImageUrl(list.coverImg);
                    item.innerHTML = `
                        <img src="${imageUrl}" alt="${list.title}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"200\\"><rect width=\\"200\\" height=\\"200\\" fill=\\"%23333\\"/><text x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" fill=\\"white\\" font-size=\\"16\\">${list.title}</text></svg>'">
                        <p>${list.title}</p>
                        <small>${list.description || ''}</small>
                    `;
                    item.addEventListener('click', () => loadPlaylist(list.id));
                    container.appendChild(item);
                });
            }
        });
        
        // 添加导入歌单选项
        const importItem = document.createElement('div');
        importItem.className = 'list-item import-item';
        importItem.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: linear-gradient(45deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                <i class="fas fa-plus" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p style="margin: 0;">导入歌单</p>
            </div>
        `;
        importItem.addEventListener('click', showImportDialog);
        container.appendChild(importItem);
    }

    function renderPlaylist(playlist) {
        console.log('Rendering playlist:', playlist);
        mainContent.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button onclick="showHomePage()" style="background: #333; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-arrow-left"></i> 返回主页
                </button>
            </div>
            <div class="playlist"></div>
        `;
        const container = mainContent.querySelector('.playlist');
        state.currentPlaylist = playlist;
        
        playlist.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'song-item';
            item.dataset.index = index;
            
            const imageUrl = fixImageUrl(song.artwork);
            item.innerHTML = `
                <img src="${imageUrl}" alt="${song.title}" class="artwork" width="40" height="40" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"40\\" height=\\"40\\"><rect width=\\"40\\" height=\\"40\\" fill=\\"%23555\\"/></svg>'">
                <div class="song-item-info">
                    <p style="margin: 0; font-weight: 500;">${song.title}</p>
                    <p style="margin: 0; color: #999; font-size: 0.9rem;">${song.artist}</p>
                </div>
                <div class="song-actions">
                    <button class="action-btn" onclick="playSong(${index})" title="播放">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            item.addEventListener('click', () => playSong(index));
            container.appendChild(item);
        });
    }
    
    function renderSearchResults(results) {
        if (results && results.data) {
            renderPlaylist(results.data);
        } else {
            showError('搜索结果为空');
        }
    }

    // --- IMPORT PLAYLIST DIALOG ---
    function showImportDialog() {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        
        dialog.innerHTML = `
            <div style="background: #282828; padding: 30px; border-radius: 10px; width: 90%; max-width: 500px;">
                <h3 style="margin: 0 0 20px 0; color: white;">导入歌单</h3>
                <input type="text" id="importUrl" placeholder="请输入网易云音乐歌单链接或ID" 
                       style="width: 100%; padding: 12px; border: none; border-radius: 5px; background: #333; color: white; margin-bottom: 20px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer;">取消</button>
                    <button onclick="importPlaylist()" 
                            style="padding: 10px 20px; background: #1DB954; color: white; border: none; border-radius: 5px; cursor: pointer;">导入</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        document.getElementById('importUrl').focus();
    }

    // --- PLAYER LOGIC ---
    function loadPlaylist(id) {
        showLoading();
        api.getPlaylist(id).then(result => {
            if (result && result.data) {
                renderPlaylist(result.data);
            } else {
                showError('无法加载歌单');
            }
        }).catch(error => {
            console.error('Failed to load playlist:', error);
            showError('加载歌单失败');
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
        const imageUrl = fixImageUrl(state.currentSong.artwork);
        songArtwork.src = imageUrl;
        songTitle.textContent = state.currentSong.title;
        songArtist.textContent = state.currentSong.artist;
        playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    async function loadSongMedia() {
        try {
            const quality = qualitySelect.value;
            const result = await api.getSongUrl(state.currentSong.id, quality);
            if (result && result.url) {
                audioPlayer.src = result.url;
                audioPlayer.play();
            } else {
                alert('获取歌曲链接失败，可能是VIP或无版权歌曲。');
                nextSong();
            }
        } catch (error) {
            console.error('Failed to load song media:', error);
            alert('播放失败');
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
        lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">加载歌词中...</div>';
        state.lyrics = [];
        
        try {
            const result = await api.getLyric(state.currentSong.id);
            if (result && result.rawLrc) {
                parseLyrics(result.rawLrc);
            } else {
                lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>';
            }
        } catch (error) {
            console.error('Failed to load lyrics:', error);
            lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #ff6b6b;">歌词加载失败</div>';
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
        if (state.lyrics.length === 0) {
            lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>';
            return;
        }
        
        state.lyrics.forEach((line, index) => {
            const p = document.createElement('p');
            p.textContent = line.text;
            p.dataset.time = line.time;
            p.dataset.index = index;
            p.style.cssText = `
                margin: 20px 0; font-size: 1.2rem; color: #888; 
                transition: all 0.3s ease; cursor: pointer; padding: 10px;
                border-radius: 5px;
            `;
            p.addEventListener('click', () => {
                audioPlayer.currentTime = line.time;
            });
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
                    p.style.color = '#1DB954';
                    p.style.transform = 'scale(1.05)';
                    p.style.background = 'rgba(29, 185, 84, 0.1)';
                    p.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    p.style.color = '#888';
                    p.style.transform = 'scale(1)';
                    p.style.background = 'transparent';
                }
            });
        }
    }

    // --- GLOBAL FUNCTIONS ---
    window.showHomePage = () => {
        init();
    };

    window.playSong = playSong;

    window.importPlaylist = async () => {
        const url = document.getElementById('importUrl').value.trim();
        if (!url) {
            alert('请输入歌单链接或ID');
            return;
        }
        
        try {
            showLoading();
            const result = await api.importPlaylist(url);
            if (result && result.data) {
                renderPlaylist(result.data);
                document.querySelector('[style*="position: fixed"]').remove(); // 关闭对话框
            } else {
                showError('导入歌单失败');
            }
        } catch (error) {
            console.error('Import failed:', error);
            showError('导入歌单失败：' + error.message);
        }
    };

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
                showLoading();
                api.search(searchInput.value).then(renderSearchResults).catch(error => {
                    console.error('Search failed:', error);
                    showError('搜索失败');
                });
            }
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value) {
                showLoading();
                api.search(searchInput.value).then(renderSearchResults).catch(error => {
                    console.error('Search failed:', error);
                    showError('搜索失败');
                });
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
        showLoading();
        api.getTopLists().then(result => {
            console.log('Received toplists:', result);
            if (result && Array.isArray(result)) {
                renderTopLists(result);
            } else {
                showError('无法加载排行榜');
            }
        }).catch(error => {
            console.error('Failed to load toplists:', error);
            showError('加载排行榜失败');
        });
        setupEventListeners();
    }

    init();
}); 
