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

  // 1. บันทึกลง localStorage ทันที
  localStorage.setItem('chatbot_settings', JSON.stringify(payload));
  showToast('บันทึกลงเครื่องแล้ว!', 'success');

  // 2. บันทึกลง GitHub โดยตรง
  var githubToken = loadGithubToken();
  if (githubToken) {
    try {
      await saveToGitHub(payload, githubToken);
      showToast('บันทึกลง GitHub แล้ว!', 'success');
    } catch (e) {
      showToast('GitHub บันทึกไม่ได้: ' + e.message, 'error');
    }
  }

  // 3. POST ให้ Render Server อัพเดท memory
  try {
    await fetch(RENDER_URL + '/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

async function saveToGitHub(payload, token) {
  var repo = 'Mmaikiller/my-chatbot';
  var file = 'settings.json';
  var branch = 'master';
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + file + '?ref=master';
  var headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json'
  };

  // ดึง SHA ของไฟล์เดิม
  var getResp = await fetch(url + '?ref=' + branch, { headers: headers });
  var sha = '';
  if (getResp.ok) {
    var fileData = await getResp.json();
    sha = fileData.sha || '';
  }

  // เขียนไฟล์ใหม่
  var content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  var body = {
    message: 'Update bot settings from Desktop App',
    content: content,
    branch: branch
  };
  if (sha) body.sha = sha;

  var putResp = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(body)
  });

  if (!putResp.ok) {
    var err = await putResp.json();
    throw new Error(err.message || 'GitHub API error');
  }
  return true;
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
  var githubToken = document.getElementById('github-token').value.trim();
  if (githubToken) {
    localStorage.setItem('chatbot_github_token', githubToken);
  }
  showToast('บันทึกตั้งค่าสำเร็จ!', 'success');
}

// โหลด GitHub Token จาก localStorage
function loadGithubToken() {
  var token = localStorage.getItem('chatbot_github_token') || '';
  var input = document.getElementById('github-token');
  if (input) input.value = token;
  return token;
}

// ========== Chat Logs ==========
var allChatLogs = [];
var currentFilter = 'all';

async function loadChatLogs() {
  try {
    var response = await fetch(RENDER_URL + '/api/chat-logs');
    allChatLogs = await response.json();
    updateLogStats();
    renderChatLogs();
  } catch (error) {
    console.error('Error loading chat logs:', error);
  }
}

function updateLogStats() {
  var problems = 0, orders = 0, questions = 0;
  allChatLogs.forEach(function(log) {
    if (log.category === 'แจ้งปัญหา') problems++;
    else if (log.category === 'สั่งซื้อ') orders++;
    else questions++;
  });
  var el1 = document.getElementById('count-problems');
  var el2 = document.getElementById('count-orders');
  var el3 = document.getElementById('count-questions');
  var el4 = document.getElementById('count-total-chats');
  if (el1) el1.textContent = problems;
  if (el2) el2.textContent = orders;
  if (el3) el3.textContent = questions;
  if (el4) el4.textContent = allChatLogs.length;
  // Dashboard
  var totalEl = document.getElementById('total-messages');
  if (totalEl) totalEl.textContent = allChatLogs.length;
}

function filterLogs(category) {
  currentFilter = category;
  renderChatLogs();
  // ไฮไลท์ปุ่มที่กด
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.style.opacity = '0.5';
  });
  event.target.style.opacity = '1';
}

function renderChatLogs() {
  var logsEl = document.getElementById('chat-logs-list');
  var recentEl = document.getElementById('recent-messages');
  if (!logsEl) return;

  var filtered = allChatLogs;
  if (currentFilter !== 'all') {
    filtered = allChatLogs.filter(function(log) {
      return log.category === currentFilter;
    });
  }

  if (filtered.length === 0) {
    logsEl.innerHTML = '<div class="empty-state"><p>ยังไม่มีประวัติแชท</p></div>';
    if (recentEl) recentEl.innerHTML = '<div class="empty-state"><p>ยังไม่มีข้อความ</p></div>';
    return;
  }

  // จัดกลุ่มตาม sender
  var grouped = {};
  filtered.forEach(function(log) {
    if (!grouped[log.sender]) {
      grouped[log.sender] = [];
    }
    grouped[log.sender].push(log);
  });

  var html = '';
  var senders = Object.keys(grouped).reverse();
  senders.forEach(function(sender) {
    var logs = grouped[sender];
    var lastLog = logs[logs.length - 1];
    var category = lastLog.category;
    var catColor = '#3498db';
    var catIcon = '❓';
    if (category === 'แจ้งปัญหา') { catColor = '#e74c3c'; catIcon = '⚠️'; }
    else if (category === 'สั่งซื้อ') { catColor = '#27ae60'; catIcon = '🛒'; }

    html += '<div class="chat-log-card" style="border-left:4px solid ' + catColor + ';padding:12px;margin:8px 0;background:#f8f9fa;border-radius:8px">';
    var displayName = (lastLog.name && lastLog.name !== sender) ? lastLog.name : sender.substring(0, 10) + '...';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div><strong>' + catIcon + ' ' + category + '</strong> <span style="color:#666;font-size:12px">👤 ' + displayName + '</span></div>';
    html += '<span style="color:#999;font-size:11px">' + new Date(lastLog.time).toLocaleString('th-TH') + '</span>';
    html += '</div>';

    // แสดงข้อความ 3 ข้อความล่าสุด
    var showLogs = logs.slice(-3);
    showLogs.forEach(function(log) {
      var isUser = log.text.startsWith('ลูกค้า');
      var bgColor = isUser ? '#e3f2fd' : '#f1f8e9';
      html += '<div style="background:' + bgColor + ';padding:6px 10px;margin:4px 0;border-radius:6px;font-size:13px">';
      html += (isUser ? '👤 ' : '🤖 ') + log.text;
      html += '</div>';
    });

    if (logs.length > 3) {
      html += '<div style="text-align:center;color:#999;font-size:11px;margin-top:4px">และอีก ' + (logs.length - 3) + ' ข้อความ...</div>';
    }
    html += '</div>';
  });

  logsEl.innerHTML = html;

  // Dashboard - แสดง 5 ข้อความล่าสุด
  if (recentEl) {
    var recent = allChatLogs.slice(-5).reverse();
    if (recent.length === 0) {
      recentEl.innerHTML = '<div class="empty-state"><p>ยังไม่มีข้อความ</p></div>';
    } else {
      var rhtml = '';
      recent.forEach(function(log) {
        var catIcon = '❓';
        if (log.category === 'แจ้งปัญหา') catIcon = '⚠️';
        else if (log.category === 'สั่งซื้อ') catIcon = '🛒';
        rhtml += '<div style="padding:8px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center">';
        rhtml += '<span>' + catIcon + '</span>';
        rhtml += '<div style="flex:1"><strong>' + log.category + '</strong><br><small style="color:#666">' + log.text.substring(0, 50) + '</small></div>';
        rhtml += '<small style="color:#999">' + new Date(log.time).toLocaleString('th-TH') + '</small>';
        rhtml += '</div>';
      });
      recentEl.innerHTML = rhtml;
    }
  }
}

async function clearChatLogs() {
  if (!confirm('ต้องการล้างประวัติแชททั้งหมด?')) return;
  try {
    await fetch(RENDER_URL + '/api/chat-logs', { method: 'DELETE' });
    allChatLogs = [];
    updateLogStats();
    renderChatLogs();
    showToast('ล้างประวัติแล้ว!', 'success');
  } catch (error) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  renderPages();
  loadChatLogs();
  loadGithubToken();
  document.getElementById('webhook-status').textContent = 'เชื่อมต่อแล้ว';
  document.getElementById('bot-status').textContent = 'เปิดอยู่';
  // โหลด chat logs ทุก 10 วินาที
  setInterval(loadChatLogs, 10000);
});
