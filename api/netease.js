
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios = require('axios');
const CryptoJs = require('crypto-js');
const qs = require('qs');
const bigInt = require('big-integer');
const dayjs = require('dayjs');
const cheerio = require('cheerio');

// 添加缓存
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

function getCacheKey(url, params = {}) {
    return `${url}_${JSON.stringify(params)}`;
}

function getCache(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
}

// 优化的axios实例
const axiosInstance = axios.create({
    timeout: 8000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    }
});

function create_key() {
    var d, e, b = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", c = "";
    for (d = 0; 16 > d; d += 1)
        (e = Math.random() * b.length), (e = Math.floor(e)), (c += b.charAt(e));
    return c;
}

function AES(a, b) {
    var c = CryptoJs.enc.Utf8.parse(b), d = CryptoJs.enc.Utf8.parse("0102030405060708"), e = CryptoJs.enc.Utf8.parse(a), f = CryptoJs.AES.encrypt(e, c, {
        iv: d,
        mode: CryptoJs.mode.CBC,
    });
    return f.toString();
}

function Rsa(text) {
    text = text.split("").reverse().join("");
    const d = "010001";
    const e = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
    const hexText = text
        .split("")
        .map((_) => _.charCodeAt(0).toString(16))
        .join("");
    const res = bigInt(hexText, 16)
        .modPow(bigInt(d, 16), bigInt(e, 16))
        .toString(16);
    return Array(256 - res.length)
        .fill("0")
        .join("")
        .concat(res);
}

function getParamsAndEnc(text) {
    const first = AES(text, "0CoJUm6Qyw8W8jud");
    const rand = create_key();
    const params = AES(first, rand);
    const encSecKey = Rsa(rand);
    return {
        params,
        encSecKey,
    };
}

// 添加获取歌曲详细信息的函数
async function getMusicInfo(musicItem) {
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    
    try {
        const data = { id: musicItem.id, ids: `[${musicItem.id}]` };
        const result = (await axiosInstance.get('https://music.163.com/api/song/detail', {
            headers,
            params: data
        })).data;
        
        if (result.songs && result.songs.length > 0) {
            return {
                artwork: result.songs[0].album?.picUrl,
            };
        }
        return null;
    } catch (error) {
        console.error('Get music info error:', error.message);
        return null;
    }
}

function formatMusicItem(_) {
    const album = _.al || _.album;
    
    // 尝试从多个可能的字段获取封面
    let artwork = null;
    if (album) {
        artwork = album.picUrl || album.pic_str || album.pic;
    }
    
    // 如果还是没有，尝试从根级别获取
    if (!artwork) {
        artwork = _.picUrl || _.pic_str || _.pic;
    }
    
    // 如果封面存在但是小图，转换为大图
    if (artwork && artwork.includes('music.126.net')) {
        artwork = artwork.replace(/\?param=\d+y\d+/, '?param=300y300');
    }
    
    // 最终默认值
    if (!artwork) {
        artwork = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="white" font-size="20"%3E封面%3C/text%3E%3C/svg%3E';
    }
    
    return {
        id: _.id,
        artwork: artwork,
        title: _.name,
        artist: (_.ar || _.artists)[0].name,
        album: album?.name,
        url: `https://share.duanx.cn/url/wy/${_.id}/128k`,
        qualities: {
            low: {
                size: (_.l || {})?.size,
            },
            standard: {
                size: (_.m || {})?.size,
            },
            high: {
                size: (_.h || {})?.size,
            },
            super: {
                size: (_.sq || {})?.size,
            },
        },
        copyrightId: _?.copyrightId
    };
}

function formatAlbumItem(_) {
    return {
        id: _.id,
        artist: _.artist.name,
        title: _.name,
        artwork: _.picUrl,
        description: "",
        date: dayjs.unix(_.publishTime / 1000).format("YYYY-MM-DD"),
    };
}

const pageSize = 30;

async function searchBase(query, page, type) {
    const cacheKey = getCacheKey('search', { query, page, type });
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const data = {
        s: query,
        limit: pageSize,
        type: type,
        offset: (page - 1) * pageSize,
        csrf_token: "",
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = qs.stringify(pae);
    const headers = {
        authority: "music.163.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "content-type": "application/x-www-form-urlencoded",
        accept: "*/*",
        origin: "https://music.163.com",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://music.163.com/search/",
        "accept-language": "zh-CN,zh;q=0.9",
    };
    
    try {
        const res = (await axiosInstance({
            method: "post",
            url: "https://music.163.com/weapi/search/get",
            headers,
            data: paeData,
        })).data;
        
        setCache(cacheKey, res);
        return res;
    } catch (error) {
        console.error('Search error:', error.message);
        throw error;
    }
}

async function search(query, page, type) {
    if (type === "music") {
        const res = await searchBase(query, page, 1);
        const songs = res.result.songs || [];
        
        if (songs.length === 0) {
            return {
                isEnd: true,
                data: [],
            };
        }
        
        // 提取歌曲ID
        const songIds = songs.map(song => song.id);
        
        // 使用song detail API获取完整信息（包括封面）
        const detailedSongs = await getValidMusicItems(songIds);
        
        return {
            isEnd: res.result.songCount <= page * pageSize,
            data: detailedSongs,
        };
    }
    return { isEnd: true, data: [] };
}

async function getValidMusicItems(trackIds) {
    if (!trackIds || trackIds.length === 0) return [];
    
    const cacheKey = getCacheKey('songs', { ids: trackIds.sort().join(',') });
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    
    try {
        const res = (await axiosInstance.get(`https://music.163.com/api/song/detail/?ids=[${trackIds.join(",")}]`, { headers })).data;
        const validMusicItems = res.songs?.map(formatMusicItem) || [];
        
        setCache(cacheKey, validMusicItems);
        return validMusicItems;
    } catch (e) {
        console.error('Get valid music items error:', e.message);
        return [];
    }
}

async function getSheetMusicById(id) {
    const cacheKey = getCacheKey('playlist', { id });
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    };
    
    try {
        const sheetDetail = (await axiosInstance.get(`https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`, {
            headers,
        })).data;
        
        const trackIds = sheetDetail.playlist.trackIds?.map((_) => _.id) || [];
        
        // 分批处理，提高速度
        let result = [];
        const batchSize = 100; // 减少批次大小以提高速度
        const batches = [];
        
        for (let i = 0; i < trackIds.length; i += batchSize) {
            batches.push(trackIds.slice(i, i + batchSize));
        }
        
        // 并行处理批次
        const batchPromises = batches.map(batch => getValidMusicItems(batch));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach(batchResult => {
            if (batchResult.status === 'fulfilled') {
                result = result.concat(batchResult.value);
            }
        });
        
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Get sheet music error:', error.message);
        throw error;
    }
}

async function importMusicSheet(urlLike) {
    const matchResult = urlLike.match(/(?:https:\/\/y\.music\.163.com\/m\/playlist\?id=([0-9]+))|(?:https?:\/\/music\.163\.com\/playlist\/([0-9]+)\/.*)|(?:https?:\/\/music.163.com(?:\/#)?\/playlist\?id=(\d+))|(?:^\s*(\d+)\s*$)/);
    const id = matchResult?.[1] || matchResult?.[2] || matchResult?.[3] || matchResult?.[4];
    if (!id) {
        throw new Error('无效的歌单链接或ID');
    }
    return getSheetMusicById(id);
}

async function getTopLists() {
    const cacheKey = getCacheKey('toplists');
    const cached = getCache(cacheKey);
    if (cached) {
        console.log('Using cached toplists');
        return cached;
    }
    
    try {
        console.log('Fetching toplists from API...');
        const res = await axiosInstance.get("https://music.163.com/discover/toplist", {
            headers: {
                referer: "https://music.163.com/",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
            },
            timeout: 10000 // 设置超时
        });
        
        const $ = cheerio.load(res.data);
        const children = $(".n-minelst").children();
        const groups = [];
        let currentGroup = {};
        
        for (let c of children) {
            if (c.tagName == "h2") {
                if (currentGroup.title) {
                    groups.push(currentGroup);
                }
                currentGroup = {};
                currentGroup.title = $(c).text();
                currentGroup.data = [];
            } else if (c.tagName === "ul") {
                let sections = $(c).children();
                currentGroup.data = sections
                    .map((index, element) => {
                        const ele = $(element);
                        const id = ele.attr("data-res-id");
                        const imgSrc = ele.find("img").attr("src");
                        // 优化图片URL处理
                        let coverImg = '';
                        if (imgSrc) {
                            // 确保HTTPS
                            coverImg = imgSrc.replace(/^http:/, 'https:');
                            // 优化图片参数
                            if (coverImg.includes('?')) {
                                coverImg = coverImg.replace(/(\.jpg\?).*/, ".jpg?param=300y300");
                            } else {
                                coverImg += "?param=300y300";
                            }
                        }
                        const title = ele.find("p.name").text();
                        const description = ele.find("p.s-fc4").text();
                        return {
                            id,
                            coverImg,
                            title,
                            description,
                        };
                    })
                    .toArray()
                    .filter(item => item.id); // 过滤掉无效项目
            }
        }
        
        if (currentGroup.title) {
            groups.push(currentGroup);
        }
        
        console.log(`Fetched ${groups.length} groups with ${groups.reduce((sum, g) => sum + g.data.length, 0)} total items`);
        
        setCache(cacheKey, groups);
        return groups;
    } catch (error) {
        console.error('Get toplists error:', error.message);
        
        // 返回备用数据
        const fallbackData = [
            {
                title: "官方榜",
                data: [
                    { id: "3778678", title: "飙升榜", description: "每日更新", coverImg: "https://p2.music.126.net/DrRIg6CrgDfVLEph9SNh7w==/18696095720518497.jpg?param=300y300" },
                    { id: "3779629", title: "新歌榜", description: "每日更新", coverImg: "https://p2.music.126.net/mem2aOykdf7tEmd6bjZQWw==/18590542627753061.jpg?param=300y300" },
                    { id: "2884035", title: "原创榜", description: "每周更新", coverImg: "https://p2.music.126.net/sBzD11nforcuh1jdLSgX7g==/18740076185638788.jpg?param=300y300" },
                    { id: "19723756", title: "热歌榜", description: "每周更新", coverImg: "https://p2.music.126.net/GhhuF6Ep5Tpnpz9JXas-pw==/18708885596733693.jpg?param=300y300" }
                ]
            }
        ];
        return fallbackData;
    }
}

const qualityLevels = {
    low: "128k",
    standard: "320k", 
    high: "320k",
    super: "320k",
};

async function getMediaSource(musicItem, quality) {
    const cacheKey = getCacheKey('media', { id: musicItem.id, quality });
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    try {
        const res = await axiosInstance.get(`https://wyy-api-three.vercel.app/song/url?id=${musicItem.id}&quality=${qualityLevels[quality] || '320k'}`, {
            timeout: 8000
        });
        
        if (res.data && res.data.url && res.data.url.startsWith('http')) {
            const result = {
                url: res.data.url,
            };
            setCache(cacheKey, result);
            return result;
        }
        
        console.log('API返回异常数据:', JSON.stringify(res.data));
        return null;
    } catch (error) {
        console.log('获取音源失败:', error.message);
        return null;
    }
}

async function getLyric(musicItem) {
    const cacheKey = getCacheKey('lyric', { id: musicItem.id });
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    
    try {
        const data = { id: musicItem.id, lv: -1, tv: -1, csrf_token: "" };
        const pae = getParamsAndEnc(JSON.stringify(data));
        const paeData = qs.stringify(pae);
        
        const result = (await axiosInstance({
            method: "post",
            url: `https://interface.music.163.com/weapi/song/lyric?csrf_token=`,
            headers,
            data: paeData,
        })).data;
        
        const lyricData = {
            rawLrc: result.lrc?.lyric || '',
        };
        
        setCache(cacheKey, lyricData);
        return lyricData;
    } catch (error) {
        console.error('Get lyric error:', error.message);
        return { rawLrc: '' };
    }
}

module.exports = {
    search,
    getSheetMusicById,
    importMusicSheet,
    getTopLists,
    getMediaSource,
    getLyric,
    getMusicInfo
}; 
