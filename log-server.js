/**
 * 三国杀日志读取服务器
 * 用于从浏览器 localStorage 读取操作日志
 * 
 * 使用方法：
 * 1. 在浏览器中打开 http://localhost:8000/
 * 2. 打开控制台，运行：
 *    fetch('http://localhost:3001/save', {
 *      method: 'POST',
 *      body: JSON.stringify({ logs: JSON.parse(localStorage.getItem('sgs_game_log') || '[]') }),
 *      headers: { 'Content-Type': 'application/json' }
 *    })
 * 
 * 3. 服务器会将日志保存到 ./game-logs 目录
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const LOG_DIR = path.join(__dirname, 'game-logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // 保存日志
    if (url.pathname === '/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { logs } = JSON.parse(body);
                
                // 生成文件名（带时间戳）
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `game-${timestamp}.json`;
                const filepath = path.join(LOG_DIR, filename);
                
                // 保存日志
                fs.writeFileSync(filepath, JSON.stringify(logs, null, 2));
                
                console.log(`✅ 日志已保存: ${filepath}`);
                console.log(`   条数: ${logs.length}`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, file: filename, count: logs.length }));
            } catch (e) {
                console.error('保存日志失败:', e);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // 读取最新日志
    if (url.pathname === '/logs' && req.method === 'GET') {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json')).sort().reverse();
        if (files.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs: [], message: '暂无日志' }));
            return;
        }
        const latest = path.join(LOG_DIR, files[0]);
        const logs = JSON.parse(fs.readFileSync(latest, 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs, file: files[0] }));
        return;
    }

    // 列出所有日志文件
    if (url.pathname === '/list' && req.method === 'GET') {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json')).sort().reverse();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`\n🎮 三国杀日志服务器已启动`);
    console.log(`   端口: ${PORT}`);
    console.log(`\n📋 在浏览器控制台运行以下代码来保存日志：\n`);
    console.log(`fetch('http://localhost:${PORT}/save', {`);
    console.log(`  method: 'POST',`);
    console.log(`  body: JSON.stringify({ logs: JSON.parse(localStorage.getItem('sgs_game_log') || '[]') }),`);
    console.log(`  headers: { 'Content-Type': 'application/json' }`);
    console.log(`}).then(r => r.json()).then(console.log);`);
    console.log(`\n或者直接访问 http://localhost:${PORT}/logs 读取最新日志\n`);
});
