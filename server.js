/**
 * Logic that handles an naive implementation of a websocket server.
 * 
 * See https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers
 * for an overview of the spec.
 */

const http = require('http');
const crypto = require('crypto');

const PORT = 8000;

// Websocket magic string used for 
const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// 126 = 16 bit extended payload length marker
const EXTENDED_PAYLOAD_MARKER = 126;

// Maximum length of the payload before it needs to be upgraded to 64 bit extended length
const MAX_REGULAR_PAYLOAD_LENGTH = 126; // 2^7

// Maximum length of the payload before it needs to be upgraded to 64 bit extended length
const MAX_EXTENDED_PAYLOAD_LENGTH = 65536; // 2^16

const server = http.createServer((req, res) => {
    // Websockets use HTTP upgrade so close standard HTTP request
    res.writeHead(200)
    res.end();
}).listen(PORT);

server.on('upgrade', (req, socket) => {
    const { 'sec-websocket-key': clientKey, upgrade } = req.headers;

    if (!clientKey || upgrade != 'websocket') {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.end();
        return;
    }

    const clientID = crypto.randomUUID();

    console.log(`Client connected with ID ${clientID}`);

    const preImage = clientKey + WEBSOCKET_MAGIC_STRING;
    const acceptHeader = crypto.createHash('sha1').update(preImage).digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Connection: upgrade',
        'Upgrade: websocket',
        `Sec-WebSocket-Accept: ${acceptHeader}`,
        '\r\n',
    ];
    socket.write(headers.join('\r\n'));

    socket.on('data', buffer => {
        const message = decodeWebsocketFrame(buffer);
        const echoReply = encodeWebsocketFrame(message);
        socket.write(echoReply);
    });

    socket.on('end', () => {
        console.log(`Client ${clientID} diconnected`);
    });
});

/**
 * Decodes an incoming websocket dataframe.
 * 
 * This makes a few assumptions about the payload:
 *  - It's the final frame
 *  - It's not fragmented
 *  - It's UTF-8 encoded text 
 * 
 * See https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#format.
 * 
 * @param {Buffer} buffer The frame byte contents.
 * @returns {string} The decoded frame as as UTF-8 string.
 */
function decodeWebsocketFrame(buffer) {
    // The first byte of the buffer contains data which we've already made assumptions about
    // above, so ignore and move on to the first byte (payload length)
    // We expect the mask flag bit to always be 1, so mask it off
    const payloadLength = buffer[1] & 0x7F; // 0x7F = 01111111

    const maskStartIdx = 2;
    const dataStartIdx = maskStartIdx + 4;

    const mask = buffer.slice(maskStartIdx, dataStartIdx);

    const encodedData = buffer.slice(dataStartIdx, dataStartIdx + payloadLength);

    const decodedData = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
        // XOR each 4 byte sequence in the payload with the mask
        decodedData[i] = encodedData[i] ^ mask[i % 4];
    }

    return decodedData.toString();
}

/**
 * Encodes a string into a websocket dataframe.
 * 
 * This makes a few assumptions about the response:
 *  - It's the final frame
 *  - It's not fragmented
 *  - It's UTF-8 encoded text 
 * 
 * @param {string} data A UTF-8 encoded string to encode.
 * @returns {Buffer} The encoded frame content.
 */
function encodeWebsocketFrame(data) {
    const payload = Buffer.from(data);
    const payloadLength = payload.length;

    // The first byte follows the above assumptions:
    // FIN = 1 (final frame), Opcode = 0x1 (text)
    const frame = [0x81];

    if (payloadLength < MAX_REGULAR_PAYLOAD_LENGTH) {
        frame.push(payloadLength);
    } else if (payloadLength < MAX_EXTENDED_PAYLOAD_LENGTH) {
        frame.push(EXTENDED_PAYLOAD_MARKER);
        // The extended payload length should be two bytes, but frame.push only allows one byte to
        // be pushed at once, so push highest and lowest bytes separately (maintains big-endian order)
        // 0xFF = 11111111
        frame.push((payloadLength >> 8) & 0xFF);
        frame.push(payloadLength & 0xFF);
    } else {
        throw new Error("Payload too large");
    }

    return Buffer.concat([Buffer.from(frame), payload]);
}