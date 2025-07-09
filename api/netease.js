
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios = require('axios');
const CryptoJs = require('crypto-js');
const qs = require('qs');
const bigInt = require('big-integer');
const dayjs = require('dayjs');
const cheerio = require('cheerio');

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

function formatMusicItem(_) {
    const album = _.al || _.album;
    return {
        id: _.id,
        artwork: album?.picUrl,
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
    const res = (await axios({
        method: "post",
        url: "https://music.163.com/weapi/search/get",
        headers,
        data: paeData,
    })).data;
    return res;
}

async function search(query, page, type) {
    if (type === "music") {
        const res = await searchBase(query, page, 1);
        const songs = res.result.songs?.map(formatMusicItem) || [];
        return {
            isEnd: res.result.songCount <= page * pageSize,
            data: songs,
        };
    }
    // 可以添加其他类型的搜索
    return { isEnd: true, data: [] };
}

async function getValidMusicItems(trackIds) {
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    try {
        const res = (await axios.get(`https://music.163.com/api/song/detail/?ids=[${trackIds.join(",")}]`, { headers })).data;
        const validMusicItems = res.songs?.map(formatMusicItem) || [];
        return validMusicItems;
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function getSheetMusicById(id) {
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    };
    const sheetDetail = (await axios.get(`https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`, {
        headers,
    })).data;
    const trackIds = sheetDetail.playlist.trackIds?.map((_) => _.id) || [];
    let result = [];
    let idx = 0;
    while (idx * 200 < trackIds.length) {
        const res = await getValidMusicItems(trackIds.slice(idx * 200, (idx + 1) * 200));
        result = result.concat(res);
        ++idx;
    }
    return result;
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
    try {
        const res = await axios.get("https://music.163.com/discover/toplist", {
            headers: {
                referer: "https://music.163.com/",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
            },
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
                        const coverImg = imgSrc ? imgSrc.replace(/(\.jpg\?).*/, ".jpg?param=800y800") : '';
                        const title = ele.find("p.name").text();
                        const description = ele.find("p.s-fc4").text();
                        return {
                            id,
                            coverImg,
                            title,
                            description,
                        };
                    })
                    .toArray();
            }
        }
        
        if (currentGroup.title) {
            groups.push(currentGroup);
        }
        
        return groups;
    } catch (error) {
        console.error('Get toplists error:', error);
        throw error;
    }
}

const qualityLevels = {
    low: "128k",
    standard: "320k",
    high: "320k",
    super: "320k",
};

async function getMediaSource(musicItem, quality) {
    try {
        const res = await axios.get(`https://wyy-api-three.vercel.app/song/url?id=${musicItem.id}&quality=${qualityLevels[quality] || '320k'}`, {
            timeout: 10000
        });
        
        if (res.data && res.data.url && res.data.url.startsWith('http')) {
            return {
                url: res.data.url,
            };
        }
        
        console.log('API返回异常数据:', JSON.stringify(res.data));
        return null;
    } catch (error) {
        console.log('获取音源失败:', error.message);
        return null;
    }
}

async function getLyric(musicItem) {
    const headers = {
        Referer: "https://y.music.163.com/",
        Origin: "https://y.music.163.com/",
        authority: "music.163.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    const data = { id: musicItem.id, lv: -1, tv: -1, csrf_token: "" };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = qs.stringify(pae);
    const result = (await axios({
        method: "post",
        url: `https://interface.music.163.com/weapi/song/lyric?csrf_token=`,
        headers,
        data: paeData,
    })).data;
    return {
        rawLrc: result.lrc?.lyric || '',
    };
}

module.exports = {
    search,
    getSheetMusicById,
    importMusicSheet,
    getTopLists,
    getMediaSource,
    getLyric
}; 
