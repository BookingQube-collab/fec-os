# iFace990 Raspberry Pi bridge

The iFace990 Cloud Server client only sends plain HTTP. Put a Raspberry Pi on the same LAN as the clock. The Pi listens on that network and forwards each `/iclock` request to `https://e3fec.vercel.app`, then returns the upstream status and body unchanged. The clock talks to the Pi. It does not talk to the public site.

## Clock settings

On the iFace990: **Menu → Comm. → Cloud Server**.

- Enable Domain Name: **OFF** (Server Address is an IP)
- Server Address: the Pi's LAN IP (`hostname -I` on the Pi)
- Server Port: **8081**
- Proxy: **OFF**, if that field is shown

This screen has no HTTPS field and no comm key. Leave any extra key field empty. Port **80** also works if you run the script as root; **8081** does not need root.

## Script

Save this as `/home/pi/iclock-forward.py`. Replace `pi` with your username (`whoami`) if the account is not `pi`. Python 3 only; no packages to install.

The app accepts **GET, POST, HEAD, and OPTIONS** on `/iclock` and `/iclock/...`, including `cdata`, `getrequest`, `devicecmd`, `registry`, `ping`, and `.aspx` names. The script forwards those paths and the query string as the clock sent them. Any other path gets **404**.

```python
#!/usr/bin/env python3
"""Forward iFace990 plain HTTP ADMS to https://e3fec.vercel.app."""

import sys
from http.client import HTTPSConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_HOST = "e3fec.vercel.app"
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8081
TIMEOUT_SECONDS = 20

# Hop-by-hop headers. Host is set by HTTPSConnection to e3fec.vercel.app.
# Do not add a comm key. Content-Type and any SN or comm headers are forwarded.
SKIP_REQUEST_HEADERS = {
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
}
SKIP_RESPONSE_HEADERS = SKIP_REQUEST_HEADERS | {"date", "server"}


def read_body(handler):
    transfer = handler.headers.get("Transfer-Encoding", "")
    if "chunked" in transfer.lower():
        chunks = []
        while True:
            line = handler.rfile.readline()
            if not line:
                break
            size = int(line.split(b";", 1)[0], 16)
            if size == 0:
                while True:
                    trailer = handler.rfile.readline()
                    if trailer in (b"\r\n", b"\n", b""):
                        break
                break
            chunks.append(handler.rfile.read(size))
            handler.rfile.read(2)
        return b"".join(chunks)
    raw_length = handler.headers.get("Content-Length")
    if not raw_length:
        return b""
    length = int(raw_length)
    if length <= 0:
        return b""
    return handler.rfile.read(length)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def do_HEAD(self):
        self.forward()

    def do_OPTIONS(self):
        self.forward()

    def log_message(self, fmt, *args):
        return

    def forward(self):
        path = self.path
        bare = path.split("?", 1)[0]
        folded = bare.lower()
        if folded != "/iclock" and not folded.startswith("/iclock/"):
            self.send_plain(404, b"Not Found")
            print(f"{self.command} {path} 404", flush=True)
            return

        try:
            body = read_body(self)
        except Exception as exc:
            self.send_plain(400, b"ERROR")
            print(f"{self.command} {path} 400 {type(exc).__name__}", flush=True)
            return

        headers = {}
        for key, value in self.headers.items():
            if key.lower() in SKIP_REQUEST_HEADERS:
                continue
            headers[key] = value

        payload = body if (body or self.command == "POST") else None
        conn = HTTPSConnection(UPSTREAM_HOST, 443, timeout=TIMEOUT_SECONDS)
        started = False
        try:
            conn.request(self.command, path, body=payload, headers=headers)
            upstream = conn.getresponse()
            status = upstream.status
            response_body = upstream.read()
            self.send_response(status, upstream.reason)
            started = True
            for key, value in upstream.getheaders():
                if key.lower() in SKIP_RESPONSE_HEADERS:
                    continue
                self.send_header(key, value)
            if self.command == "HEAD":
                response_body = b""
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            if response_body and self.command != "HEAD":
                self.wfile.write(response_body)
            print(f"{self.command} {path} {status}", flush=True)
        except Exception as exc:
            if not started:
                self.send_plain(502, b"ERROR")
                print(f"{self.command} {path} 502 {type(exc).__name__}", flush=True)
            else:
                print(f"{self.command} {path} {status} {type(exc).__name__}", flush=True)
        finally:
            conn.close()

    def send_plain(self, status, body):
        data = b"" if self.command == "HEAD" else body
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)


def main():
    port = LISTEN_PORT
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((LISTEN_HOST, port), Handler)
    print(f"listening on {LISTEN_HOST}:{port} -> https://{UPSTREAM_HOST}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
```

## Run it

Find the Pi IP and try the forwarder in the foreground. Stop it with Ctrl+C.

```bash
hostname -I
python3 /home/pi/iclock-forward.py
```

The first address from `hostname -I` is the Server Address on the clock. To use port 80 instead, set Server Port to 80 and run `sudo python3 /home/pi/iclock-forward.py 80`.

Set the Pi clock (`sudo timedatectl set-ntp true`) so HTTPS certificate checks succeed.

Save this unit as `/etc/systemd/system/iclock-forward.service`. Change `pi` to your username in `User=` and both paths.

```ini
[Unit]
Description=iFace990 iClock HTTP forwarder
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /home/pi/iclock-forward.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now iclock-forward.service
sudo systemctl status iclock-forward.service
journalctl -u iclock-forward.service -f
```

## How to tell it works

On the Pi, each poll is one line, for example `GET /iclock/getrequest?SN=AF4C214460188 200` or `POST /iclock/cdata?SN=AF4C214460188 200`.

On FEC attendance settings, open **Devices** and find serial **AF4C214460188**. It stays **Never connected** until that clock polls. After a poll the server accepted, the badge is **Online** when the server heard from it within the last 5 minutes.
