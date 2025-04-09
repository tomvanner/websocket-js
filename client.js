const http = require('http');
const crypto = require('crypto');

const req = http.request({
    hostname: 'localhost',
    port: 8000,
    headers: {
        'Connection': 'upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Accept': crypto.randomBytes(16).toString('base64'),
    }
});

req.end();

req.on('upgrade', (res, socket, head) => {
    socket.on('data', data => {
        console.log(data.toString())
    });

    setInterval(() => {
        socket.write('Hello world');
    }, 500)
});