// Simple web interface to set a player's gamemode to survival via RCON.
// Env vars required:
//   AUTH_PASSWORD   (password required in the form)
//   RCON_HOST       (RCON server host)
//   RCON_PORT       (RCON server port, e.g. 25575)
//   RCON_PASSWORD   (RCON password)
// Optional:
//   PORT            (HTTP port, default 80; falls back to 3000 if EACCES)

const http = require('http');
const Rcon = require('rcon');

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const RCON_HOST = process.env.RCON_HOST || 'localhost';
const RCON_PORT = parseInt(process.env.RCON_PORT || '25575', 10);
const RCON_PASSWORD = process.env.RCON_PASSWORD || '';
const HTTP_PORT = parseInt(process.env.PORT || '80', 10);

let rconReady = false;
let rcon;

function connectRcon() {
    rcon = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);

    rcon.on('auth', () => {
        rconReady = true;
        console.log('RCON connected');
    });

    rcon.on('response', (str) => {
        // Log responses for visibility
        console.log('RCON response:', str);
    });

    rcon.on('error', (err) => {
        console.error('RCON error:', err);
    });

    rcon.on('end', () => {
        console.log('RCON disconnected, attempting reconnect in 5s');
        rconReady = false;
        setTimeout(connectRcon, 5000);
    });

    rcon.connect();
}

connectRcon();

function renderForm(message = '', username = '') {
    const prefersDarkMode = `
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #121212;
                color: #e0e0e0;
            }
            input, button {
                background-color: #333;
                color: #e0e0e0;
                border: 1px solid #444;
            }
            input:focus, button:focus {
                outline: 2px solid #555;
            }
            .msg {
                color: #c00;
                background-color: #121212;
            }
            .ok {
                color: #060;
                background-color: #121212;
            }
        }
    `;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Set Survival Mode</title>
<style>
body {
    font-family: system-ui;
    margin: 2rem;
    max-width: 420px;
}
form {
    display: flex;
    flex-direction: column;
    gap: .75rem;
}
input, button {
    padding: .5rem;
    font-size: 1rem;
}
${prefersDarkMode}
</style>
</head><body>
<h1>Set Gamemode: Survival</h1>
${message ? `<div class="${message.startsWith('Success') ? 'ok' : 'msg'}">${message.replace(/</g, '&lt;')}</div>` : ''}
<form method="POST" action="/set">
<label>Username <input name="username" value="${username.replace(/</g, '&lt;').replace(/>/g, '&gt;')}" required pattern="[A-Za-z0-9_]{3,16}" /></label>
<label>Password <input name="password" type="password" required /></label>
<button type="submit">Set to Survival</button>
</form>
</body></html>`;
}

function sendGamemode(username, callback) {
    if (!rconReady) return callback(new Error('RCON not connected'));
    // Minecraft command (without leading slash works via RCON)
    const cmd = `gamemode survival ${username}`;
    let handled = false;
    const onResponse = (resp) => {
        if (handled) return;
        handled = true;
        callback(null, resp);
    };
    const onError = (err) => {
        if (handled) return;
        handled = true;
        callback(err);
    };
    // Temporary listeners; 'rcon' lib does not support per-command callbacks directly,
    // so we approximate by using first next response. This is simplistic.
    rcon.once('response', onResponse);
    rcon.once('error', onError);
    try {
        rcon.send(cmd);
    } catch (e) {
        rcon.removeListener('response', onResponse);
        rcon.removeListener('error', onError);
        callback(e);
    }
    // Fallback timeout
    setTimeout(() => {
        if (!handled) {
            handled = true;
            rcon.removeListener('response', onResponse);
            rcon.removeListener('error', onError);
            callback(new Error('RCON command timeout'));
        }
    }, 5000);
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
        return res.end(renderForm());
    }

    if (req.method === 'POST' && req.url === '/set') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2048) {
                body = '';
                res.writeHead(413, {'Content-Type':'text/plain'});
                res.end('Payload too large');
                req.destroy();
            }
        });
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const username = (params.get('username') || '').trim();
            const password = params.get('password') || '';

            if (!AUTH_PASSWORD) {
                res.writeHead(500, {'Content-Type':'text/html'});
                return res.end(renderForm('Server not configured (AUTH_PASSWORD missing).', username));
            }
            if (password !== AUTH_PASSWORD) {
                res.writeHead(403, {'Content-Type':'text/html'});
                return res.end(renderForm('Invalid password.', username));
            }
            if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
                res.writeHead(400, {'Content-Type':'text/html'});
                return res.end(renderForm('Invalid username format.', username));
            }
            if (!rconReady) {
                res.writeHead(503, {'Content-Type':'text/html'});
                return res.end(renderForm('RCON not connected yet. Try again shortly.', username));
            }

            sendGamemode(username, (err, resp) => {
                if (err) {
                    res.writeHead(500, {'Content-Type':'text/html'});
                    return res.end(renderForm('Failed: ' + err.message, username));
                }
                if (resp && /No player was found/i.test(resp)) {
                    res.writeHead(400, {'Content-Type':'text/html'});
                    return res.end(renderForm('Player not found; you need to be logged in.', username));
                }
                res.writeHead(200, {'Content-Type':'text/html'});
                res.end(renderForm('Success: survival mode command sent for ' + username));
            });
        });
        return;
    }

    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('Not found');
});

server.on('error', (err) => {
    if (err.code === 'EACCES' && HTTP_PORT === 80) {
        console.warn('Port 80 requires elevated privileges. Retrying on 3000.');
        server.listen(3000, () => console.log('HTTP listening on port 3000 (fallback).'));
    } else {
        console.error('Server error:', err);
    }
});

server.listen(HTTP_PORT, () => {
    console.log(`HTTP listening on port ${HTTP_PORT}`);
});
