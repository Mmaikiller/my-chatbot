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
    "welcome": "สวัสดีครับ 🙏 ยินดีต้อนรับครับ ร้านสหวัฒน์ จำหน่ายวัสดุก่อสร้างทุกชนิดครับ\n\nต้องการสินค้าอะไร หรือมีคำถามอะไร ทักมาได้เลยครับ!",
    "keywords": {},
    "chat_logs": []
}

settings = dict(DEFAULT_SETTINGS)

# ========== หมวดหมู่ ==========
CATEGORIES = {
    "แจ้งปัญหา": [
        "ปัญหา", "เสีย", "พัง", "ชำรุด", "ไม่ทำงาน", "ผิดพลาด", "error",
        " complain", "ร้องเรียน", "บ่น", "ไม่พอใจ", "ผิดหวัง", "แย่",
        "ส่งของช้า", "ของไม่มา", "ไม่ได้ของ", "สูญหาย", "หาย", "ชำรุด",
        "เปลี่ยน", "คืน", "refund", "return", "แจ้งปัญหา", "ช่วยแก้"
    ],
    "สั่งซื้อ": [
        "สั่ง", "ซื้อ", "order", "buy", "อยากได้", "สนใจ", "จอง",
        "เท่าไหร่", "ราคา", "กี่บาท", "กี่钱", "เงิน", "จ่าย",
        "ส่ง", "จัดส่ง", "delivery", "ship", "รอบหน้า", "เพิ่ม",
        "size", "ไซส์", "เบอร์", "สี", "แบบ", "รุ่น", "SKU"
    ],
    "สอบถาม": [
        "สอบถาม", "ถาม", "อยากถาม", "ข้อมูล", "รายละเอียด",
        "เวลาเปิด", "เวลาปิด", "ที่อยู่", "ติดต่อ", "เบอร์โทร",
        "เปิดกี่โมง", "ปิดกี่โมง", "อยู่ที่ไหน", "ไปยังไง",
        "มีไหม", "มีสินค้า", "stock", "สต็อก", "เหลือ", "หมด",
        "how", "what", "where", "when", "who", "ทำไม", "ยังไง", "อะไร"
    ]
}

def classify_message(text):
    """จำแนกหมวดหมู่ข้อความ"""
    if not text:
        return "สอบถาม"
    text_lower = text.lower().strip()
    scores = {}
    for category, keywords in CATEGORIES.items():
        score = 0
        for keyword in keywords:
            if keyword.lower() in text_lower:
                score += 1
        scores[category] = score
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "สอบถาม"

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
            if "chat_logs" not in settings:
                settings["chat_logs"] = []
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
        # เก็บแค่ 100 แชทล่าสุด (ไม่ให้ไฟล์ใหญ่เกินไป)
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
        print(f"Error saving to GitHub: {e}")
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
    print(f"Webhook: {json.dumps(data, ensure_ascii=False)[:300]}")

    if data.get('object') == 'page':
        for entry in data.get('entry', []):
            for event in entry.get('messaging', []):
                sender = event['sender']['id']

                load_settings_from_github()

                # Postback (Get Started / ปุ่มอื่นๆ)
                if 'postback' in event:
                    payload = event['postback'].get('payload', '')
                    title = event['postback'].get('title', '')
                    print(f"Postback from {sender}: payload={payload}")

                    if payload == 'GET_STARTED' or title == 'Get Started':
                        send_message(sender, settings.get("welcome", "สวัสดีครับ!"))
                        log_chat(sender, "ลูกค้ากด Get Started", "สอบถาม")
                    else:
                        reply = get_reply(payload)
                        if reply:
                            send_message(sender, reply)
                            category = classify_message(payload)
                            log_chat(sender, payload, category)

                # ข้อความ
                elif 'message' in event:
                    text = event['message'].get('text', '')
                    print(f"Message from {sender}: {text}")

                    if text:
                        # จำแนกหมวดหมู่
                        category = classify_message(text)
                        print(f"Category: {category}")

                        # บันทึกแชท
                        log_chat(sender, text, category)

                        # ตอบกลับ
                        reply = get_reply(text)
                        send_message(sender, reply)

                        # แจ้งเตือนถ้าเป็นปัญหา
                        if category == "แจ้งปัญหา":
                            notify_owner(sender, text)

        return 'OK', 200
    return 'OK', 200

def log_chat(sender_id, text, category):
    """บันทึกแชทพร้อมหมวดหมู่"""
    chat_log = {
        "sender": sender_id,
        "text": text,
        "category": category,
        "time": __import__('datetime').datetime.now().isoformat()
    }
    settings.setdefault("chat_logs", []).append(chat_log)
    save_settings_to_github()

def notify_owner(sender_id, text):
    """แจ้งเตือนเจ้าของเพจเมื่อมีปัญหา"""
    notify_msg = f"⚠️ แจ้งปัญหาจากลูกค้า!\n\nลูกค้า: {sender_id}\nข้อความ: {text}\n\nหมวดหมู่: แจ้งปัญหา"
    # ส่งถึงผู้ดูแล (ใช้ Page Access Token)
    url = "https://graph.facebook.com/v19.0/me/messages"
    # ถ้าต้องการส่งถึง admin ให้ใส่ admin PSID
    # payload = {"recipient": {"id": "ADMIN_PSID"}, "message": {"text": notify_msg}, "access_token": PAGE_ACCESS_TOKEN}
    # requests.post(url, json=payload, timeout=10)
    print(f"ALERT: {notify_msg}")

def get_reply(text):
    if not text:
        return None
    text_lower = text.lower().strip()

    # ค้นหา keyword ตรงๆ
    for keyword, answer in settings.get("keywords", {}).items():
        if keyword.lower() in text_lower:
            return answer

    # Fuzzy match
    keywords_list = list(settings.get("keywords", {}).keys())
    if keywords_list:
        close = get_close_matches(text_lower, keywords_list, n=1, cutoff=0.5)
        if close:
            return settings["keywords"][close[0]]

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
    settings.update(new_settings)
    save_settings_to_github()
    return jsonify({"success": True, "settings": settings})

@app.route('/api/chat-logs', methods=['GET'])
def get_chat_logs():
    load_settings_from_github()
    return jsonify(settings.get("chat_logs", []))

@app.route('/api/chat-logs', methods=['DELETE'])
def clear_chat_logs():
    global settings
    settings["chat_logs"] = []
    save_settings_to_github()
    return jsonify({"success": True})

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
    global settings
    settings["welcomed_users"] = []
    save_settings_to_github()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(port=5000)
