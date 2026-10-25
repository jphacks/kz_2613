// 試験・表示確認用の最小の WebSocket サーバー (RFC 6455)。依存なしで ui-preview.mjs が使う。
// 受け取るのはブラウザが送る分割なしのテキスト・バイナリのフレームだけ。製品のホスト (Rust 版) には使わない。
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock;
    this.readyState = 1; // 1 = 接続中、2 = 閉じている途中、3 = 閉じた (ブラウザの WebSocket と同じ値)
    this.buf = Buffer.alloc(0);
    sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    sock.on('close', () => { if (this.readyState !== 3) { this.readyState = 3; this.emit('close'); } });
    sock.on('error', () => sock.destroy());
  }

  parse() {
    while (this.buf.length >= 2) {
      const op = this.buf[0] & 0x0f;
      let len = this.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const masked = (this.buf[1] & 0x80) !== 0;
      const mask = masked ? this.buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      const data = Buffer.from(this.buf.subarray(off, off + len));
      this.buf = this.buf.subarray(off + len);
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      if (op === 1 || op === 2) this.emit('message', data);
      else if (op === 8) this.close();
      else if (op === 9) this.frame(10, data); // ping には pong を返す
    }
  }

  frame(op, data) {
    if (this.readyState !== 1 && op !== 8) return;
    const n = data.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 0xff]);
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.sock.write(Buffer.concat([head, data]));
  }

  send(text) { this.frame(1, Buffer.from(String(text))); }

  close(code = 1000) {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code);
    this.frame(8, body);
    this.sock.end();
  }
}

/** http.Server の upgrade を受けて、接続ごとに 'connection' (socket, req) を出す */
export class WebSocketServer extends EventEmitter {
  constructor({ server }) {
    super();
    server.on('upgrade', (req, sock) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) { sock.destroy(); return; }
      const accept = createHash('sha1').update(key + GUID).digest('base64');
      sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      this.emit('connection', new Socket(sock), req);
    });
  }
}
