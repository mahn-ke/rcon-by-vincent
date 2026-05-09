import express from 'express';
import RconModule from 'rcon-srcds';
const Rcon = RconModule.default ?? RconModule;

const RCON_SERVER = process.env.RCON_SERVER;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const ALLOWLIST_SECRET = process.env.ALLOWLIST_SECRET;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

function parseRconServer(serverStr) {
  if (!serverStr) {
    throw new Error('RCON_SERVER not configured');
  }
  const [host, port] = serverStr.split(':');
  if (!host || !port) {
    throw new Error('RCON_SERVER must be in format host:port');
  }
  return { host, port: Number.parseInt(port, 10) };
}

function validateMinecraftUsername(username) {
  // Minecraft usernames are 3-16 characters, alphanumeric and underscore
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

async function executeRconCommand(command) {
  if (!RCON_PASSWORD) {
    throw new Error('RCON_PASSWORD not configured');
  }
  const { host, port } = parseRconServer(RCON_SERVER);
  const server = new Rcon({ host, port });
  await server.authenticate(RCON_PASSWORD);
  return server.execute(command);
}

function generateLandingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Minecraft Allowlist</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      background-color: #ffffff;
      color: #000000;
    }

    @media (prefers-color-scheme: dark) {
      html {
        background-color: #1a1a1a;
        color: #ffffff;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: inherit;
      color: inherit;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 400px;
    }

    .card {
      background-color: #f9f9f9;
      border-radius: 12px;
      padding: 40px 30px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    @media (prefers-color-scheme: dark) {
      .card {
        background-color: #262626;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }
    }

    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .subtitle {
      font-size: 14px;
      color: #666666;
      margin-bottom: 30px;
    }

    @media (prefers-color-scheme: dark) {
      .subtitle {
        color: #aaaaaa;
      }
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #cccccc;
      border-radius: 6px;
      background-color: #f5f5f5;
      color: #000000;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    @media (prefers-color-scheme: dark) {
      input[type="text"],
      input[type="password"] {
        border-color: #444444;
        background-color: #2a2a2a;
        color: #ffffff;
      }
    }

    input[type="text"]:focus,
    input[type="password"]:focus {
      outline: none;
      border-color: #0066cc;
    }

    .button-group {
      display: flex;
      margin-top: 30px;
    }

    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-submit {
      background-color: #0066cc;
      color: white;
    }

    .btn-submit:hover {
      opacity: 0.9;
    }

    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .message {
      margin-top: 20px;
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
      display: none;
    }

    .message.error {
      background-color: #fee;
      color: #cc0000;
      border: 1px solid #ffcccc;
    }

    @media (prefers-color-scheme: dark) {
      .message.error {
        background-color: #4a2a2a;
        color: #ff9999;
        border: 1px solid #663333;
      }
    }

    .message.success {
      background-color: #efe;
      color: #009900;
      border: 1px solid #ccffcc;
    }

    @media (prefers-color-scheme: dark) {
      .message.success {
        background-color: #2a4a2a;
        color: #99ff99;
        border: 1px solid #336633;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🎮 Allowlist</h1>
      <p class="subtitle">Add yourself to the Minecraft server</p>
      
      <form id="allowlistForm">
        <div class="form-group">
          <label for="username">Minecraft Username</label>
          <input type="text" id="username" name="username" placeholder="YourUsername" required>
        </div>
        
        <div class="form-group">
          <label for="secret">Secret Key</label>
          <input type="password" id="secret" name="secret" placeholder="Enter secret key" required>
        </div>
        
        <div class="message" id="message"></div>
        
        <div class="button-group">
          <button type="submit" class="btn-submit" id="submitBtn">Add to Allowlist</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const form = document.getElementById('allowlistForm');
    const messageEl = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      messageEl.style.display = 'none';
      submitBtn.disabled = true;

      const username = document.getElementById('username').value;
      const secret = document.getElementById('secret').value;

      try {
        const response = await fetch('/allowlist/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, secret })
        });

        const data = await response.json();

        if (response.ok) {
          messageEl.className = 'message success';
          messageEl.textContent = '✓ Successfully added to allowlist!';
          form.reset();
        } else {
          messageEl.className = 'message error';
          messageEl.textContent = 'Something went wrong, please try again later.';
        }
      } catch (err) {
        messageEl.className = 'message error';
        messageEl.textContent = 'Something went wrong, please try again later.';
      } finally {
        messageEl.style.display = 'block';
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.send(generateLandingPage());
});

app.post('/allowlist/add', async (req, res) => {
  try {
    const { username, secret } = req.body;

    if (!username || typeof username !== 'string') {
      console.error('Invalid request: missing or invalid username');
      return res.status(400).json({ error: 'Something went wrong, please try again later.' });
    }

    if (!secret || typeof secret !== 'string') {
      console.error('Invalid request: missing or invalid secret');
      return res.status(400).json({ error: 'Something went wrong, please try again later.' });
    }

    if (!ALLOWLIST_SECRET) {
      console.error('Server misconfigured: ALLOWLIST_SECRET not set');
      return res.status(500).json({ error: 'Something went wrong, please try again later.' });
    }

    if (secret !== ALLOWLIST_SECRET) {
      console.error(`Authentication failed: invalid secret provided`);
      return res.status(403).json({ error: 'Something went wrong, please try again later.' });
    }

    if (!validateMinecraftUsername(username)) {
      console.error(`Invalid username format: ${username}`);
      return res.status(400).json({ error: 'Something went wrong, please try again later.' });
    }

    const response = await executeRconCommand(`gamemode survival ${username}`);
    console.log(`Successfully added ${username} to allowlist: ${response}`);
    res.status(200).json({ success: true, message: `Added ${username} to allowlist` });
  } catch (err) {
    console.error(`RCON error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong, please try again later.' });
  }
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

