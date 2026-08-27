const { ipcRenderer, clipboard } = require('electron');

const RENDER_URL = 'https://my-chatbot-1-2cuw.onrender.com';

let pages = [];
let messageLogs = [];

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${pageName}"]`).classList.add('active');
  if (pageName === 'auto-reply') loadKeywords();
}

function minimizeWindow() {}
function maximizeWindow() {}
function closeWindow() {
  if (confirm('ต้องการปิดแอปพลิเคชัน?')) window.close();
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== Pages ==========
async function addPage() {
  const tokenInput = document.getElementById('page-token-input');
  const token = tokenInput.value.trim();
  if (!token) { showToast('กรุณาใส่ Page Access Token', 'error'); return; }
  try {
    const result = await ipcRenderer.invoke('add-page', { token });
    if (result.success) {
      pages.push(result.page);
      renderPages();
      tokenInput.value = '';
      showToast(`เพิ่มเพจ "${result.page.name}" สำเร็จ!`, 'success');
    } else {
      showToast(result.error || 'Token ไม่ถูกต้อง', 'error');
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function removePage(pageId) {
  if (confirm('ต้องการลบเพจนี้?')) {
    pages = pages.filter(p => p.id !== pageId);
    renderPages();
    showToast('ลบเพจสำเร็จ', 'success');
  }
}

async function activatePage(pageId) {
  pages.forEach(p => p.active = (p.id === pageId));
  renderPages();
}

function pasteToken() {
  document.getElementById('page-token-input').value = clipboard.readText();
  showToast('วาง Token แล้ว', 'info');
}

function renderPages() {
  const pagesList = document.getElementById('pages-list');
  const pagesListDashboard = document.getElementById('pages-list-dashboard');
  const pageCount = document.getElementById('page-count');
  const totalPages = document.getElementById('total-pages');
  pageCount.textContent = pages.length;
  totalPages.textContent = pages.length;
  if (pages.length === 0) {
    const emptyHtml = '<div class="empty-state"><p>ยังไม่มีเพจที่เชื่อมต่อ</p></div>';
    pagesList.innerHTML = emptyHtml;
    pagesListDashboard.innerHTML = emptyHtml;
    return;
  }
  let html = '';
  pages.forEach(page => {
    const initials = page.name.charAt(0);
    const badgeClass = page.active ? 'badge-active' : 'badge-inactive';
    const activeClass = page.active ? 'active-page' : '';
    html += `
      <div class="page-card ${activeClass}">
        <div class="page-card-info">
          <div class="page-card-avatar">${initials}</div>
          <div class="page-card-details">
            <h3>${page.name} <span class="badge ${badgeClass}">${page.active ? '✅ ใช้งาน' : '⏳ ไม่ใช้งาน'}</span></h3>
            <small>Page ID: ${page.id}</small><br>
            <small>Access Token: ${page.token.substring(0, 20)}...${page.token.slice(-5)}</small>
          </div>
        </div>
        <div class="page-card-actions">
          ${!page.active ? `<button class="btn btn-primary btn-sm" onclick="activatePage('${page.id}')">✅ เลือก</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="removePage('${page.id}')">🗑️ ลบ</button>
        </div>
      </div>
    `;
  });
  pagesList.innerHTML = html;
  pagesListDashboard.innerHTML = html;
}

// ========== Auto Reply ==========
async function loadKeywords() {
  try {
    const response = await fetch(`${RENDER_URL}/api/settings`);
    const data = await response.json();
    
    document.getElementById('welcome-message').value = data.welcome || '';
    
    const keywordList = document.getElementById('keyword-list');
    keywordList.innerHTML = '';
    
    for (const [keyword, answer] of Object.entries(data.keywords || {})) {
      addKeywordRow(keyword, answer);
    }
  } catch (error) {
    console.error('Error loading:', error);
  }
}

function addKeywordRow(keyword = '', answer = '') {
  const keywordList = document.getElementById('keyword-list');
  const item = document.createElement('div');
  item.className = 'keyword-item';
  item.innerHTML = `
    <input type="text" class="keyword-input" placeholder="คำหลัก" value="${keyword}">
    <span class="keyword-arrow">→</span>
    <input type="text" class="reply-input" placeholder="คำตอบ" value="${answer}">
    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">🗑️</button>
  `;
  keywordList.appendChild(item);
}

function addKeyword() {
  addKeywordRow();
}

// ========== บันทึกทุกอย่างลง GitHub ==========
async function saveKeywords() {
  const keywordItems = document.querySelectorAll('.keyword-item');
  const keywords = {};
  
  keywordItems.forEach(item => {
    const keyword = item.querySelector('.keyword-input').value.trim();
    const answer = item.querySelector('.reply-input').value.trim();
    if (keyword && answer) {
      keywords[keyword] = answer;
    }
  });
  
  const payload = {
    welcome: document.getElementById('welcome-message').value.trim(),
    keywords: keywords
  };
  
  try {
    const response = await fetch(`${RENDER_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (result.success) {
      showToast('บันทึกสำเร็จ! (เก็บบน GitHub แล้ว)', 'success');
    } else {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
  }
}

async function sendBroadcast() {
  const userId = document.getElementById('broadcast-user-id').value.trim();
  const message = document.getElementById('broadcast-message').value.trim();
  if (!userId) { showToast('กรุณาใส่ User ID', 'error'); return; }
  if (!message) { showToast('กรุณาใส่ข้อความ', 'error'); return; }
  try {
    const result = await ipcRenderer.invoke('send-message', { recipientId: userId, text: message });
    if (result.success !== false) {
      showToast('ส่งข้อความสำเร็จ!', 'success');
      document.getElementById('broadcast-message').value = '';
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

function copyWebhook() {
  clipboard.writeText(document.getElementById('webhook-url').value);
  showToast('คัดลอกแล้ว', 'success');
}

function copyVerifyToken() {
  clipboard.writeText(document.getElementById('verify-token').value);
  showToast('คัดลอกแล้ว', 'success');
}

async function testWebhook() {
  const resultEl = document.getElementById('webhook-test-result');
  resultEl.textContent = ' กำลังทดสอบ...';
  try {
    const response = await fetch(`${RENDER_URL}/`);
    if (response.ok) {
      resultEl.innerHTML = ' <span style="color: green;">✅ ทำงานปกติ!</span>';
    } else {
      resultEl.innerHTML = ' <span style="color: red;">❌ ไม่ตอบสนอง</span>';
    }
  } catch (error) {
    resultEl.innerHTML = ' <span style="color: red;">❌ เชื่อมต่อไม่ได้</span>';
  }
}

function saveSettings() {
  showToast('บันทึกตั้งค่าสำเร็จ!', 'success');
}

function clearLogs() {
  messageLogs = [];
  renderLogs();
}

function renderLogs() {
  const logsEl = document.getElementById('message-logs');
  const totalMessages = document.getElementById('total-messages');
  totalMessages.textContent = messageLogs.length;
  if (messageLogs.length === 0) {
    logsEl.innerHTML = '<div class="empty-state"><p>ยังไม่มีประวัติข้อความ</p></div>';
    return;
  }
  let html = '';
  messageLogs.slice().reverse().forEach(log => {
    const initials = log.sender.substring(0, 2);
    const time = new Date(log.time).toLocaleString('th-TH');
    html += `
      <div class="log-item">
        <div class="log-avatar">${initials}</div>
        <div class="log-content">
          <div class="log-sender">U
