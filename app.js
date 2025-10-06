const { App } = require('@slack/bolt');
require('dotenv').config();

// Initialize the app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false, // Set to true if using Socket Mode instead of HTTP
  port: process.env.PORT || 3000
});

// Regular expression to match #A followed by digits
const ASANA_PATTERN = /#A(\d+)/g;

// Listen for messages in channels
app.message(async ({ message, say }) => {
  // Only process messages with text (ignore bot messages, etc.)
  if (!message.text || message.subtype) {
    return;
  }

  // Find all Asana ticket references in the message
  const matches = [...message.text.matchAll(ASANA_PATTERN)];
  
  if (matches.length === 0) {
    return; // No Asana tickets found
  }

  // Extract unique task IDs
  const taskIds = [...new Set(matches.map(match => match[1]))];
  
  // Build response message with links
  let responseText = '';
  
  if (taskIds.length === 1) {
    const taskId = taskIds[0];
    const asanaUrl = `https://app.asana.com/0/${taskId}/${taskId}`;
    responseText = `📎 Asana ticket: <${asanaUrl}|#A${taskId}>`;
  } else {
    responseText = '📎 Asana tickets:\n';
    taskIds.forEach(taskId => {
      const asanaUrl = `https://app.asana.com/0/${taskId}/${taskId}`;
      responseText += `• <${asanaUrl}|#A${taskId}>\n`;
    });
  }

  // Post response as a threaded reply
  try {
    await say({
      text: responseText,
      thread_ts: message.ts, // Reply in thread
      unfurl_links: false // Prevent Slack from unfurling the Asana link
    });
  } catch (error) {
    console.error('Error posting message:', error);
  }
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log('⚡️ Asana Linker bot is running!');
    console.log(`🚀 Server listening on port ${process.env.PORT || 3000}`);
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});
