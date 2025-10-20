const { App } = require('@slack/bolt');
const axios = require('axios');
require('dotenv').config();

// Initialize the app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Regular expression to match #A followed by digits
const ASANA_PATTERN = /#A(\d+)/g;

// Store mapping between original message timestamps and bot reply timestamps
// Key: original message ts, Value: { channel: channel_id, reply_ts: bot_reply_ts }
// Note: In production, use Redis or a database for persistence
const messageMap = new Map();

// Check if Asana API is configured
const ASANA_ENABLED = !!process.env.ASANA_ACCESS_TOKEN;

// Parse DISPLAY configuration (defaults to all fields)
const DEFAULT_DISPLAY = 'link,ticket,completed,assignee,due_on,projects';
const DISPLAY_FIELDS = (process.env.DISPLAY || DEFAULT_DISPLAY)
  .split(',')
  .map(field => field.trim().toLowerCase())
  .filter(field => field.length > 0);

// Helper to check if a field should be displayed
function shouldDisplay(field) {
  return DISPLAY_FIELDS.includes(field);
}

// Fetch task details from Asana API
async function getAsanaTaskDetails(taskId) {
  if (!ASANA_ENABLED) {
    return null;
  }

  try {
    const response = await axios.get(`https://app.asana.com/api/1.0/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.ASANA_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      },
      params: {
        opt_fields: 'name,completed,assignee.name,due_on,projects.name'
      }
    });

    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return { error: 'Task not found' };
    } else if (error.response?.status === 401) {
      console.error('⚠️  Asana API authentication failed. Check your ASANA_ACCESS_TOKEN.');
      return null;
    } else {
      console.error('Error fetching Asana task:', error.message);
      return null;
    }
  }
}

// Format task details for Slack
function formatTaskDetails(taskId, taskDetails) {
  const asanaUrl = `https://app.asana.com/0/${taskId}/${taskId}`;

  if (!taskDetails) {
    // No API token or API error - just return the link
    return `<${asanaUrl}|#A${taskId}>`;
  }

  if (taskDetails.error) {
    return `<${asanaUrl}|#A${taskId}> _(${taskDetails.error})_`;
  }

  // Build rich format with task details based on DISPLAY configuration
  let parts = [];

  // Link is always first if enabled
  if (shouldDisplay('link')) {
    parts.push(`<${asanaUrl}|*${taskDetails.name || 'Untitled'}*>`);
  }

  // Ticket number
  if (shouldDisplay('ticket')) {
    parts.push(`#A${taskId}`);
  }

  if (shouldDisplay('completed') && taskDetails.completed) {
    parts.push('✅ Completed');
  }

  if (shouldDisplay('assignee') && taskDetails.assignee?.name) {
    parts.push(`👤 ${taskDetails.assignee.name}`);
  }

  if (shouldDisplay('due_on') && taskDetails.due_on) {
    parts.push(`📅 Due: ${taskDetails.due_on}`);
  }

  if (shouldDisplay('projects') && taskDetails.projects && taskDetails.projects.length > 0) {
    const projectName = taskDetails.projects[0].name;
    parts.push(`📁 ${projectName}`);
  }

  // If no parts were added (all fields disabled), at least show the link
  if (parts.length === 0) {
    return `<${asanaUrl}|#A${taskId}>`;
  }

  return parts.join(' • ');
}

// Listen for messages in channels
app.message(async ({ message, say }) => {
  // Only process messages with text (ignore bot messages, etc.)
  if (!message.text || message.subtype || message.bot_id) {
    return;
  }

  // Find all Asana ticket references in the message
  const matches = [...message.text.matchAll(ASANA_PATTERN)];

  if (matches.length === 0) {
    return;
  }

  // Extract unique task IDs
  const taskIds = [...new Set(matches.map(match => match[1]))];

  // Fetch details for all tasks (if API token is configured)
  const taskDetailsPromises = taskIds.map(taskId => getAsanaTaskDetails(taskId));
  const taskDetailsArray = await Promise.all(taskDetailsPromises);

  // Build response message
  let responseText = '';

  if (taskIds.length === 1) {
    responseText = formatTaskDetails(taskIds[0], taskDetailsArray[0]);
  } else {
    responseText = '*Asana tickets:*\n';
    taskIds.forEach((taskId, index) => {
      responseText += `• ${formatTaskDetails(taskId, taskDetailsArray[index])}\n`;
    });
  }

  // Post response as a threaded reply
  try {
    const response = await say({
      text: responseText,
      thread_ts: message.ts,
      unfurl_links: false
    });

    // Store the mapping for deletion tracking
    if (response && response.ts) {
      messageMap.set(message.ts, {
        channel: message.channel,
        reply_ts: response.ts
      });
    }
  } catch (error) {
    console.error('Error posting message:', error);
  }
});

// Listen for message deletions
app.message(async ({ message, client }) => {
  // Only process deletion events
  if (message.subtype !== 'message_deleted') {
    return;
  }

  // Check if we have a bot reply for the deleted message
  const deletedMessageTs = message.deleted_ts;
  const botReply = messageMap.get(deletedMessageTs);

  if (!botReply) {
    return; // No bot reply to update
  }

  try {
    // Option 1: Delete the bot's reply entirely (uncomment to use)
    // await client.chat.delete({
    //   token: process.env.SLACK_BOT_TOKEN,
    //   channel: botReply.channel,
    //   ts: botReply.reply_ts
    // });

    // Option 2: Update the bot's reply to indicate deletion (default)
    await client.chat.update({
      token: process.env.SLACK_BOT_TOKEN,
      channel: botReply.channel,
      ts: botReply.reply_ts,
      text: '_(Original message containing Asana ticket reference was deleted)_'
    });

    // Clean up the mapping
    messageMap.delete(deletedMessageTs);
    console.log(`✅ Updated bot reply for deleted message: ${deletedMessageTs}`);
  } catch (error) {
    console.error('Error handling message deletion:', error.message);
  }
});

// Listen for message edits/updates
app.message(async ({ message, client, say }) => {
  // Only process edit events
  if (message.subtype !== 'message_changed') {
    return;
  }

  // Extract the edited message details
  const editedMessage = message.message;
  const originalTs = editedMessage.ts;

  // Check if we have a bot reply for this message
  const botReply = messageMap.get(originalTs);

  if (!botReply) {
    return; // No bot reply to update
  }

  // Check if the edited message still contains Asana ticket references
  const matches = editedMessage.text ? [...editedMessage.text.matchAll(ASANA_PATTERN)] : [];

  try {
    if (matches.length === 0) {
      // No more Asana references - update to show they were removed
      await client.chat.update({
        token: process.env.SLACK_BOT_TOKEN,
        channel: botReply.channel,
        ts: botReply.reply_ts,
        text: '_(Original message edited - Asana ticket references removed)_'
      });

      // Clean up the mapping
      messageMap.delete(originalTs);
      console.log(`✅ Updated bot reply for edited message (references removed): ${originalTs}`);
    } else {
      // Still has Asana references - regenerate the response
      const taskIds = [...new Set(matches.map(match => match[1]))];

      // Fetch details for all tasks
      const taskDetailsPromises = taskIds.map(taskId => getAsanaTaskDetails(taskId));
      const taskDetailsArray = await Promise.all(taskDetailsPromises);

      // Build response message
      let responseText = '';

      if (taskIds.length === 1) {
        responseText = formatTaskDetails(taskIds[0], taskDetailsArray[0]);
      } else {
        responseText = '*Asana tickets:*\n';
        taskIds.forEach((taskId, index) => {
          responseText += `• ${formatTaskDetails(taskId, taskDetailsArray[index])}\n`;
        });
      }

      // Add note that this was from an edited message
      responseText += '\n_(Updated: original message was edited)_';

      // Update the bot's reply
      await client.chat.update({
        token: process.env.SLACK_BOT_TOKEN,
        channel: botReply.channel,
        ts: botReply.reply_ts,
        text: responseText
      });

      console.log(`✅ Updated bot reply for edited message: ${originalTs}`);
    }
  } catch (error) {
    console.error('Error handling message edit:', error.message);
  }
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log('⚡️ Asana Linker bot is running!');
    console.log('');

    // Display Asana API status
    if (ASANA_ENABLED) {
      console.log('✅ Asana API integration ENABLED');
      console.log(`   Display fields: ${DISPLAY_FIELDS.join(', ')}`);
    } else {
      console.log('ℹ️  Asana API integration DISABLED');
      console.log('   Bot will show: Clickable links only');
      console.log('');
      console.log('   To enable rich task details:');
      console.log('   1. Get a token from: https://app.asana.com/0/my-apps');
      console.log('   2. Add to .env: ASANA_ACCESS_TOKEN=your-token-here');
      console.log('   3. Restart the bot');
    }
    console.log('');

    // Optional: Post startup message to test channel
    if (process.env.TEST_CHANNEL_ID) {
      try {
        const statusMsg = ASANA_ENABLED
          ? '🤖 Asana Linker bot has started! (with task details enabled)'
          : '🤖 Asana Linker bot has started! (showing links only - add ASANA_ACCESS_TOKEN for task details)';

        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.TEST_CHANNEL_ID,
          text: statusMsg
        });
      } catch (error) {
        console.error('Could not post startup message:', error.message);
      }
    }
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await app.stop();
  process.exit(0);
});
