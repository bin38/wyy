document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        currentPlaylist: [],
        currentIndex: 0,
        currentSong: null,
        isPlaying: false,
        lyrics: [],
        cache: new Map(),
        isDragging: false,
        isBuffering: false,
        lazyLoadObserver: null,
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
    const progressFill = document.getElementById('progressFill');
    const progressBuffer = document.getElementById('progressBuffer');
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

    // --- CACHE HELPERS ---
    function getCacheKey(type, params) {
        return `${type}_${JSON.stringify(params)}`;
    }

    function getCache(key) {
        const cached = state.cache.get(key);
        if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
            return cached.data;
        }
        state.cache.delete(key);
        return null;
    }

    function setCache(key, data) {
        state.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // --- UTILITY FUNCTIONS ---
    function fixImageUrl(url) {
        if (!url) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23333"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="20">封面</text></svg>';
        return url.replace(/^http:/, 'https:');
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function unescapeHtml(safe) {
        if (!safe) return '';
        return safe
            .toString()
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }

    function showLoading(message = '加载中...') {
        mainContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">${escapeHtml(message)}</div>
                <div class="loading-tips">数据正在加载，请稍候...</div>
            </div>`;
    }

    function showError(message) {
        mainContent.innerHTML = `<div class="error-container"><i class="fas fa-exclamation-triangle"></i><div>${escapeHtml(message)}</div></div>`;
    }

    // --- API HELPERS ---
    const api = {
        getTopLists: async () => {
            const cacheKey = getCacheKey('toplists', {});
            const cached = getCache(cacheKey);
            if (cached) {
                console.log('Using cached toplists');
                return cached;
            }
            
            const result = await fetch(`${API_BASE_URL}/toplists`).then(res => res.json());
            setCache(cacheKey, result);
            return result;
        },
        
        getPlaylist: async (id) => {
            const cacheKey = getCacheKey('playlist', { id });
            const cached = getCache(cacheKey);
            if (cached) {
                console.log('Using cached playlist:', id);
                return cached;
            }
            
            const result = await fetch(`${API_BASE_URL}/playlist?id=${id}`).then(res => res.json());
            setCache(cacheKey, result);
            return result;
        },
        
        search: (query) => fetch(`${API_BASE_URL}/search?query=${query}&type=music`).then(res => res.json()),
        getSongUrl: (id, quality) => fetch(`${API_BASE_URL}/song/url?id=${id}&quality=${quality}`).then(res => res.json()),
        getLyric: (id) => fetch(`${API_BASE_URL}/lyric?id=${id}`).then(res => res.json()),
        importPlaylist: (url) => fetch(`${API_BASE_URL}/import-playlist?url=${encodeURIComponent(url)}`).then(res => res.json()),
    };

    // --- LAZY LOADING ---
    function setupLazyLoading() {
        if (state.lazyLoadObserver) {
            state.lazyLoadObserver.disconnect();
        }

        state.lazyLoadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    if (element.dataset.id && !element.dataset.loaded) {
                        element.dataset.loaded = 'true';
                        loadPlaylistData(element);
                    }
                }
            });
        }, {
            rootMargin: '100px'
        });
    }

    function loadPlaylistData(element) {
        const id = element.dataset.id;
        const title = element.querySelector('p').textContent;
        
        // 预加载歌单数据
        api.getPlaylist(id).then(result => {
            console.log(`Preloaded playlist: ${title}`);
        }).catch(error => {
            console.log(`Failed to preload playlist: ${title}`, error);
        });
    }

    // --- UI RENDERING ---
    function renderTopLists(lists) {
        console.log('Rendering toplists:', lists);
        mainContent.innerHTML = '<div class="top-lists"></div>';
        const container = mainContent.querySelector('.top-lists');
        
        lists.forEach((group, groupIndex) => {
            if (group.data && group.data.length > 0) {
                group.data.forEach((list, listIndex) => {
                    const item = document.createElement('div');
                    item.className = 'list-item';
                    item.dataset.id = list.id;
                    item.style.animationDelay = `${(groupIndex * group.data.length + listIndex) * 0.1}s`;
                    
                    const imageUrl = fixImageUrl(list.coverImg);
                    const title = escapeHtml(list.title || '未知标题');
                    const description = escapeHtml(list.description || '');
                    
                    item.innerHTML = `
                        <img src="${imageUrl}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"200\\"><rect width=\\"200\\" height=\\"200\\" fill=\\"%23333\\"/><text x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" fill=\\"white\\" font-size=\\"16\\">${escapeHtml(list.title || '榜单')}</text></svg>'">
                        <p>${title}</p>
                        <small>${description}</small>
                    `;
                    item.addEventListener('click', () => loadPlaylist(list.id, unescapeHtml(title)));
                    container.appendChild(item);
                    
                    // 添加到懒加载观察器
                    if (state.lazyLoadObserver) {
                        state.lazyLoadObserver.observe(item);
                    }
                });
            }
        });
        
        // 添加导入歌单选项
        const importItem = document.createElement('div');
        importItem.className = 'list-item import-item';
        importItem.innerHTML = `
            <div class="import-content">
                <i class="fas fa-plus"></i>
                <p>导入歌单</p>
            </div>
        `;
        importItem.addEventListener('click', showImportDialog);
        container.appendChild(importItem);
    }

    function renderPlaylist(playlist, title = '歌单') {
        console.log('Rendering playlist:', playlist);
        const safeTitle = escapeHtml(title);
        mainContent.innerHTML = `
            <div class="playlist-header">
                <button onclick="showHomePage()" class="back-btn">
                    <i class="fas fa-arrow-left"></i> 返回主页
                </button>
                <h2>${safeTitle} (${playlist.length} 首)</h2>
            </div>
            <div class="playlist"></div>
        `;
        const container = mainContent.querySelector('.playlist');
        state.currentPlaylist = playlist;
        
        playlist.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'song-item';
            item.dataset.index = index;
            item.style.animationDelay = `${index * 0.02}s`;
            
            const imageUrl = fixImageUrl(song.artwork);
            const songTitle = escapeHtml(song.title || '未知歌曲');
            const songArtist = escapeHtml(song.artist || '未知歌手');
            
            item.innerHTML = `
                <span class="song-number">${(index + 1).toString().padStart(2, '0')}</span>
                <img src="${imageUrl}" alt="${songTitle}" class="artwork" width="40" height="40" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"40\\" height=\\"40\\"><rect width=\\"40\\" height=\\"40\\" fill=\\"%23555\\"/></svg>'">
                <div class="song-item-info">
                    <p class="song-title" title="${songTitle}">${songTitle}</p>
                    <p class="song-artist" title="${songArtist}">${songArtist}</p>
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
            renderPlaylist(results.data, '搜索结果');
        } else {
            showError('搜索结果为空');
        }
    }

    // --- IMPORT PLAYLIST DIALOG ---
    function showImportDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>导入歌单</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <input type="text" id="importUrl" placeholder="请输入网易云音乐歌单链接或ID" class="import-input">
                    <div class="modal-tips">
                        <p>支持格式：</p>
                        <ul>
                            <li>完整分享链接</li>
                            <li>歌单ID（纯数字）</li>
                        </ul>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="this.closest('.modal-overlay').remove()" class="btn-cancel">取消</button>
                    <button onclick="importPlaylist()" class="btn-confirm">导入</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        document.getElementById('importUrl').focus();
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    // --- LYRIC MODAL ---
    function showLyricModal() {
        const modal = document.createElement('div');
        modal.className = 'lyric-modal-overlay';
        const currentSongTitle = escapeHtml(state.currentSong?.title || '未知歌曲');
        const currentSongArtist = escapeHtml(state.currentSong?.artist || '未知歌手');
        
        modal.innerHTML = `
            <div class="lyric-modal">
                <div class="lyric-modal-header">
                    <div class="song-info">
                        <img src="${fixImageUrl(state.currentSong?.artwork)}" alt="歌曲封面" class="modal-artwork">
                        <div>
                            <h3>${currentSongTitle}</h3>
                            <p>${currentSongArtist}</p>
                        </div>
                    </div>
                    <button class="close-btn" onclick="this.closest('.lyric-modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="lyric-modal-content" id="modalLyricContent">
                    ${lyricContent.innerHTML}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 自动滚动到当前歌词
        setTimeout(() => {
            const activeLine = modal.querySelector('.lyric-line.active');
            if (activeLine) {
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // --- PLAYER LOGIC ---
    function loadPlaylist(id, title = '歌单') {
        showLoading('正在加载歌单...');
        api.getPlaylist(id).then(result => {
            if (result && result.data) {
                renderPlaylist(result.data, title);
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
        updatePlaylistUI();
    }

    function updatePlaylistUI() {
        const songItems = document.querySelectorAll('.song-item');
        songItems.forEach((item, index) => {
            const playBtn = item.querySelector('.action-btn i');
            if (index === state.currentIndex && state.isPlaying) {
                item.classList.add('playing');
                playBtn.className = 'fas fa-pause';
            } else {
                item.classList.remove('playing');
                playBtn.className = 'fas fa-play';
            }
        });
    }

    function updatePlayerUI() {
        if (!state.currentSong) return;
        const imageUrl = fixImageUrl(state.currentSong.artwork);
        songArtwork.src = imageUrl;
        songTitle.textContent = unescapeHtml(state.currentSong.title || '未知歌曲');
        songArtist.textContent = unescapeHtml(state.currentSong.artist || '未知歌手');
        playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    async function loadSongMedia() {
        try {
            state.isBuffering = true;
            updateBufferProgress(0);
            
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
        } finally {
            state.isBuffering = false;
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
        updatePlaylistUI();
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
        if (!state.isDragging && audioPlayer.duration) {
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressBar.value = progress;
            progressFill.style.width = `${progress}%`;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
            totalDurationEl.textContent = formatTime(audioPlayer.duration);
            updateLyricHighlight();
        }
    }

    function updateBufferProgress(buffered) {
        if (progressBuffer) {
            progressBuffer.style.width = `${buffered}%`;
        }
    }

    function seek() {
        if (audioPlayer.duration) {
            const newTime = (progressBar.value / 100) * audioPlayer.duration;
            audioPlayer.currentTime = newTime;
            progressFill.style.width = `${progressBar.value}%`;
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
            p.className = 'lyric-line';
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
            // 更新隐藏面板歌词
            const allLines = document.querySelectorAll('.lyric-line');
            allLines.forEach((p, index) => {
                if (index === activeLine) {
                    p.classList.add('active');
                    // 平滑滚动到当前歌词
                    if (p.parentElement && p.parentElement.scrollTo) {
                        const container = p.parentElement;
                        const containerHeight = container.clientHeight;
                        const elementTop = p.offsetTop;
                        const elementHeight = p.clientHeight;
                        const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
                        
                        container.scrollTo({
                            top: scrollTop,
                            behavior: 'smooth'
                        });
                    }
                } else {
                    p.classList.remove('active');
                }
            });
            
            // 同步模态框中的歌词
            const modalLines = document.querySelectorAll('#modalLyricContent .lyric-line');
            modalLines.forEach((p, index) => {
                if (index === activeLine) {
                    p.classList.add('active');
                    if (p.parentElement && p.parentElement.scrollTo) {
                        const container = p.parentElement;
                        const containerHeight = container.clientHeight;
                        const elementTop = p.offsetTop;
                        const elementHeight = p.clientHeight;
                        const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
                        
                        container.scrollTo({
                            top: scrollTop,
                            behavior: 'smooth'
                        });
                    }
                } else {
                    p.classList.remove('active');
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
            showLoading('正在导入歌单...');
            const result = await api.importPlaylist(url);
            if (result && result.data) {
                renderPlaylist(result.data, '导入的歌单');
                document.querySelector('.modal-overlay').remove();
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
        a.download = `${unescapeHtml(state.currentSong.title)} - ${unescapeHtml(state.currentSong.artist)}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', togglePlayPause);
        prevBtn.addEventListener('click', prevSong);
        nextBtn.addEventListener('click', nextSong);
        
        // 优化进度条拖拽体验
        progressBar.addEventListener('mousedown', () => {
            state.isDragging = true;
        });
        
        progressBar.addEventListener('mouseup', () => {
            state.isDragging = false;
            seek();
        });
        
        progressBar.addEventListener('input', () => {
            if (state.isDragging) {
                const progress = progressBar.value;
                progressFill.style.width = `${progress}%`;
                if (audioPlayer.duration) {
                    currentTimeEl.textContent = formatTime((progress / 100) * audioPlayer.duration);
                }
            }
        });
        
        progressBar.addEventListener('change', seek);
        
        // 音频事件监听
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('ended', nextSong);
        audioPlayer.addEventListener('loadstart', () => {
            state.isBuffering = true;
            updateBufferProgress(0);
        });
        audioPlayer.addEventListener('progress', () => {
            if (audioPlayer.buffered.length > 0 && audioPlayer.duration) {
                const buffered = (audioPlayer.buffered.end(0) / audioPlayer.duration) * 100;
                updateBufferProgress(buffered);
            }
        });
        audioPlayer.addEventListener('canplay', () => {
            state.isBuffering = false;
        });
        
        searchBtn.addEventListener('click', () => {
            if (searchInput.value) {
                showLoading('正在搜索...');
                api.search(searchInput.value).then(renderSearchResults).catch(error => {
                    console.error('Search failed:', error);
                    showError('搜索失败');
                });
            }
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value) {
                showLoading('正在搜索...');
                api.search(searchInput.value).then(renderSearchResults).catch(error => {
                    console.error('Search failed:', error);
                    showError('搜索失败');
                });
            }
        });

        lyricBtn.addEventListener('click', () => {
            if (state.currentSong) {
                showLyricModal();
            } else {
                alert('请先播放一首歌曲');
            }
        });
        
        qualitySelect.addEventListener('change', () => {
            if (state.currentSong) {
                loadSongMedia();
            }
        });
        
        downloadBtn.addEventListener('click', downloadSong);
    }

    // --- INITIALIZATION ---
    function init() {
        showLoading('正在加载排行榜...');
        setupLazyLoading();
        
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
