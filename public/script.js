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
        lyricScrollTimer: null,
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

    // 彻底解决HTML转义问题的安全函数
    function sanitizeHtml(str) {
        if (str === null || str === undefined) return '';
        
        // 创建临时元素进行安全转义
        const temp = document.createElement('div');
        temp.textContent = String(str);
        return temp.innerHTML;
    }

    // 解码HTML实体
    function decodeHtml(str) {
        if (str === null || str === undefined) return '';
        
        const temp = document.createElement('div');
        temp.innerHTML = String(str);
        return temp.textContent || temp.innerText || '';
    }

    // 安全的innerHTML设置
    function safeSetInnerHTML(element, content) {
        // 清空现有内容
        element.innerHTML = '';
        
        if (typeof content === 'string') {
            element.innerHTML = content;
        } else {
            element.appendChild(content);
        }
    }

    function showLoading(message = '加载中...') {
        const sanitizedMessage = sanitizeHtml(message);
        safeSetInnerHTML(mainContent, `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">${sanitizedMessage}</div>
                <div class="loading-tips">数据正在加载，请稍候...</div>
            </div>`);
    }

    function showError(message) {
        const sanitizedMessage = sanitizeHtml(message);
        safeSetInnerHTML(mainContent, `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <div>${sanitizedMessage}</div>
            </div>`);
    }

    // --- API HELPERS WITH PERFORMANCE OPTIMIZATION ---
    const api = {
        getTopLists: async () => {
            const cacheKey = getCacheKey('toplists', {});
            const cached = getCache(cacheKey);
            if (cached) {
                return cached;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                const result = await fetch(`${API_BASE_URL}/toplists`, {
                    signal: controller.signal
                }).then(res => res.json());
                setCache(cacheKey, result);
                return result;
            } finally {
                clearTimeout(timeoutId);
            }
        },
        
        getPlaylist: async (id) => {
            const cacheKey = getCacheKey('playlist', { id });
            const cached = getCache(cacheKey);
            if (cached) {
                return cached;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
                const result = await fetch(`${API_BASE_URL}/playlist?id=${id}`, {
                    signal: controller.signal
                }).then(res => res.json());
                setCache(cacheKey, result);
                return result;
            } finally {
                clearTimeout(timeoutId);
            }
        },
        
        search: async (query) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            try {
                return await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}&type=music`, {
                    signal: controller.signal
                }).then(res => res.json());
            } finally {
                clearTimeout(timeoutId);
            }
        },
        
        getSongUrl: async (id, quality) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                return await fetch(`${API_BASE_URL}/song/url?id=${id}&quality=${quality}`, {
                    signal: controller.signal
                }).then(res => res.json());
            } finally {
                clearTimeout(timeoutId);
            }
        },
        
        getLyric: async (id) => {
            const cacheKey = getCacheKey('lyric', { id });
            const cached = getCache(cacheKey);
            if (cached) {
                return cached;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                const result = await fetch(`${API_BASE_URL}/lyric?id=${id}`, {
                    signal: controller.signal
                }).then(res => res.json());
                setCache(cacheKey, result);
                return result;
            } finally {
                clearTimeout(timeoutId);
            }
        },
        
        importPlaylist: async (url) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            try {
                return await fetch(`${API_BASE_URL}/import-playlist?url=${encodeURIComponent(url)}`, {
                    signal: controller.signal
                }).then(res => res.json());
            } finally {
                clearTimeout(timeoutId);
            }
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
                        loadPlaylistData(element);
                    }
                }
            });
        }, {
            rootMargin: '50px'
        });
    }

    function loadPlaylistData(element) {
        const id = element.dataset.id;
        const title = element.querySelector('p').textContent;
        
        // 预加载歌单数据
        api.getPlaylist(id).then(result => {
            console.log(`预加载歌单: ${title}`);
        }).catch(error => {
            console.log(`预加载失败: ${title}`, error);
        });
    }

    // --- UI RENDERING ---
    function renderTopLists(lists) {
        console.log('渲染榜单:', lists);
        safeSetInnerHTML(mainContent, '<div class="top-lists"></div>');
        const container = mainContent.querySelector('.top-lists');
        
        lists.forEach((group, groupIndex) => {
            if (group.data && group.data.length > 0) {
                group.data.forEach((list, listIndex) => {
                    const item = document.createElement('div');
                    item.className = 'list-item';
                    item.dataset.id = list.id;
                    item.style.animationDelay = `${(groupIndex * group.data.length + listIndex) * 0.05}s`;
                    
                    const imageUrl = fixImageUrl(list.coverImg);
                    const title = sanitizeHtml(list.title || '未知标题');
                    const description = sanitizeHtml(list.description || '');
                    
                    safeSetInnerHTML(item, `
                        <img src="${imageUrl}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"200\\"><rect width=\\"200\\" height=\\"200\\" fill=\\"%23333\\"/><text x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" fill=\\"white\\" font-size=\\"16\\">榜单</text></svg>'">
                        <p>${title}</p>
                        <small>${description}</small>
                    `);
                    
                    item.addEventListener('click', () => loadPlaylist(list.id, decodeHtml(title)));
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
        safeSetInnerHTML(importItem, `
            <div class="import-content">
                <i class="fas fa-plus"></i>
                <p>导入歌单</p>
            </div>
        `);
        importItem.addEventListener('click', showImportDialog);
        container.appendChild(importItem);
    }

    function renderPlaylist(playlist, title = '歌单') {
        console.log('渲染歌单:', playlist);
        const safeTitle = sanitizeHtml(title);
        safeSetInnerHTML(mainContent, `
            <div class="playlist-header">
                <button onclick="showHomePage()" class="back-btn">
                    <i class="fas fa-arrow-left"></i> 返回主页
                </button>
                <h2>${safeTitle} (${playlist.length} 首)</h2>
            </div>
            <div class="playlist"></div>
        `);
        const container = mainContent.querySelector('.playlist');
        state.currentPlaylist = playlist;
        
        // 使用DocumentFragment优化DOM操作
        const fragment = document.createDocumentFragment();
        
        playlist.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'song-item';
            item.dataset.index = index;
            item.style.animationDelay = `${index * 0.01}s`;
            
            const imageUrl = fixImageUrl(song.artwork);
            const songTitle = sanitizeHtml(song.title || '未知歌曲');
            const songArtist = sanitizeHtml(song.artist || '未知歌手');
            
            safeSetInnerHTML(item, `
                <span class="song-number">${String(index + 1).padStart(2, '0')}</span>
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
            `);
            item.addEventListener('click', () => playSong(index));
            fragment.appendChild(item);
        });
        
        container.appendChild(fragment);
    }
    
    function renderSearchResults(results) {
        if (results && results.data) {
            renderPlaylist(results.data, '搜索结果');
        } else {
            showError('搜索结果为空');
        }
    }

    // --- FULLSCREEN LYRIC PAGE ---
    function showFullscreenLyric() {
        if (!state.currentSong) {
            alert('请先播放一首歌曲');
            return;
        }

        // 创建全屏歌词页面
        const lyricPage = document.createElement('div');
        lyricPage.className = 'lyric-fullscreen';
        lyricPage.id = 'lyricFullscreen';
        
        const currentSongTitle = sanitizeHtml(state.currentSong?.title || '未知歌曲');
        const currentSongArtist = sanitizeHtml(state.currentSong?.artist || '未知歌手');
        
        safeSetInnerHTML(lyricPage, `
            <div class="lyric-background">
                <img src="${fixImageUrl(state.currentSong?.artwork)}" alt="背景" class="lyric-bg-image">
                <div class="lyric-bg-overlay"></div>
            </div>
            
            <div class="lyric-header">
                <button class="lyric-close-btn" onclick="closeLyricFullscreen()">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="lyric-song-info">
                    <h3 class="lyric-song-title">${currentSongTitle}</h3>
                    <p class="lyric-song-artist">${currentSongArtist}</p>
                </div>
                <button class="lyric-fullscreen-btn" onclick="toggleLyricFullscreen()">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
            
            <div class="lyric-content-wrapper" id="lyricContentWrapper">
                <div class="lyric-scroll-area" id="lyricScrollArea">
                    ${lyricContent.innerHTML || '<div class="lyric-placeholder">暂无歌词</div>'}
                </div>
            </div>
            
            <div class="lyric-mini-player">
                <div class="lyric-progress">
                    <div class="lyric-progress-bar" id="lyricProgressBar">
                        <div class="lyric-progress-fill" id="lyricProgressFill"></div>
                    </div>
                    <div class="lyric-time">
                        <span id="lyricCurrentTime">0:00</span>
                        <span id="lyricDuration">0:00</span>
                    </div>
                </div>
                <div class="lyric-controls">
                    <button class="lyric-control-btn" onclick="prevSong()">
                        <i class="fas fa-step-backward"></i>
                    </button>
                    <button class="lyric-control-btn lyric-play-btn" onclick="togglePlayPause()" id="lyricPlayBtn">
                        <i class="fas ${state.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                    <button class="lyric-control-btn" onclick="nextSong()">
                        <i class="fas fa-step-forward"></i>
                    </button>
                </div>
            </div>
        `);
        
        // 添加到body
        document.body.appendChild(lyricPage);
        
        // 添加滑动手势支持
        setupLyricGestures(lyricPage);
        
        // 动画效果
        requestAnimationFrame(() => {
            lyricPage.classList.add('show');
        });
        
        // 同步当前播放进度
        updateLyricPageProgress();
        
        // 自动滚动到当前歌词
        setTimeout(() => {
            const activeLine = lyricPage.querySelector('.lyric-line.active');
            if (activeLine) {
                scrollToLyricLine(activeLine);
            }
        }, 300);
    }

    function setupLyricGestures(lyricPage) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startTime = 0;
        
        const header = lyricPage.querySelector('.lyric-header');
        const contentWrapper = lyricPage.querySelector('.lyric-content-wrapper');
        
        // 触摸事件
        const handleTouchStart = (e) => {
            startY = e.touches[0].clientY;
            startTime = Date.now();
            isDragging = true;
            lyricPage.style.transition = 'none';
        };
        
        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            // 只允许向下滑动
            if (deltaY > 0) {
                const progress = Math.min(deltaY / window.innerHeight, 1);
                const scale = 1 - progress * 0.1;
                const opacity = 1 - progress * 0.3;
                
                lyricPage.style.transform = `translateY(${deltaY}px) scale(${scale})`;
                lyricPage.style.opacity = opacity;
                
                // 防止内容滚动
                e.preventDefault();
            }
        };
        
        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            const deltaY = currentY - startY;
            const deltaTime = Date.now() - startTime;
            const velocity = deltaY / deltaTime;
            
            lyricPage.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            
            // 判断是否关闭
            if (deltaY > window.innerHeight * 0.3 || velocity > 0.5) {
                closeLyricFullscreen();
            } else {
                // 回弹
                lyricPage.style.transform = 'translateY(0) scale(1)';
                lyricPage.style.opacity = '1';
            }
        };
        
        // 绑定事件
        header.addEventListener('touchstart', handleTouchStart, { passive: false });
        header.addEventListener('touchmove', handleTouchMove, { passive: false });
        header.addEventListener('touchend', handleTouchEnd);
        
        // 鼠标事件（PC端）
        header.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startTime = Date.now();
            isDragging = true;
            lyricPage.style.transition = 'none';
            
            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                currentY = e.clientY;
                const deltaY = currentY - startY;
                
                if (deltaY > 0) {
                    const progress = Math.min(deltaY / window.innerHeight, 1);
                    const scale = 1 - progress * 0.1;
                    const opacity = 1 - progress * 0.3;
                    
                    lyricPage.style.transform = `translateY(${deltaY}px) scale(${scale})`;
                    lyricPage.style.opacity = opacity;
                }
            };
            
            const handleMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                
                const deltaY = currentY - startY;
                const deltaTime = Date.now() - startTime;
                const velocity = deltaY / deltaTime;
                
                lyricPage.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                
                if (deltaY > window.innerHeight * 0.3 || velocity > 0.5) {
                    closeLyricFullscreen();
                } else {
                    lyricPage.style.transform = 'translateY(0) scale(1)';
                    lyricPage.style.opacity = '1';
                }
                
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    function scrollToLyricLine(activeLine) {
        const container = document.getElementById('lyricScrollArea');
        if (!container || !activeLine) return;
        
        const containerHeight = container.clientHeight;
        const lineTop = activeLine.offsetTop;
        const lineHeight = activeLine.clientHeight;
        const scrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);
        
        // 使用平滑滚动
        container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
        });
    }

    function updateLyricPageProgress() {
        const lyricProgressFill = document.getElementById('lyricProgressFill');
        const lyricCurrentTime = document.getElementById('lyricCurrentTime');
        const lyricDuration = document.getElementById('lyricDuration');
        
        if (lyricProgressFill && audioPlayer.duration) {
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            lyricProgressFill.style.width = `${progress}%`;
        }
        
        if (lyricCurrentTime) {
            lyricCurrentTime.textContent = formatTime(audioPlayer.currentTime);
        }
        
        if (lyricDuration) {
            lyricDuration.textContent = formatTime(audioPlayer.duration);
        }
    }

    window.closeLyricFullscreen = () => {
        const lyricPage = document.getElementById('lyricFullscreen');
        if (lyricPage) {
            lyricPage.classList.add('hide');
            setTimeout(() => {
                if (lyricPage.parentNode) {
                    lyricPage.parentNode.removeChild(lyricPage);
                }
            }, 300);
        }
    };

    window.toggleLyricFullscreen = () => {
        const lyricPage = document.getElementById('lyricFullscreen');
        if (lyricPage) {
            lyricPage.classList.toggle('fullscreen');
            const btn = lyricPage.querySelector('.lyric-fullscreen-btn i');
            if (btn) {
                if (lyricPage.classList.contains('fullscreen')) {
                    btn.className = 'fas fa-compress';
                } else {
                    btn.className = 'fas fa-expand';
                }
            }
        }
    };

    // --- IMPORT PLAYLIST DIALOG ---
    function showImportDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        
        safeSetInnerHTML(dialog, `
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
        `);
        
        document.body.appendChild(dialog);
        document.getElementById('importUrl').focus();
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
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
        const imageUrl = fixImageUrl(state.currentSong.artwork);
        songArtwork.src = imageUrl;
        songTitle.textContent = decodeHtml(state.currentSong.title || '未知歌曲');
        songArtist.textContent = decodeHtml(state.currentSong.artist || '未知歌手');
        playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        
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
            
            // 更新歌词页面进度
            updateLyricPageProgress();
            
            // 节流更新歌词高亮
            if (state.lyricScrollTimer) {
                clearTimeout(state.lyricScrollTimer);
            }
            state.lyricScrollTimer = setTimeout(() => {
                updateLyricHighlight();
            }, 100);
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
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // --- LYRIC LOGIC ---
    async function loadLyrics() {
        safeSetInnerHTML(lyricContent, '<div style="text-align: center; padding: 50px; color: #888;">加载歌词中...</div>');
        state.lyrics = [];
        
        try {
            const result = await api.getLyric(state.currentSong.id);
            if (result && result.rawLrc) {
                parseLyrics(result.rawLrc);
            } else {
                safeSetInnerHTML(lyricContent, '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>');
            }
        } catch (error) {
            console.error('歌词加载失败:', error);
            safeSetInnerHTML(lyricContent, '<div style="text-align: center; padding: 50px; color: #ff6b6b;">歌词加载失败</div>');
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
                    state.lyrics.push({ time, text: sanitizeHtml(text) });
                }
            }
        }
        renderLyrics();
    }
    
    function renderLyrics() {
        if (state.lyrics.length === 0) {
            safeSetInnerHTML(lyricContent, '<div style="text-align: center; padding: 50px; color: #888;">暂无歌词</div>');
            return;
        }
        
        // 使用DocumentFragment优化DOM操作
        const fragment = document.createDocumentFragment();
        
        state.lyrics.forEach((line, index) => {
            const p = document.createElement('p');
            p.textContent = decodeHtml(line.text);
            p.dataset.time = line.time;
            p.dataset.index = index;
            p.className = 'lyric-line';
            p.addEventListener('click', () => {
                audioPlayer.currentTime = line.time;
            });
            fragment.appendChild(p);
        });
        
        lyricContent.innerHTML = '';
        lyricContent.appendChild(fragment);
        
        // 同步到歌词页面
        const lyricScrollArea = document.getElementById('lyricScrollArea');
        if (lyricScrollArea) {
            safeSetInnerHTML(lyricScrollArea, lyricContent.innerHTML);
        }
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
            const allLines = document.querySelectorAll('#lyricContent .lyric-line');
            allLines.forEach((p, index) => {
                if (index === activeLine) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });
            
            // 更新歌词页面
            const lyricPageLines = document.querySelectorAll('#lyricScrollArea .lyric-line');
            lyricPageLines.forEach((p, index) => {
                if (index === activeLine) {
                    p.classList.add('active');
                    // 平滑滚动到当前歌词
                    scrollToLyricLine(p);
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
    window.togglePlayPause = togglePlayPause;
    window.prevSong = prevSong;
    window.nextSong = nextSong;

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

    // --- DOWNLOAD LOGIC ---
    function downloadSong() {
        if (!state.currentSong) {
            alert('请先选择一首歌');
            return;
        }
        const a = document.createElement('a');
        a.href = audioPlayer.src;
        a.download = `${decodeHtml(state.currentSong.title)} - ${decodeHtml(state.currentSong.artist)}.mp3`;
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
        
        // 搜索功能
        const performSearch = () => {
            const query = searchInput.value.trim();
            if (query) {
                showLoading('正在搜索...');
                api.search(query).then(renderSearchResults).catch(error => {
                    console.error('搜索失败:', error);
                    showError('搜索失败');
                });
            }
        };
        
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // 歌词按钮 - 改为显示全屏歌词页面
        lyricBtn.addEventListener('click', showFullscreenLyric);
        
        qualitySelect.addEventListener('change', () => {
            if (state.currentSong) {
                loadSongMedia();
            }
        });
        
        downloadBtn.addEventListener('click', downloadSong);
        
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
                case 'Escape':
                    closeLyricFullscreen();
                    break;
            }
        });
    }

    // --- INITIALIZATION ---
    function init() {
        showLoading('正在加载排行榜...');
        setupLazyLoading();
        
        api.getTopLists().then(result => {
            console.log('获取榜单:', result);
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
    }

    init();
});
