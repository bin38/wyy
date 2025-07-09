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
    const { query, page, type } = req.query;
    if (!query || !type) {
        return res.status(400).send({ error: 'Query and type are required' });
    }
    const result = await netease.search(query, page || 1, type);
    res.send(result);
});

app.get('/api/playlist', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).send({ error: 'Playlist ID is required' });
    }
    const result = await netease.getSheetMusicById(id);
    res.send({ data: result });
});

app.get('/api/toplists', async (req, res) => {
    const result = await netease.getTopLists();
    res.send(result);
});

app.get('/api/song/url', async (req, res) => {
    const { id, quality } = req.query;
    if (!id) {
        return res.status(400).send({ error: 'Song ID is required' });
    }
    const result = await netease.getMediaSource({ id }, quality || 'standard');
    res.send(result);
});

app.get('/api/lyric', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).send({ error: 'Song ID is required' });
    }
    const result = await netease.getLyric({ id });
    res.send(result);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app; 