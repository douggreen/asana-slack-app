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

// Check if Asana API is configured
const ASANA_ENABLED = !!process.env.ASANA_ACCESS_TOKEN;

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
    return `📎 <${asanaUrl}|#A${taskId}>`;
  }

  if (taskDetails.error) {
    return `📎 <${asanaUrl}|#A${taskId}> _(${taskDetails.error})_`;
  }

  // Build rich format with task details
  let parts = [`📎 <${asanaUrl}|*${taskDetails.name || 'Untitled'}*>`];
  
  if (taskDetails.completed) {
    parts.push('✅ Completed');
  }
  
  if (taskDetails.assignee?.name) {
    parts.push(`👤 ${taskDetails.assignee.name}`);
  }
  
  if (taskDetails.due_on) {
    parts.push(`📅 Due: ${taskDetails.due_on}`);
  }
  
  if (taskDetails.projects && taskDetails.projects.length > 0) {
    const projectName = taskDetails.projects[0].name;
    parts.push(`📁 ${projectName}`);
  }

  return parts.join(' • ');
}

// Listen for messages in channels
app.message(async ({ message, say }) => {
  // Only process messages with text (ignore bot messages, etc.)
  if (!message.text || message.subtype) {
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
    responseText = '📎 *Asana tickets:*\n';
    taskIds.forEach((taskId, index) => {
      responseText += `• ${formatTaskDetails(taskId, taskDetailsArray[index])}\n`;
    });
  }

  // Post response as a threaded reply
  try {
    await say({
      text: responseText,
      thread_ts: message.ts,
      unfurl_links: false
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
    console.log('');
    
    // Display Asana API status
    if (ASANA_ENABLED) {
      console.log('✅ Asana API integration ENABLED');
      console.log('   Bot will show: Task title, assignee, due date, status, project');
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
