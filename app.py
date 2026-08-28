import os
import json
import base64
import datetime
import time
import re
import requests
from difflib import get_close_matches
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

PAGE_ACCESS_TOKEN = os.environ.get('PAGE_ACCESS_TOKEN')
VERIFY_TOKEN = os.environ.get('VERIFY_TOKEN', 'my_verify_token')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
print("GITHUB_TOKEN set: {}".format(bool(GITHUB_TOKEN)))
GITHUB_REPO = 'Mmaikiller/my-chatbot'
GITHUB_FILE = 'settings.json'
GITHUB_BRANCH = 'master'

DEFAULT_SETTINGS = {
    "welcome": "สวัสดีครับ 🙏 ยินดีต้อนรับครับ ร้านสหวัฒน์ จำหน่ายวัสดุก่อสร้างทุกชนิดครับ\n\nต้องการสินค้าอะไร หรือมีคำถามอะไร ทักมาได้เลยครับ!",
    "keywords": {},
    "chat_logs": []
}

settings = dict(DEFAULT_SETTINGS)
_last_settings_load = 0  # timestamp of last GitHub load

CATEGORIES = {
    "แจ้งปัญหา": [
        "ปัญหา", "เสีย", "พัง", "ชำรุด", "ไม่ทำงาน", "ผิดพลาด",
        "ร้องเรียน", "บ่น", "ไม่พอใจ", "แย่",
        "ส่งของช้า", "ของไม่มา", "ไม่ได้ของ", "สูญหาย", "หาย",
        "เปลี่ยน", "คืน", "refund", "return", "แจ้งปัญหา", "ช่วยแก้"
    ],
    "สั่งซื้อ": [
        "สั่ง", "ซื้อ", "order", "buy", "อยากได้", "สนใจ", "จอง",
        "เท่าไหร่", "ราคา", "กี่บาท", "เงิน", "จ่าย",
        "ส่ง", "จัดส่ง", "delivery", "ship", "รอบหน้า", "เพิ่ม",
        "size", "ไซส์", "เบอร์", "สี", "แบบ", "รุ่น"
    ],
    "สอบถาม": [
        "สอบถาม", "ถาม", "อยากถาม", "ข้อมูล", "รายละเอียด",
        "เวลาเปิด", "เวลาปิด", "ที่อยู่", "ติดต่อ", "เบอร์โทร",
        "เปิดกี่โมง", "ปิดกี่โมง", "อยู่ที่ไหน", "ไปยังไง",
        "มีไหม", "มีสินค้า", "stock", "สต็อก", "เหลือ", "หมด",
        "how", "what", "where", "when", "ทำไม", "ยังไง", "อะไร"
    ]
}

def classify_message(text):
    if not text:
        return "สอบถาม"
    text_lower = text.lower().strip()
    scores = {}
    for category, keywords in CATEGORIES.items():
        score = sum(1 for kw in keywords if kw.lower() in text_lower)
        scores[category] = score
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "สอบถาม"

# ========== GitHub API ==========
_SETTINGS_CACHE_TTL = 60  # seconds — reload from GitHub at most once per minute

def load_settings_from_github(force=False):
    global settings, _last_settings_load
    now = time.time()
    if not force and (now - _last_settings_load) < _SETTINGS_CACHE_TTL:
        return  # still fresh, skip API call
    if not GITHUB_TOKEN:
        print("WARNING: GITHUB_TOKEN not set - cannot load settings from GitHub")
        return
    try:
        url = "https://api.github.com/repos/{}/contents/{}?ref={}".format(GITHUB_REPO, GITHUB_FILE, GITHUB_BRANCH)
        headers = {"Authorization": "token {}".format(GITHUB_TOKEN), "Accept": "application/vnd.github.v3+json"}
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            content = r.json().get("content", "")
            decoded = base64.b64decode(content).decode("utf-8")
            data = json.loads(decoded)
            settings = data
            if "chat_logs" not in settings:
                settings["chat_logs"] = []
            _last_settings_load = now
            print("Loaded {} keywords from GitHub".format(len(settings.get("keywords", {}))))
        else:
            print("GitHub load failed: {}".format(r.status_code))
    except Exception as e:
        print("Error loading from GitHub: {}".format(e))

def save_settings_to_github():
    if not GITHUB_TOKEN:
        return False
    try:
        url = "https://api.github.com/repos/{}/contents/{}?ref={}".format(GITHUB_REPO, GITHUB_FILE, GITHUB_BRANCH)
        headers = {"Authorization": "token {}".format(GITHUB_TOKEN), "Accept": "application/vnd.github.v3+json"}
        r = requests.get(url, headers=headers, timeout=10)
        sha = r.json().get("sha", "") if r.status_code == 200 else ""
        if "chat_logs" in settings and len(settings["chat_logs"]) > 100:
            settings["chat_logs"] = settings["chat_logs"][-100:]
        content = json.dumps(settings, ensure_ascii=False, indent=2)
        encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        data = {"message": "Update bot settings", "content": encoded, "branch": GITHUB_BRANCH}
        if sha:
            data["sha"] = sha
        r = requests.put(url, headers=headers, json=data, timeout=10)
        return r.status_code in [200, 201]
    except Exception as e:
        print("Error saving to GitHub: {}".format(e))
        return False

load_settings_from_github()

@app.route('/')
def home():
    return "Bot is running!"

@app.route('/webhook', methods=['GET'])
def verify():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    if mode == 'subscribe' and token == VERIFY_TOKEN:
        return challenge, 200
    return 'Forbidden', 403

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()

    if data.get('object') == 'page':
        for entry in data.get('entry', []):
            for event in entry.get('messaging', []):
                sender = event['sender']['id']
                load_settings_from_github()

                if 'postback' in event:
                    payload = event['postback'].get('payload', '')
                    title = event['postback'].get('title', '')
                    print("Postback from {}: payload={}".format(sender, payload))

                    if payload == 'GET_STARTED' or title == 'Get Started':
                        send_message(sender, settings.get("welcome", "สวัสดีครับ!"))
                        log_chat(sender, "ลูกค้ากด Get Started", "สอบถาม")
                    else:
                        reply = get_reply(payload)
                        if reply:
                            send_message(sender, reply)
                        else:
                            send_message(sender, "ขออภัยครับ ยังไม่เข้าใจคำถาม ลองพิมพ์ใหม่อีกครั้งครับ")
                        log_chat(sender, payload, classify_message(payload))

                elif 'message' in event:
                    text = event['message'].get('text', '')
                    if text:
                        category = classify_message(text)
                        log_chat(sender, text, category)

                        reply = get_reply(text)
                        if reply:
                            send_message(sender, reply)
                        else:
                            send_message(sender, "ขออภัยครับ ยังไม่เข้าใจคำถาม ลองพิมพ์ใหม่อีกครั้งครับ")

                        if category == "แจ้งปัญหา":
                            print("ALERT: แจ้งปัญหาจาก {} {}".format(sender, text))

        return 'OK', 200
    return 'OK', 200

def get_user_name(sender_id):
    try:
        url = "https://graph.facebook.com/v19.0/{}?fields=first_name,last_name&access_token={}".format(sender_id, PAGE_ACCESS_TOKEN)
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            first = data.get("first_name", "")
            last = data.get("last_name", "")
            name = "{} {}".format(first, last).strip()
            return name if name else sender_id
    except Exception as e:
        print("Error getting user name: {}".format(e))
    return sender_id

def log_chat(sender_id, text, category):
    user_name = get_user_name(sender_id)
    chat_log = {
        "sender": sender_id,
        "name": user_name,
        "text": text,
        "category": category,
        "time": datetime.datetime.now().isoformat()
    }
    settings.setdefault("chat_logs", []).append(chat_log)
    save_settings_to_github()

def get_reply(text):
    if not text:
        return None
    text_lower = text.lower().strip()
    keywords = settings.get("keywords", {})
    print("get_reply: text='{}', keywords_count={}".format(text, len(keywords)))
    if not keywords:
        print("WARNING: No keywords loaded! Check GITHUB_TOKEN on Render.")
        return None

    # --- Pass 1: longest-match-first substring ---
    sorted_kw = sorted(keywords.keys(), key=len, reverse=True)
    for keyword in sorted_kw:
        if keyword.lower() in text_lower:
            return keywords[keyword]

    # --- Pass 2: fuzzy match per token (not the whole sentence) ---
    tokens = re.findall(r'[\wก-๙]+', text_lower)
    if tokens:
        best_match, best_ratio = None, 0.0
        for token in tokens:
            if len(token) < 2:
                continue  # skip single characters to avoid noise
            close = get_close_matches(token, sorted_kw, n=1, cutoff=0.5)
            if close:
                ratio = len(close[0]) / len(token)
                if ratio > best_ratio:
                    best_match, best_ratio = close[0], ratio
        if best_match:
            return keywords[best_match]

    # --- Pass 3: no match → None (caller decides fallback) ---
    return None

def send_message(recipient_id, text):
    url = "https://graph.facebook.com/v19.0/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "access_token": PAGE_ACCESS_TOKEN
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        print("Sent to {}: {}".format(recipient_id, r.status_code))
    except Exception as e:
        print("Send error: {}".format(e))

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    load_settings_from_github()
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def api_update_settings():
    global settings, _last_settings_load
    new_settings = request.get_json()
    settings.update(new_settings)
    _last_settings_load = time.time()  # reset cache so load_settings_from_github() won't overwrite
    save_settings_to_github()
    print("Settings updated via POST: {} keywords".format(len(settings.get("keywords", {}))))
    return jsonify({"success": True, "settings": settings})

@app.route('/api/chat-logs', methods=['GET'])
def api_get_chat_logs():
    load_settings_from_github()
    return jsonify(settings.get("chat_logs", []))

@app.route('/api/chat-logs', methods=['DELETE'])
def api_clear_chat_logs():
    global settings
    settings["chat_logs"] = []
    save_settings_to_github()
    return jsonify({"success": True})

@app.route('/api/keywords', methods=['POST'])
def api_add_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    answer = data.get('answer')
    if keyword and answer:
        settings.setdefault("keywords", {})[keyword] = answer
        save_settings_to_github()
        return jsonify({"success": True})
    return jsonify({"success": False}), 400

@app.route('/api/keywords', methods=['DELETE'])
def api_delete_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    if keyword and keyword in settings.get("keywords", {}):
        del settings["keywords"][keyword]
        save_settings_to_github()
        return jsonify({"success": True})
    return jsonify({"success": False}), 404

@app.route('/api/keywords', methods=['GET'])
def api_get_keywords():
    load_settings_from_github()
    return jsonify(settings.get("keywords", {}))

@app.route('/api/debug', methods=['GET'])
def api_debug():
    return jsonify({
        "github_token_set": bool(GITHUB_TOKEN),
        "last_load": _last_settings_load,
        "cache_age_seconds": int(time.time() - _last_settings_load) if _last_settings_load > 0 else -1,
        "keywords_count": len(settings.get("keywords", {})),
        "keywords": list(settings.get("keywords", {}).keys()),
        "chat_logs_count": len(settings.get("chat_logs", []))
    })

if __name__ == '__main__':
    app.run(port=5000)
