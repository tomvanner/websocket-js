const http = require('http');
const crypto = require('crypto');

const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('okay');
    res.end();
}).listen(8000);

server.on('upgrade', (req, socket, head) => {
    if (!req.headers['sec-websocket-accept']) {
        socket.write('HTTP/1.1 400 Bad Request\r\n' +
            '\r\n');
        socket.end();
        return;
    }

    const preImage = req.headers['sec-websocket-accept'] + WEBSOCKET_MAGIC_STRING;
    const acceptHeader = crypto.createHash('sha1').update(preImage).digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Connection: upgrade',
        `Sec-WebSocket-Accept: ${acceptHeader}`,
        '',
    ];
    socket.write(headers.join('\r\n'));
});