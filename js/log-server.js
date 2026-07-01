/**
 * 三国杀 - 本地日志服务器
 * 接收前端发送的操作日志和错误，实时写入 game.log
 *
 * 启动: node js/log-server.js
 * 端口: 9753
 * 日志文件: /Users/cjh/WorkBuddy/sanguosha/game.log
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9753;
const LOG_FILE = path.join(__dirname, '..', 'game.log');

// 确保日志文件存在
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
}

function appendLog(entry) {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(LOG_FILE, line, 'utf8', (err) => {
        if (err) console.error('[日志服务器] 写入失败:', err);
    });
}

const server = http.createServer((req, res) => {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/log') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const entry = {
                    time: new Date().toLocaleString('zh-CN', { hour12: false }),
                    type: data.type || 'info',      // info | action | error | warn
                    msg: data.msg || '',
                    detail: data.detail || null,
                    screen: data.screen || null,
                };
                appendLog(entry);

                // 同时在控制台打印错误
                if (data.type === 'error') {
                    console.error('[前端错误]', entry.time, data.msg, data.detail || '');
                } else if (data.type === 'action') {
                    console.log('[操作]', entry.time, data.msg);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"ok":true}');
            } catch (e) {
                console.error('[日志服务器] 解析失败:', e.message, body.substring(0, 200));
                res.writeHead(400);
                res.end('{"ok":false,"error":"parse error"}');
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/clear') {
        fs.writeFileSync(LOG_FILE, '', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true,"msg":"cleared"}');
        return;
    }

    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
    const header = `===== 三国杀日志服务器启动 ${new Date().toLocaleString('zh-CN', { hour12: false })} =====\n`;
    fs.appendFileSync(LOG_FILE, header);
    console.log('========================================');
    console.log('  三国杀日志服务器已启动');
    console.log('  地址: http://127.0.0.1:' + PORT);
    console.log('  日志: ' + LOG_FILE);
    console.log('  POST /log   - 记录日志');
    console.log('  GET  /clear - 清空日志');
    console.log('  GET  /ping  - 检查服务');
    console.log('========================================');
    console.log('等待前端日志...\n');
});
