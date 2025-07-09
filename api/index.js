const express = require('express');
const app = express();
const netease = require('./netease');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 跨域设置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    next();
});

// 路由
app.get('/api/search', async (req, res) => {
    try {
        const { query, page, type } = req.query;
        if (!query || !type) {
            return res.status(400).send({ error: 'Query and type are required' });
        }
        const result = await netease.search(query, page || 1, type);
        res.send(result);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).send({ error: 'Search failed' });
    }
});

app.get('/api/playlist', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).send({ error: 'Playlist ID is required' });
        }
        const result = await netease.getSheetMusicById(id);
        res.send({ data: result });
    } catch (error) {
        console.error('Playlist error:', error);
        res.status(500).send({ error: 'Failed to load playlist' });
    }
});

app.get('/api/toplists', async (req, res) => {
    try {
        const result = await netease.getTopLists();
        console.log('Toplists result:', JSON.stringify(result, null, 2));
        res.send(result);
    } catch (error) {
        console.error('Toplists error:', error);
        res.status(500).send({ error: 'Failed to load toplists' });
    }
});

app.get('/api/song/url', async (req, res) => {
    try {
        const { id, quality } = req.query;
        if (!id) {
            return res.status(400).send({ error: 'Song ID is required' });
        }
        const result = await netease.getMediaSource({ id }, quality || 'standard');
        res.send(result);
    } catch (error) {
        console.error('Song URL error:', error);
        res.status(500).send({ error: 'Failed to get song URL' });
    }
});

app.get('/api/lyric', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).send({ error: 'Song ID is required' });
        }
        const result = await netease.getLyric({ id });
        res.send(result);
    } catch (error) {
        console.error('Lyric error:', error);
        res.status(500).send({ error: 'Failed to get lyrics' });
    }
});

// 新增：导入歌单功能
app.get('/api/import-playlist', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).send({ error: 'Playlist URL is required' });
        }
        const result = await netease.importMusicSheet(url);
        res.send({ data: result });
    } catch (error) {
        console.error('Import playlist error:', error);
        res.status(500).send({ error: 'Failed to import playlist' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app; 
