import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return createHash('sha1').update(String(key) + GUID).digest('base64');
}

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? '');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, data]);
}

function unmask(payload, mask) {
  const out = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ mask[i % 4];
  return out;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:net').Socket} socket
 * @param {Buffer} head
 */
export function upgradeWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return null;
  }
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '\r\n',
  ].join('\r\n');
  socket.write(headers);
  if (head && head.length) socket.unshift(head);

  let buf = Buffer.alloc(0);
  const listeners = { message: [], close: [], error: [] };
  let closed = false;

  const ws = {
    send(text) {
      if (closed || socket.destroyed) return;
      socket.write(encodeFrame(0x1, String(text ?? '')));
    },
    ping() {
      if (closed || socket.destroyed) return;
      socket.write(encodeFrame(0x9, ''));
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        socket.write(encodeFrame(0x8, ''));
      } catch {
        /* ignore */
      }
      socket.end();
    },
    on(ev, fn) {
      if (listeners[ev]) listeners[ev].push(fn);
    },
  };

  const emit = (ev, ...args) => {
    for (const fn of listeners[ev] || []) {
      try {
        fn(...args);
      } catch {
        /* ignore */
      }
    }
  };

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const finOpcode = buf[0];
      const opcode = finOpcode & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readUInt32BE(6));
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return;
      const mask = masked ? buf.subarray(offset, offset + 4) : null;
      offset += maskLen;
      let payload = buf.subarray(offset, offset + len);
      buf = buf.subarray(offset + len);
      if (mask) payload = unmask(payload, mask);
      if (opcode === 0x8) {
        ws.close();
        return;
      }
      if (opcode === 0x9) {
        socket.write(encodeFrame(0xa, payload));
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        emit('message', payload.toString('utf8'));
      }
    }
  });
  socket.on('close', () => {
    closed = true;
    emit('close');
  });
  socket.on('error', (err) => {
    closed = true;
    emit('error', err);
    emit('close');
  });
  return ws;
}
