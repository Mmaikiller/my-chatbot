const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');

let mainWindow;
let webhookServer;
let pages = [];

// ========== Express Webhook Server ==========
function startWebhookServer(port = 3000) {
  const server = express();
  server.use(express.json());

  server.get('/', (req, res) => {
    res.send('Chatbot is running!');
  });

  server.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === 'my_verify_token') {
      console.log('Webhook verified!');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  server.post('/webhook', (req, res) => {
    const data = req.body;
    if (data.object === 'page') {
      data.entry.forEach(entry => {
        entry.messaging.forEach(event => {
          const senderId = event.sender.id;
          const messageText = event.message?.text;
          if (messageText) {
            console.log(`Message from ${senderId}: ${messageText}`);
            // Send to renderer
            if (mainWindow) {
              mainWindow.webContents.send('new-message', {
                sender: senderId,
                text: messageText,
                time: new Date().toISOString()
              });
            }
            // Auto reply
            const activePage = pages.find(p => p.active);
            if (activePage) {
              sendMessage(activePage.token, senderId, `คุณพิมพ์ว่า: ${messageText}`);
            }
          }
        });
      });
    }
    res.sendStatus(200);
  });

  webhookServer = server.listen(port, () => {
    console.log(`Webhook server running on port ${port}`);
  });
}

// ========== Send Message via Graph API ==========
async function sendMessage(pageAccessToken, recipientId, text) {
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text },
        access_token: pageAccessToken
      })
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Send message error:', error);
  }
}

// ========== IPC Handlers ==========
ipcMain.handle('add-page', async (event, { token }) => {
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`);
    const data = await response.json();
    if (data.id) {
      const page = {
        id: data.id,
        name: data.name,
        token: token,
        active: pages.length === 0,
        postCount: 0
      };
      pages.push(page);
      return { success: true, page };
    }
    return { success: false, error: 'Token ไม่ถูกต้อง' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-pages', () => {
  return pages;
});

ipcMain.handle('remove-page', (event, pageId) => {
  pages = pages.filter(p => p.id !== pageId);
  return pages;
});

ipcMain.handle('activate-page', (event, pageId) => {
  pages.forEach(p => p.active = p.id === pageId);
  return pages;
});

ipcMain.handle('send-message', async (event, { recipientId, text }) => {
  const activePage = pages.find(p => p.active);
  if (!activePage) return { success: false, error: 'ไม่มี Page ที่เลือก' };
  return await sendMessage(activePage.token, recipientId, text);
});

ipcMain.handle('get-webhook-url', () => {
  const externalIp = 'YOUR_RENDER_URL'; // User should replace with their Render URL
  return `https://my-chatbot-1-2cuw.onrender.com/webhook`;
});

// ========== Create Window ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  startWebhookServer(3000);
});

app.on('window-all-closed', () => {
  if (webhookServer) webhookServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
