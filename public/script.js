document.addEventListener('DOMContentLoaded', () => {
    // --- THEME MANAGEMENT ---
    const themeManager = {
        // 获取当前主题
        getCurrentTheme() {
            return localStorage.getItem('theme') || 'dark';
        },
        
        // 设置主题
        setTheme(theme) {
            const body = document.body;
            const themeToggle = document.querySelector('.theme-toggle');
            const themeIcon = themeToggle?.querySelector('.theme-icon') || themeToggle?.querySelector('i');
            
            if (theme === 'light') {
                body.setAttribute('data-theme', 'light');
                if (themeIcon) {
                    themeIcon.className = 'fas fa-sun theme-icon';
                }
                themeToggle?.classList.add('light');
            } else {
                body.removeAttribute('data-theme');
                if (themeIcon) {
                    themeIcon.className = 'fas fa-moon theme-icon';
                }
                themeToggle?.classList.remove('light');
            }
            
            localStorage.setItem('theme', theme);
        },
        
        // 切换主题
        toggleTheme() {
            const currentTheme = this.getCurrentTheme();
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            this.setTheme(newTheme);
        },
        
        // 初始化主题
        init() {
            const savedTheme = this.getCurrentTheme();
            this.setTheme(savedTheme);
            
            // 添加主题切换按钮事件
            const themeToggle = document.querySelector('.theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', () => {
                    this.toggleTheme();
                });
            }
        }
    };

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
        lyricScrollTimer: null,
        activeLyricIndex: -1,
    };

    // --- CONSTANTS ---
    const API_BASE_URL = '/api';
    const CACHE_DURATION = 10 * 60 * 1000; // 10分钟
    const DEFAULT_ARTWORK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="white" font-size="20"%3E封面%3C/text%3E%3C/svg%3E';
    const SMALL_ARTWORK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="%23555"/%3E%3C/svg%3E';

    // --- DOM ELEMENTS ---
    const elements = {
        mainContent: document.getElementById('mainContent'),
        searchInput: document.getElementById('searchInput'),
        searchBtn: document.getElementById('searchBtn'),
        player: document.getElementById('player'),
        playPauseBtn: document.getElementById('playPauseBtn'),
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        songArtwork: document.getElementById('songArtwork'),
        songTitle: document.getElementById('songTitle'),
        songArtist: document.getElementById('songArtist'),
        progressBar: document.getElementById('progressBar'),
        progressFill: document.getElementById('progressFill'),
        progressBuffer: document.getElementById('progressBuffer'),
        currentTimeEl: document.getElementById('currentTime'),
        totalDurationEl: document.getElementById('totalDuration'),
        volumeBtn: document.getElementById('volumeBtn'),
        volumeSlider: document.getElementById('volumeSlider'),
        qualitySelect: document.getElementById('qualitySelect'),
        downloadBtn: document.getElementById('downloadBtn'),
        lyricBtn: document.getElementById('lyricBtn'),
        lyricPanel: document.getElementById('lyricPanel'),
        lyricContent: document.getElementById('lyricContent'),
        audioPlayer: document.getElementById('audioPlayer'),
    };

    // --- UTILITY FUNCTIONS ---
    function fixImageUrl(url) {
        if (!url) return DEFAULT_ARTWORK;
        return url.replace(/^http:/, 'https:');
    }

    // 彻底解决字符串问题的函数
    function safeText(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function unescapeText(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.innerHTML = str;
        return div.textContent || div.innerText || '';
    }

    function createElement(tag, className = '', innerHTML = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    function showLoading(message = '加载中...') {
        elements.mainContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">${safeText(message)}</div>
                <div class="loading-tips">数据正在加载，请稍候...</div>
            </div>`;
    }

    function showError(message) {
        elements.mainContent.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <div>${safeText(message)}</div>
            </div>`;
    }

    // --- CACHE HELPERS ---
    function getCacheKey(type, params) {
        return `${type}_${JSON.stringify(params)}`;
    }

    function getCache(key) {
        const cached = state.cache.get(key);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
        state.cache.delete(key);
        return null;
    }

    function setCache(key, data) {
        state.cache.set(key, { data, timestamp: Date.now() });
    }

    // --- API HELPERS ---
    const api = {
        async request(url, timeout = 10000) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const response = await fetch(url, { signal: controller.signal });
                return await response.json();
            } finally {
                clearTimeout(timeoutId);
            }
        },

        async getTopLists() {
            const cacheKey = getCacheKey('toplists', {});
            const cached = getCache(cacheKey);
            if (cached) return cached;
            
            const result = await this.request(`${API_BASE_URL}/toplists`);
            setCache(cacheKey, result);
            return result;
        },
        
        async getPlaylist(id) {
            const cacheKey = getCacheKey('playlist', { id });
            const cached = getCache(cacheKey);
            if (cached) return cached;
            
            const result = await this.request(`${API_BASE_URL}/playlist?id=${id}`, 15000);
            setCache(cacheKey, result);
            return result;
        },
        
        async search(query) {
            return await this.request(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}&type=music`, 8000);
        },
        
        async getSongUrl(id, quality) {
            return await this.request(`${API_BASE_URL}/song/url?id=${id}&quality=${quality}`, 5000);
        },
        
        async getLyric(id) {
            const cacheKey = getCacheKey('lyric', { id });
            const cached = getCache(cacheKey);
            if (cached) return cached;
            
            const result = await this.request(`${API_BASE_URL}/lyric?id=${id}`, 5000);
            setCache(cacheKey, result);
            return result;
        },
        
        async importPlaylist(url) {
            return await this.request(`${API_BASE_URL}/import-playlist?url=${encodeURIComponent(url)}`, 30000);
        },
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
                        preloadPlaylist(element);
                    }
                }
            });
        }, { rootMargin: '50px' });
    }

    function preloadPlaylist(element) {
        const id = element.dataset.id;
        api.getPlaylist(id).catch(() => {});
    }

    // --- UI RENDERING ---
    function renderTopLists(lists) {
        const container = createElement('div', 'top-lists');
        elements.mainContent.innerHTML = '';
        elements.mainContent.appendChild(container);
        
        lists.forEach((group, groupIndex) => {
            if (group.data && group.data.length > 0) {
                group.data.forEach((list, listIndex) => {
                    const item = createElement('div', 'list-item');
                    item.dataset.id = list.id;
                    item.style.animationDelay = `${(groupIndex * group.data.length + listIndex) * 0.03}s`;
                    
                    const img = createElement('img');
                    img.src = fixImageUrl(list.coverImg);
                    img.alt = list.title || '未知标题';
                    img.loading = 'lazy';
                    img.onerror = () => { img.src = DEFAULT_ARTWORK; };
                    
                    const title = createElement('p');
                    title.textContent = list.title || '未知标题';
                    
                    const desc = createElement('small');
                    desc.textContent = list.description || '';
                    
                    item.appendChild(img);
                    item.appendChild(title);
                    item.appendChild(desc);
                    
                    item.addEventListener('click', () => loadPlaylist(list.id, list.title));
                    container.appendChild(item);
                    
                    if (state.lazyLoadObserver) {
                        state.lazyLoadObserver.observe(item);
                    }
                });
            }
        });
        
        // 添加导入歌单选项
        const importItem = createElement('div', 'list-item import-item');
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
        elements.mainContent.innerHTML = `
            <div class="playlist-header">
                <button class="back-btn" onclick="showHomePage()">
                    <i class="fas fa-arrow-left"></i> 返回主页
                </button>
                <h2>${safeText(title)} (${playlist.length} 首)</h2>
            </div>
            <div class="playlist"></div>
        `;
        
        const container = elements.mainContent.querySelector('.playlist');
        const fragment = document.createDocumentFragment();
        state.currentPlaylist = playlist;
        
        playlist.forEach((song, index) => {
            const item = createElement('div', 'song-item');
            item.dataset.index = index;
            item.style.animationDelay = `${index * 0.01}s`;
            
            const number = createElement('span', 'song-number');
            number.textContent = String(index + 1).padStart(2, '0');
            
            const img = createElement('img', 'artwork');
            img.src = fixImageUrl(song.artwork);
            img.alt = song.title || '未知歌曲';
            img.width = 40;
            img.height = 40;
            img.loading = 'lazy';
            img.onerror = () => { img.src = SMALL_ARTWORK; };
            
            const info = createElement('div', 'song-item-info');
            const songTitle = createElement('p', 'song-title');
            songTitle.textContent = song.title || '未知歌曲';
            songTitle.title = song.title || '未知歌曲';
            
            const songArtist = createElement('p', 'song-artist');
            songArtist.textContent = song.artist || '未知歌手';
            songArtist.title = song.artist || '未知歌手';
            
            info.appendChild(songTitle);
            info.appendChild(songArtist);
            
            const actions = createElement('div', 'song-actions');
            const playBtn = createElement('button', 'action-btn');
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            playBtn.title = '播放';
            playBtn.onclick = (e) => {
                e.stopPropagation();
                playSong(index);
            };
            actions.appendChild(playBtn);
            
            item.appendChild(number);
            item.appendChild(img);
            item.appendChild(info);
            item.appendChild(actions);
            
            item.addEventListener('click', () => playSong(index));
            fragment.appendChild(item);
        });
        
        container.appendChild(fragment);
    }

    // --- 全新的歌词页面 ---
    function createLyricPage() {
        if (!state.currentSong) {
            alert('请先播放一首歌曲');
            return;
        }

        // 移除已存在的歌词页面
        const existingPage = document.getElementById('lyricPage');
        if (existingPage) {
            existingPage.remove();
        }

        const lyricPage = createElement('div', 'lyric-page');
        lyricPage.id = 'lyricPage';
        
        // 背景层
        const background = createElement('div', 'lyric-bg');
        const bgImg = createElement('img', 'lyric-bg-img');
        bgImg.src = fixImageUrl(state.currentSong.artwork);
        const overlay = createElement('div', 'lyric-bg-overlay');
        background.appendChild(bgImg);
        background.appendChild(overlay);
        
        // 顶部栏
        const header = createElement('div', 'lyric-header');
        const closeBtn = createElement('button', 'lyric-close');
        closeBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        closeBtn.onclick = closeLyricPage;
        
        const songInfo = createElement('div', 'lyric-song-info');
        const songTitleEl = createElement('h3');
        songTitleEl.textContent = state.currentSong.title || '未知歌曲';
        const songArtistEl = createElement('p');
        songArtistEl.textContent = state.currentSong.artist || '未知歌手';
        songInfo.appendChild(songTitleEl);
        songInfo.appendChild(songArtistEl);
        
        const fullscreenBtn = createElement('button', 'lyric-fullscreen');
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.onclick = toggleLyricFullscreen;
        
        header.appendChild(closeBtn);
        header.appendChild(songInfo);
        header.appendChild(fullscreenBtn);
        
        // 歌词内容
        const content = createElement('div', 'lyric-content');
        content.id = 'lyricScrollArea';
        renderLyricsInPage(content);
        
        // 底部播放器
        const player = createElement('div', 'lyric-player');
        
        // 进度条
        const progressContainer = createElement('div', 'lyric-progress-container');
        const progressBar = createElement('div', 'lyric-progress-bar');
        const progressFill = createElement('div', 'lyric-progress-fill');
        progressFill.id = 'lyricProgressFill';
        progressBar.appendChild(progressFill);
        
        const timeInfo = createElement('div', 'lyric-time-info');
        const currentTime = createElement('span');
        currentTime.id = 'lyricCurrentTime';
        currentTime.textContent = '0:00';
        const duration = createElement('span');
        duration.id = 'lyricDuration';
        duration.textContent = '0:00';
        timeInfo.appendChild(currentTime);
        timeInfo.appendChild(duration);
        
        progressContainer.appendChild(progressBar);
        progressContainer.appendChild(timeInfo);
        
        // 控制按钮
        const controls = createElement('div', 'lyric-controls');
        const prevBtn = createElement('button', 'lyric-control-btn');
        prevBtn.innerHTML = '<i class="fas fa-step-backward"></i>';
        prevBtn.onclick = prevSong;
        
        const playBtn = createElement('button', 'lyric-control-btn lyric-play-btn');
        playBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        playBtn.id = 'lyricPlayBtn';
        playBtn.onclick = togglePlayPause;
        
        const nextBtn = createElement('button', 'lyric-control-btn');
        nextBtn.innerHTML = '<i class="fas fa-step-forward"></i>';
        nextBtn.onclick = nextSong;
        
        const volumeBtn = createElement('button', 'lyric-control-btn');
        const currentVolume = elements.audioPlayer.volume * 100;
        if (currentVolume == 0) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (currentVolume < 30) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
        volumeBtn.onclick = toggleMute;
        
        controls.appendChild(prevBtn);
        controls.appendChild(playBtn);
        controls.appendChild(nextBtn);
        controls.appendChild(volumeBtn);
        
        player.appendChild(progressContainer);
        player.appendChild(controls);
        
        // 组装页面
        lyricPage.appendChild(background);
        lyricPage.appendChild(header);
        lyricPage.appendChild(content);
        lyricPage.appendChild(player);
        
        // 添加手势支持
        setupLyricGestures(lyricPage);
        
        // 添加到页面
        document.body.appendChild(lyricPage);
        
        // 动画效果
        requestAnimationFrame(() => {
            lyricPage.classList.add('show');
        });
        
        // 更新进度
        updateLyricPageProgress();
        
        // 自动滚动到当前歌词
        setTimeout(() => scrollToActiveLyric(), 300);
    }

    function renderLyricsInPage(container) {
        container.innerHTML = '';
        
        if (state.lyrics.length === 0) {
            const placeholder = createElement('div', 'lyric-placeholder');
            placeholder.textContent = '暂无歌词';
            container.appendChild(placeholder);
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        state.lyrics.forEach((lyric, index) => {
            const line = createElement('div', 'lyric-line');
            line.textContent = lyric.text;
            line.dataset.time = lyric.time;
            line.dataset.index = index;
            
            line.addEventListener('click', () => {
                elements.audioPlayer.currentTime = lyric.time;
                updateLyricHighlight();
            });
            
            fragment.appendChild(line);
        });
        
        container.appendChild(fragment);
    }

    function setupLyricGestures(lyricPage) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startTime = 0;
        
        const header = lyricPage.querySelector('.lyric-header');
        
        function handleStart(clientY) {
            startY = clientY;
            startTime = Date.now();
            isDragging = true;
            lyricPage.style.transition = 'none';
        }
        
        function handleMove(clientY) {
            if (!isDragging) return;
            
            currentY = clientY;
            const deltaY = currentY - startY;
            
            if (deltaY > 0) {
                const progress = Math.min(deltaY / window.innerHeight, 1);
                const scale = 1 - progress * 0.05;
                const opacity = 1 - progress * 0.3;
                
                lyricPage.style.transform = `translateY(${deltaY}px) scale(${scale})`;
                lyricPage.style.opacity = opacity;
            }
        }
        
        function handleEnd() {
            if (!isDragging) return;
            isDragging = false;
            
            const deltaY = currentY - startY;
            const deltaTime = Date.now() - startTime;
            const velocity = deltaY / deltaTime;
            
            lyricPage.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            
            if (deltaY > window.innerHeight * 0.25 || velocity > 0.3) {
                closeLyricPage();
            } else {
                lyricPage.style.transform = 'translateY(0) scale(1)';
                lyricPage.style.opacity = '1';
            }
        }
        
        // 触摸事件
        header.addEventListener('touchstart', (e) => {
            handleStart(e.touches[0].clientY);
        }, { passive: true });
        
        header.addEventListener('touchmove', (e) => {
            handleMove(e.touches[0].clientY);
            e.preventDefault();
        }, { passive: false });
        
        header.addEventListener('touchend', handleEnd, { passive: true });
        
        // 鼠标事件
        header.addEventListener('mousedown', (e) => {
            handleStart(e.clientY);
            
            const handleMouseMove = (e) => handleMove(e.clientY);
            const handleMouseUp = () => {
                handleEnd();
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    function closeLyricPage() {
        const lyricPage = document.getElementById('lyricPage');
        if (lyricPage) {
            lyricPage.classList.add('hide');
            setTimeout(() => {
                if (lyricPage.parentNode) {
                    lyricPage.parentNode.removeChild(lyricPage);
                }
            }, 300);
        }
    }

    function toggleLyricFullscreen() {
        const lyricPage = document.getElementById('lyricPage');
        if (lyricPage) {
            lyricPage.classList.toggle('fullscreen');
            const icon = lyricPage.querySelector('.lyric-fullscreen i');
            if (icon) {
                icon.className = lyricPage.classList.contains('fullscreen') ? 'fas fa-compress' : 'fas fa-expand';
            }
        }
    }

    function scrollToActiveLyric() {
        const container = document.getElementById('lyricScrollArea');
        const activeLine = container?.querySelector('.lyric-line.active');
        
        if (container && activeLine) {
            const containerHeight = container.clientHeight;
            const lineTop = activeLine.offsetTop;
            const lineHeight = activeLine.clientHeight;
            const scrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);
            
            container.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
        }
    }

    function updateLyricPageProgress() {
        const progressFill = document.getElementById('lyricProgressFill');
        const currentTime = document.getElementById('lyricCurrentTime');
        const duration = document.getElementById('lyricDuration');
        
        if (progressFill && elements.audioPlayer.duration) {
            const progress = (elements.audioPlayer.currentTime / elements.audioPlayer.duration) * 100;
            progressFill.style.width = `${progress}%`;
        }
        
        if (currentTime) {
            currentTime.textContent = formatTime(elements.audioPlayer.currentTime);
        }
        
        if (duration) {
            duration.textContent = formatTime(elements.audioPlayer.duration);
        }
    }

    // --- IMPORT DIALOG ---
    function showImportDialog() {
        const overlay = createElement('div', 'modal-overlay');
        overlay.innerHTML = `
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
        
        document.body.appendChild(overlay);
        document.getElementById('importUrl').focus();
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
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
            console.error('加载歌单失败:', error);
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
                if (playBtn) playBtn.className = 'fas fa-pause';
            } else {
                item.classList.remove('playing');
                if (playBtn) playBtn.className = 'fas fa-play';
            }
        });
    }

    function updatePlayerUI() {
        if (!state.currentSong) return;
        
        elements.songArtwork.src = fixImageUrl(state.currentSong.artwork);
        elements.songTitle.textContent = state.currentSong.title || '未知歌曲';
        elements.songArtist.textContent = state.currentSong.artist || '未知歌手';
        elements.playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        
        // 更新歌词页面播放按钮
        const lyricPlayBtn = document.getElementById('lyricPlayBtn');
        if (lyricPlayBtn) {
            lyricPlayBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        }
    }

    async function loadSongMedia() {
        try {
            state.isBuffering = true;
            updateBufferProgress(0);
            
            const quality = elements.qualitySelect.value;
            const result = await api.getSongUrl(state.currentSong.id, quality);
            if (result && result.url) {
                elements.audioPlayer.src = result.url;
                elements.audioPlayer.play();
            } else {
                alert('获取歌曲链接失败，可能是VIP或无版权歌曲。');
                nextSong();
            }
        } catch (error) {
            console.error('播放失败:', error);
            alert('播放失败');
        } finally {
            state.isBuffering = false;
        }
    }

    function togglePlayPause() {
        if (!state.currentSong) return;
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            elements.audioPlayer.play();
        } else {
            elements.audioPlayer.pause();
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
        if (!state.isDragging && elements.audioPlayer.duration) {
            const progress = (elements.audioPlayer.currentTime / elements.audioPlayer.duration) * 100;
            elements.progressBar.value = progress;
            elements.progressFill.style.width = `${progress}%`;
            elements.currentTimeEl.textContent = formatTime(elements.audioPlayer.currentTime);
            elements.totalDurationEl.textContent = formatTime(elements.audioPlayer.duration);
            
            // 更新歌词页面进度（节流）
            if (state.lyricScrollTimer) clearTimeout(state.lyricScrollTimer);
            state.lyricScrollTimer = setTimeout(() => {
                updateLyricPageProgress();
                updateLyricHighlight();
            }, 100);
        }
    }

    function updateBufferProgress(buffered) {
        if (elements.progressBuffer) {
            elements.progressBuffer.style.width = `${buffered}%`;
        }
    }

    function seek() {
        if (elements.audioPlayer.duration) {
            const newTime = (elements.progressBar.value / 100) * elements.audioPlayer.duration;
            elements.audioPlayer.currentTime = newTime;
            elements.progressFill.style.width = `${elements.progressBar.value}%`;
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // --- VOLUME CONTROL ---
    function initVolumeControl() {
        // 从localStorage获取保存的音量，默认50%
        const savedVolume = localStorage.getItem('volume') || '50';
        elements.volumeSlider.value = savedVolume;
        elements.audioPlayer.volume = savedVolume / 100;
        updateVolumeIcon(savedVolume);
    }

    function setVolume(volume) {
        volume = Math.max(0, Math.min(100, volume));
        elements.volumeSlider.value = volume;
        elements.audioPlayer.volume = volume / 100;
        localStorage.setItem('volume', volume);
        updateVolumeIcon(volume);
    }

    function updateVolumeIcon(volume) {
        const icon = elements.volumeBtn.querySelector('i');
        const btn = elements.volumeBtn;
        
        // 移除所有音量状态类
        btn.classList.remove('volume-btn-muted', 'volume-btn-low', 'volume-btn-high');
        
        if (volume == 0) {
            icon.className = 'fas fa-volume-mute';
            btn.classList.add('volume-btn-muted');
        } else if (volume < 30) {
            icon.className = 'fas fa-volume-down';
            btn.classList.add('volume-btn-low');
        } else if (volume < 70) {
            icon.className = 'fas fa-volume-up';
            btn.classList.add('volume-btn-high');
        } else {
            icon.className = 'fas fa-volume-up';
            btn.classList.add('volume-btn-high');
        }
    }

    function toggleMute() {
        const currentVolume = elements.audioPlayer.volume * 100;
        const savedVolume = localStorage.getItem('lastVolume') || '50';
        
        if (currentVolume > 0) {
            // 静音
            localStorage.setItem('lastVolume', currentVolume.toString());
            setVolume(0);
        } else {
            // 取消静音
            setVolume(savedVolume);
        }
    }

    function adjustVolume(delta) {
        const currentVolume = elements.volumeSlider.value;
        const newVolume = parseInt(currentVolume) + delta;
        setVolume(newVolume);
    }

    // --- LYRIC LOGIC ---
    async function loadLyrics() {
        elements.lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">加载歌词中...</div>';
        state.lyrics = [];
        
        try {
            const result = await api.getLyric(state.currentSong.id);
            if (result && result.rawLrc) {
                parseLyrics(result.rawLrc);
            } else {
                elements.lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>';
            }
        } catch (error) {
            console.error('歌词加载失败:', error);
            elements.lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #ff6b6b;">歌词加载失败</div>';
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
        
        // 更新歌词页面
        const lyricScrollArea = document.getElementById('lyricScrollArea');
        if (lyricScrollArea) {
            renderLyricsInPage(lyricScrollArea);
        }
    }
    
    function renderLyrics() {
        if (state.lyrics.length === 0) {
            elements.lyricContent.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        state.lyrics.forEach((lyric, index) => {
            const line = createElement('p', 'lyric-line');
            line.textContent = lyric.text;
            line.dataset.time = lyric.time;
            line.dataset.index = index;
            line.addEventListener('click', () => {
                elements.audioPlayer.currentTime = lyric.time;
            });
            fragment.appendChild(line);
        });
        
        elements.lyricContent.innerHTML = '';
        elements.lyricContent.appendChild(fragment);
    }

    function updateLyricHighlight() {
        const currentTime = elements.audioPlayer.currentTime;
        let activeLine = -1;
        
        for (let i = 0; i < state.lyrics.length; i++) {
            if (currentTime >= state.lyrics[i].time) {
                activeLine = i;
            } else {
                break;
            }
        }

        if (activeLine !== state.activeLyricIndex) {
            state.activeLyricIndex = activeLine;
            
            // 更新隐藏面板歌词
            const allLines = document.querySelectorAll('#lyricContent .lyric-line');
            allLines.forEach((line, index) => {
                line.classList.toggle('active', index === activeLine);
            });
            
            // 更新歌词页面
            const pageLines = document.querySelectorAll('#lyricScrollArea .lyric-line');
            pageLines.forEach((line, index) => {
                line.classList.toggle('active', index === activeLine);
            });
            
            // 自动滚动
            if (activeLine >= 0) {
                scrollToActiveLyric();
            }
        }
    }

    // --- DOWNLOAD LOGIC ---
    function downloadSong() {
        if (!state.currentSong) {
            alert('请先选择一首歌');
            return;
        }
        const a = createElement('a');
        a.href = elements.audioPlayer.src;
        a.download = `${state.currentSong.title} - ${state.currentSong.artist}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // 播放控制
        elements.playPauseBtn.addEventListener('click', togglePlayPause);
        elements.prevBtn.addEventListener('click', prevSong);
        elements.nextBtn.addEventListener('click', nextSong);
        
        // 进度条
        elements.progressBar.addEventListener('mousedown', () => {
            state.isDragging = true;
        });
        
        elements.progressBar.addEventListener('mouseup', () => {
            state.isDragging = false;
            seek();
        });
        
        elements.progressBar.addEventListener('input', () => {
            if (state.isDragging) {
                const progress = elements.progressBar.value;
                elements.progressFill.style.width = `${progress}%`;
                if (elements.audioPlayer.duration) {
                    elements.currentTimeEl.textContent = formatTime((progress / 100) * elements.audioPlayer.duration);
                }
            }
        });
        
        elements.progressBar.addEventListener('change', seek);
        
        // 音频事件
        elements.audioPlayer.addEventListener('timeupdate', updateProgress);
        elements.audioPlayer.addEventListener('ended', nextSong);
        elements.audioPlayer.addEventListener('loadstart', () => {
            state.isBuffering = true;
            updateBufferProgress(0);
        });
        elements.audioPlayer.addEventListener('progress', () => {
            if (elements.audioPlayer.buffered.length > 0 && elements.audioPlayer.duration) {
                const buffered = (elements.audioPlayer.buffered.end(0) / elements.audioPlayer.duration) * 100;
                updateBufferProgress(buffered);
            }
        });
        elements.audioPlayer.addEventListener('canplay', () => {
            state.isBuffering = false;
        });
        
        // 搜索功能
        const performSearch = () => {
            const query = elements.searchInput.value.trim();
            if (query) {
                showLoading('正在搜索...');
                api.search(query).then(result => {
                    if (result && result.data) {
                        renderPlaylist(result.data, '搜索结果');
                    } else {
                        showError('搜索结果为空');
                    }
                }).catch(error => {
                    console.error('搜索失败:', error);
                    showError('搜索失败');
                });
            }
        };
        
        elements.searchBtn.addEventListener('click', performSearch);
        elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // 歌词按钮
        elements.lyricBtn.addEventListener('click', createLyricPage);
        
        // 音量控制
        elements.volumeBtn.addEventListener('click', toggleMute);
        elements.volumeSlider.addEventListener('input', (e) => {
            setVolume(e.target.value);
        });
        
        // 其他按钮
        elements.qualitySelect.addEventListener('change', () => {
            if (state.currentSong) {
                loadSongMedia();
            }
        });
        
        elements.downloadBtn.addEventListener('click', downloadSong);
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    prevSong();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    nextSong();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    adjustVolume(5);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    adjustVolume(-5);
                    break;
                case 'KeyM':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'Escape':
                    closeLyricPage();
                    break;
            }
        });
    }

    // --- GLOBAL FUNCTIONS ---
    window.showHomePage = () => {
        init();
    };

    window.playSong = playSong;
    window.togglePlayPause = togglePlayPause;
    window.prevSong = prevSong;
    window.nextSong = nextSong;
    window.closeLyricPage = closeLyricPage;
    window.toggleLyricFullscreen = toggleLyricFullscreen;

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
                const modal = document.querySelector('.modal-overlay');
                if (modal) modal.remove();
            } else {
                showError('导入歌单失败');
            }
        } catch (error) {
            console.error('导入失败:', error);
            showError('导入歌单失败：' + error.message);
        }
    };

    // --- INITIALIZATION ---
    function init() {
        showLoading('正在加载排行榜...');
        setupLazyLoading();
        
        api.getTopLists().then(result => {
            if (result && Array.isArray(result)) {
                renderTopLists(result);
            } else {
                showError('无法加载排行榜');
            }
        }).catch(error => {
            console.error('加载榜单失败:', error);
            showError('加载排行榜失败');
        });
        
        setupEventListeners();
        themeManager.init(); // 初始化主题管理器
        initVolumeControl(); // 初始化音量控制
    }

    init();
});
