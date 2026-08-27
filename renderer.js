let ipcRenderer, clipboard;
try {
  ({ ipcRenderer, clipboard } = require('electron'));
} catch(e) {
  clipboard = { readText: () => '', writeText: () => {} };
  ipcRenderer = { invoke: async () => ({success:false}), on: () => {} };
}

const RENDER_URL = 'https://my-chatbot-1-2cuw.onrender.com';

let pages = JSON.parse(localStorage.getItem('chatbot_pages') || '[]');
let messageLogs = [];

function saveLocalPages() {
  localStorage.setItem('chatbot_pages', JSON.stringify(pages));
}

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="' + pageName + '"]').classList.add('active');
  if (pageName === 'dashboard') renderPages();
  if (pageName === 'auto-reply') loadKeywords();
}

function minimizeWindow() {}
function maximizeWindow() {}
function closeWindow() {
  if (confirm('ต้องการปิดแอปพลิเคชัน?')) window.close();
}

function showToast(message, type) {
  var toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

// ========== Pages ==========
async function addPage() {
  var tokenInput = document.getElementById('page-token-input');
  var token = tokenInput.value.trim();
  if (!token) { showToast('กรุณาใส่ Page Access Token', 'error'); return; }
  try {
    var result = await ipcRenderer.invoke('add-page', { token: token });
    if (result.success) {
      pages.push(result.page);
      saveLocalPages();
      renderPages();
      tokenInput.value = '';
      showToast('เพิ่มเพจสำเร็จ!', 'success');
    } else {
      showToast(result.error || 'Token ไม่ถูกต้อง', 'error');
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function removePage(pageId) {
  if (confirm('ต้องการลบเพจนี้?')) {
    pages = pages.filter(function(p) { return p.id !== pageId; });
    saveLocalPages();
    renderPages();
    showToast('ลบเพจสำเร็จ', 'success');
  }
}

async function activatePage(pageId) {
  pages.forEach(function(p) { p.active = (p.id === pageId); });
  saveLocalPages();
  renderPages();
}

function pasteToken() {
  document.getElementById('page-token-input').value = clipboard.readText();
  showToast('วาง Token แล้ว', 'info');
}

function renderPages() {
  var pagesList = document.getElementById('pages-list');
  var pagesListDashboard = document.getElementById('pages-list-dashboard');
  var pageCount = document.getElementById('page-count');
  var totalPages = document.getElementById('total-pages');
  pageCount.textContent = pages.length;
  totalPages.textContent = pages.length;
  if (pages.length === 0) {
    var emptyHtml = '<div class="empty-state"><p>ยังไม่มีเพจที่เชื่อมต่อ</p></div>';
    pagesList.innerHTML = emptyHtml;
    if (pagesListDashboard) pagesListDashboard.innerHTML = emptyHtml;
    return;
  }
  var html = '';
  pages.forEach(function(page) {
    var initials = page.name.charAt(0);
    var badgeClass = page.active ? 'badge-active' : 'badge-inactive';
    var activeClass = page.active ? 'active-page' : '';
    html += '<div class="page-card ' + activeClass + '">';
    html += '<div class="page-card-info">';
    html += '<div class="page-card-avatar">' + initials + '</div>';
    html += '<div class="page-card-details">';
    html += '<h3>' + page.name + ' <span class="badge ' + badgeClass + '">' + (page.active ? 'ใช้งาน' : 'ไม่ใช้งาน') + '</span></h3>';
    html += '<small>Page ID: ' + page.id + '</small>';
    html += '</div></div>';
    html += '<div class="page-card-actions">';
    if (!page.active) {
      html += '<button class="btn btn-primary btn-sm" onclick="activatePage(\'' + page.id + '\')">เลือก</button> ';
    }
    html += '<button class="btn btn-danger btn-sm" onclick="removePage(\'' + page.id + '\')">ลบ</button>';
    html += '</div></div>';
  });
  pagesList.innerHTML = html;
  if (pagesListDashboard) pagesListDashboard.innerHTML = html;
}

// ========== Auto Reply ==========
function loadKeywords() {
  // โหลดจาก localStorage เท่านั้น (ไม่โหลดจาก server)
  var localSettings = JSON.parse(localStorage.getItem('chatbot_settings') || 'null');
  if (localSettings) {
    document.getElementById('welcome-message').value = localSettings.welcome || '';
    var keywordList = document.getElementById('keyword-list');
    keywordList.innerHTML = '';
    var keys = Object.keys(localSettings.keywords || {});
    for (var i = 0; i < keys.length; i++) {
      addKeywordRow(keys[i], localSettings.keywords[keys[i]]);
    }
  } else {
    // ถ้ายังไม่มี localStorage → ใช้ค่าเริ่มต้น
    document.getElementById('welcome-message').value = 'สวัสดีครับ ยินดีต้อนรับ มีอะไรให้ช่วยไหมครับ?';
    document.getElementById('keyword-list').innerHTML = '';
  }
}

function addKeywordRow(keyword, answer) {
  keyword = keyword || '';
  answer = answer || '';
  var keywordList = document.getElementById('keyword-list');
  var item = document.createElement('div');
  item.className = 'keyword-item';
  item.innerHTML = '<input type="text" class="keyword-input" placeholder="คำหลัก" value="' + keyword + '">' +
    '<span class="keyword-arrow">\u2192</span>' +
    '<input type="text" class="reply-input" placeholder="คำตอบ" value="' + answer + '">' +
    '<button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">\uD83D\uDDD1\uFE0F</button>';
  keywordList.appendChild(item);
}

function addKeyword() {
  addKeywordRow();
}

async function saveKeywords() {
  var keywordItems = document.querySelectorAll('.keyword-item');
  var keywords = {};
  keywordItems.forEach(function(item) {
    var kw = item.querySelector('.keyword-input').value.trim();
    var ans = item.querySelector('.reply-input').value.trim();
    if (kw && ans) { keywords[kw] = ans; }
  });
  var payload = {
    welcome: document.getElementById('welcome-message').value.trim(),
    keywords: keywords
  };

  // บันทึกลง localStorage ทันที (ไม่ต้องรอ server)
  localStorage.setItem('chatbot_settings', JSON.stringify(payload));
  showToast('บันทึกลงเครื่องแล้ว!', 'success');

  // ส่งไปที่ Render Server (บันทึกลง GitHub)
  try {
    var response = await fetch(RENDER_URL + '/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var result = await response.json();
    if (result.success) {
      showToast('บันทึกขึ้น Server แล้ว!', 'success');
    } else {
      showToast('บันทึกลงเครื่องแล้ว (Server ยังไม่ได้)', 'info');
    }
  } catch (error) {
    showToast('บันทึกลงเครื่องแล้ว (Server ยังไม่ได้)', 'info');
  }
}

async function sendBroadcast() {
  var userId = document.getElementById('broadcast-user-id').value.trim();
  var message = document.getElementById('broadcast-message').value.trim();
  if (!userId) { showToast('กรุณาใส่ User ID', 'error'); return; }
  if (!message) { showToast('กรุณาใส่ข้อความ', 'error'); return; }
  try {
    var result = await ipcRenderer.invoke('send-message', { recipientId: userId, text: message });
    showToast('ส่งข้อความสำเร็จ!', 'success');
    document.getElementById('broadcast-message').value = '';
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
  var resultEl = document.getElementById('webhook-test-result');
  resultEl.textContent = ' กำลังทดสอบ...';
  try {
    var response = await fetch(RENDER_URL + '/');
    if (response.ok) {
      resultEl.innerHTML = ' <span style="color: green;">ทำงานปกติ!</span>';
    } else {
      resultEl.innerHTML = ' <span style="color: red;">ไม่ตอบสนอง</span>';
    }
  } catch (error) {
    resultEl.innerHTML = ' <span style="color: red;">เชื่อมต่อไม่ได้</span>';
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
  var logsEl = document.getElementById('message-logs');
  var totalMessages = document.getElementById('total-messages');
  totalMessages.textContent = messageLogs.length;
  if (messageLogs.length === 0) {
    logsEl.innerHTML = '<div class="empty-state"><p>ยังไม่มีประวัติข้อความ</p></div>';
    return;
  }
  var html = '';
  messageLogs.slice().reverse().forEach(function(log) {
    var initials = log.sender.substring(0, 2);
    var time = new Date(log.time).toLocaleString('th-TH');
    html += '<div class="log-item"><div class="log-avatar">' + initials + '</div>';
    html += '<div class="log-content"><div class="log-sender">User: ' + log.sender + '</div>';
    html += '<div class="log-text">' + log.text + '</div>';
    html += '<div class="log-time">' + time + '</div></div></div>';
  });
  logsEl.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function() {
  renderPages();
  renderLogs();
  document.getElementById('webhook-status').textContent = 'เชื่อมต่อแล้ว';
  document.getElementById('bot-status').textContent = 'เปิดอยู่';
});
