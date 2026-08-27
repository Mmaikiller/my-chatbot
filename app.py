import os
import json
import base64
import requests
from difflib import get_close_matches
from flask import Flask, request, jsonify

app = Flask(__name__)

PAGE_ACCESS_TOKEN = os.environ.get('PAGE_ACCESS_TOKEN')
VERIFY_TOKEN = os.environ.get('VERIFY_TOKEN', 'my_verify_token')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO = 'Mmaikiller/my-chatbot'
GITHUB_FILE = 'settings.json'
GITHUB_BRANCH = 'master'

DEFAULT_SETTINGS = {
    "welcome": "สวัสดีครับ ยินดีต้อนรับ มีอะไรให้ช่วยไหมครับ?",
    "keywords": {},
    "welcomed_users": []
}

settings = dict(DEFAULT_SETTINGS)

# ========== GitHub API ==========
def load_settings_from_github():
    global settings
    if not GITHUB_TOKEN:
        return
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}"
        headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            content = r.json().get("content", "")
            decoded = base64.b64decode(content).decode("utf-8")
            data = json.loads(decoded)
            if "keywords" in data:
                settings = data
            if "welcomed_users" not in settings:
                settings["welcomed_users"] = []
            print(f"Loaded settings: {json.dumps(settings, ensure_ascii=False)[:200]}")
        else:
            print(f"GitHub load failed: {r.status_code}")
    except Exception as e:
        print(f"Error loading from GitHub: {e}")

def save_settings_to_github():
    if not GITHUB_TOKEN:
        return False
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}"
        headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}
        r = requests.get(url, headers=headers, timeout=10)
        sha = r.json().get("sha", "") if r.status_code == 200 else ""
        content = json.dumps(settings, ensure_ascii=False, indent=2)
        encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        data = {"message": "Update bot settings", "content": encoded, "branch": GITHUB_BRANCH}
        if sha:
            data["sha"] = sha
        r = requests.put(url, headers=headers, json=data, timeout=10)
        print(f"GitHub save: {r.status_code}")
        return r.status_code in [200, 201]
    except Exception as e:
        print(f"Error saving to GitHub: {e}")
        return False

# Load on startup
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
        print("Webhook verified!")
        return challenge, 200
    return 'Forbidden', 403

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()
    print(f"Webhook received: {json.dumps(data, ensure_ascii=False)[:300]}")

    if data.get('object') == 'page':
        for entry in data.get('entry', []):
            for event in entry.get('messaging', []):
                sender = event['sender']['id']

                # ดึง text จาก message หรือ postback
                text = ''
                if 'message' in event:
                    text = event['message'].get('text', '')
                elif 'postback' in event:
                    text = event['postback'].get('payload', '')

                # โหลด settings ล่าสุดจาก GitHub
                load_settings_from_github()

                # เช็คว่าเคยต้อนรับแล้วหรือยัง
                welcomed = settings.get("welcomed_users", [])

                if sender not in welcomed:
                    # ครั้งแรก → ส่งข้อความต้อนรับก่อน
                    welcome_msg = settings.get("welcome", "สวัสดีครับ!")
                    send_message(sender, welcome_msg)
                    welcomed.append(sender)
                    settings["welcomed_users"] = welcomed
                    save_settings_to_github()
                    print(f"Welcome sent to {sender}")

                    # ถ้ามีข้อความแนบมาด้วย ตอบด้วย keyword
                    if text:
                        reply = get_reply(text)
                        if reply:
                            send_message(sender, reply)
                else:
                    # ไม่ใช่ครั้งแรก → ตอบตาม keyword
                    if text:
                        reply = get_reply(text)
                        send_message(sender, reply)
                    elif 'postback' in event:
                        # Postback ที่ไม่ใช่ Get Started
                        reply = get_reply(text)
                        if reply:
                            send_message(sender, reply)

        return 'OK', 200
    return 'OK', 200

def get_reply(text):
    if not text:
        return None
    text_lower = text.lower().strip()

    # ค้นหา keyword ตรงๆ
    for keyword, answer in settings.get("keywords", {}).items():
        if keyword.lower() in text_lower:
            return answer

    # Fuzzy match หาคำคล้าย
    keywords_list = list(settings.get("keywords", {}).keys())
    if keywords_list:
        close = get_close_matches(text_lower, keywords_list, n=1, cutoff=0.5)
        if close:
            return settings["keywords"][close[0]]

    # ไม่เจอ → ตอบ welcome แทน
    return settings.get("welcome", "สวัสดีครับ!")

def send_message(recipient_id, text):
    url = "https://graph.facebook.com/v19.0/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "access_token": PAGE_ACCESS_TOKEN
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        print(f"Sent to {recipient_id}: {r.status_code}")
    except Exception as e:
        print(f"Send error: {e}")

@app.route('/api/settings', methods=['GET'])
def get_settings():
    load_settings_from_github()
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    global settings
    new_settings = request.get_json()
    # ไม่ให้ Desktop App ลบ welcomed_users
    if "welcomed_users" not in new_settings:
        new_settings["welcomed_users"] = settings.get("welcomed_users", [])
    settings.update(new_settings)
    save_settings_to_github()
    return jsonify({"success": True, "settings": settings})

@app.route('/api/keywords', methods=['POST'])
def add_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    answer = data.get('answer')
    if keyword and answer:
        settings.setdefault("keywords", {})[keyword] = answer
        save_settings_to_github()
        return jsonify({"success": True})
    return jsonify({"success": False}), 400

@app.route('/api/keywords', methods=['DELETE'])
def delete_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    if keyword and keyword in settings.get("keywords", {}):
        del settings["keywords"][keyword]
        save_settings_to_github()
        return jsonify({"success": True})
    return jsonify({"success": False}), 404

@app.route('/api/keywords', methods=['GET'])
def get_keywords():
    load_settings_from_github()
    return jsonify(settings.get("keywords", {}))

@app.route('/api/reset-welcomed', methods=['POST'])
def reset_welcomed():
    """รีเซ็ตรายชื่อผู้ใช้ที่เคยต้อนรับแล้ว (ใช้ทดสอบ)"""
    global settings
    settings["welcomed_users"] = []
    save_settings_to_github()
    return jsonify({"success": True, "message": "Reset welcomed_users"})

if __name__ == '__main__':
    app.run(port=5000)
