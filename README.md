# Slack Asana Linker Bot

A Slack bot that automatically converts `#A<task_id>` references into clickable Asana links.

**Uses Socket Mode** - No public URL or server deployment required!

## Example

When someone posts: "Working on #A1211411476112291 today"

The bot replies in thread: "📎 Asana ticket: #A1211411476112291" (clickable link to Asana)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Slack App

Your Slack app needs these settings:

#### A. Enable Socket Mode
1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. Go to **"Socket Mode"** in the left sidebar
4. Toggle **"Enable Socket Mode"** to ON

#### B. Create App-Level Token
1. Go to **"Basic Information"**
2. Scroll to **"App-Level Tokens"**
3. Click **"Generate Token and Scopes"**
4. Name: "Socket Token" (or anything you like)
5. Add scope: `connections:write`
6. Click **"Generate"**
7. **Copy and save the token** (starts with `xapp-`)

#### C. Bot Token Scopes (OAuth & Permissions)
Make sure your bot has:
- `channels:history` - Read messages in public channels
- `chat:write` - Post messages

#### D. Event Subscriptions
1. Enable **Event Subscriptions**
2. **Important**: If you see a "Request URL" field, Socket Mode isn't fully activated yet
   - Go back to **"Socket Mode"** and toggle it OFF then back ON
   - Refresh the Event Subscriptions page (Ctrl+F5 / Cmd+Shift+R)
   - The Request URL field should disappear
3. Subscribe to bot events:
   - `message.channels` - Listen to channel messages
4. **No Request URL needed!** (Socket Mode handles this)
5. Click **"Save Changes"**

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your tokens:
```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-level-token-here
```

### 4. Run the Bot

```bash
npm start
```

You should see:
```
⚡️ Asana Linker bot is running in Socket Mode!
🔌 Connected to Slack via WebSocket
```

The bot will now respond to messages as long as it's running!

### 5. Invite Bot to Channels

In any channel where you want the bot to work:
```
/invite @YourBotName
```

## Running in Production

For 24/7 availability, run this on a server using:

### Option 1: pm2 (Process Manager)
```bash
npm install -g pm2
pm2 start app.js --name asana-linker
pm2 save
pm2 startup  # Follow the instructions
```

### Option 2: systemd (Linux)
Create a service file at `/etc/systemd/system/asana-linker.service`

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

## How It Works

1. Listens for messages in channels where the bot is added
2. Scans for `#A<digits>` pattern (e.g., `#A1211411476112291`)
3. Converts to Asana URL: `https://app.asana.com/0/TASK_ID/TASK_ID`
4. Replies in thread with clickable link

## Features

- ✅ Handles multiple ticket references in one message
- ✅ Replies in thread (non-intrusive)
- ✅ Deduplicates repeated ticket numbers
- ✅ Uses Slack's link formatting for clean display

## Troubleshooting

### Bot doesn't respond
- Check that the bot is invited to the channel (`/invite @YourBotName`)
- Verify both tokens are set correctly in `.env`
- Make sure Socket Mode is enabled in your Slack app settings
- Check app logs for errors
- Ensure the bot process is running

### "Invalid app_token" error
- Make sure you created an App-Level Token with `connections:write` scope
- Check that `SLACK_APP_TOKEN` starts with `xapp-`

### Connection issues
- Verify your server has outbound internet access
- Check firewall rules allow WebSocket connections
- Socket Mode connects to Slack, so inbound access is not needed

### Links don't work
- Verify the Asana task ID is correct
- The format `https://app.asana.com/0/TASK_ID/TASK_ID` should work for all tasks

## License

MIT
