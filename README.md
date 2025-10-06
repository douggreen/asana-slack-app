# Slack Asana Linker Bot

Automatically converts `#A<task_id>` references into clickable Asana links in Slack.

**Features:**
- ✅ Works immediately with just clickable links
- ✅ Optional: Add Asana API token to show task details (title, assignee, due date, status, project)
- ✅ Socket Mode - no public URL or deployment needed
- ✅ Works in public and private channels
- ✅ Replies in thread (keeps channels clean)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Slack App

#### A. Create App & Enable Socket Mode
1. Go to https://api.slack.com/apps → Create New App → From scratch
2. Name it (e.g., "Asana Linker") and select your workspace
3. Go to **Socket Mode** → Toggle **ON**

#### B. Create App-Level Token
1. Go to **Basic Information** → **App-Level Tokens**
2. Click **Generate Token and Scopes**
3. Name: "Socket Token", Scope: `connections:write`
4. **Copy the token** (starts with `xapp-`)

#### C. Add Bot Permissions
1. Go to **OAuth & Permissions** → **Bot Token Scopes**
2. Add these scopes:
   - `channels:history` - Read public channel messages
   - `chat:write` - Post messages
   - `groups:history` - Read private channel messages (important!)

#### D. Enable Event Subscriptions
1. Go to **Event Subscriptions** → Toggle **ON**
2. **Important:** If you see "Request URL" field:
   - Go to **Socket Mode** and toggle OFF then ON
   - Refresh Event Subscriptions page
   - The field should disappear
3. Under **Subscribe to bot events**, add:
   - `message.channels` - For public channels
   - `message.groups` - For private channels ⚠️ **Required!**
4. Click **Save Changes**

#### E. Install App to Workspace
1. Go to **OAuth & Permissions**
2. Click **Install to Workspace** (or **Reinstall** if you see it)
3. Authorize the app
4. **Copy the Bot User OAuth Token** (starts with `xoxb-`)

### 3. Configure Environment
Create a `.env` file:
```bash
cp .env.example .env
```

Add your tokens:
```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-level-token-here

# Optional: Show rich task details
ASANA_ACCESS_TOKEN=
```

### 4. Run the Bot
```bash
npm start
```

You'll see:
```
⚡️ Asana Linker bot is running!

ℹ️  Asana API integration DISABLED
   Bot will show: Clickable links only

   To enable rich task details:
   1. Get a token from: https://app.asana.com/0/my-apps
   2. Add to .env: ASANA_ACCESS_TOKEN=your-token-here
   3. Restart the bot
```

### 5. Use in Slack
1. Invite bot to a channel: `/invite @YourBotName`
2. Post a message: `Working on #A1211411476112291`
3. Bot replies in thread: `📎 Asana ticket: #A1211411476112291` (clickable link)

---

## Optional: Enable Rich Task Details

To show task title, assignee, due date, status, and project name:

### Get Asana Personal Access Token
1. Go to https://app.asana.com/0/my-apps
2. Click **+ Create new personal access token**
3. Name it "Slack Bot"
4. **Copy the token** (starts with `1/`)

### Add to Configuration
Edit `.env` and add:
```
ASANA_ACCESS_TOKEN=1/1234567890abcdef:your-token-here
```

### Restart Bot
```bash
npm start
```

You'll now see:
```
✅ Asana API integration ENABLED
   Bot will show: Task title, assignee, due date, status, project
```

**Example output with API enabled:**
```
📎 Fix login bug • ✅ Completed • 👤 John Smith • 📅 Due: 2025-10-15 • 📁 Mobile App
```

---

## Running in Production

For 24/7 operation on a server:

### Option 1: pm2 (Recommended)
```bash
npm install -g pm2
pm2 start app.js --name asana-linker
pm2 save
pm2 startup  # Follow instructions to start on boot
```

### Option 2: systemd (Linux)
Create `/etc/systemd/system/asana-linker.service`:
```ini
[Unit]
Description=Asana Linker Slack Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/bot
ExecStart=/usr/bin/node app.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable asana-linker
sudo systemctl start asana-linker
```

### Option 3: Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "app.js"]
```

### Option 4: Screen/tmux (Simple)
```bash
screen -S asana-bot
npm start
# Press Ctrl+A then D to detach
```

---

## Troubleshooting

### Bot doesn't respond in private channels
**Most common issue!** You need BOTH event subscriptions:
- `message.channels` (public channels)
- `message.groups` (private channels) ⚠️

**Fix:**
1. Go to Event Subscriptions → Add `message.groups`
2. Save changes
3. Reinstall app to workspace
4. Remove bot from channel: `/remove @YourBot`
5. Re-invite bot: `/invite @YourBot`

### Bot doesn't respond at all
- ✅ Check bot is invited: `/invite @YourBotName`
- ✅ Verify tokens in `.env` are correct
- ✅ Ensure Socket Mode is enabled
- ✅ Check bot process is running
- ✅ Look at console for error messages

### "Can't save Event Subscriptions"
- Socket Mode may not be fully enabled
- Toggle Socket Mode OFF then back ON
- Refresh Event Subscriptions page (Ctrl+F5)
- Request URL field should disappear

### Asana API not working
- Check token starts with `1/`
- Verify you have access to the tasks
- Check console for authentication errors
- Bot gracefully falls back to links-only if API fails

### Invalid tokens
- `SLACK_BOT_TOKEN` should start with `xoxb-`
- `SLACK_APP_TOKEN` should start with `xapp-`
- `ASANA_ACCESS_TOKEN` should start with `1/`

---

## How It Works

1. Bot listens for messages in channels (via Socket Mode WebSocket connection)
2. Scans for `#A<digits>` pattern (e.g., `#A1211411476112291`)
3. If Asana token configured: Fetches task details via Asana API
4. Posts threaded reply with link (and details if available)
5. Multiple tickets in one message? Shows them all!

**Pattern recognized:** `#A` followed by any digits
**Example:** `#A1211411476112291`, `#A123`, `#A999999999999999`

---

## FAQ

**Q: Do I need an Asana account?**
A: No! The bot works with just links. Asana API is optional for rich details.

**Q: Will this work in DMs?**
A: Yes! Add `message.im` to Event Subscriptions.

**Q: Can I customize the format?**
A: Yes! Edit the `formatTaskDetails()` function in `app.js`.

**Q: What about rate limits?**
A: Asana allows 150 requests/minute. For normal team usage, you won't hit this.

**Q: Is my Asana token secure?**
A: Keep it in `.env` (gitignored). Don't commit it to version control.

**Q: Can multiple teams use this?**
A: Yes, but each needs their own Slack app and bot instance.

---

## Files

- `app.js` - Main bot (works with or without Asana API)
- `package.json` - Dependencies
- `.env` - Your configuration (create from `.env.example`)
- `.env.example` - Configuration template

---

## License

MIT
