import os
import json
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

PAGE_ACCESS_TOKEN = os.environ.get('PAGE_ACCESS_TOKEN')
VERIFY_TOKEN = os.environ.get('VERIFY_TOKEN', 'my_verify_token')

# ========== Settings (เก็บในไฟล์) ==========
SETTINGS_FILE = 'settings.json'

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        "welcome": "สวัสดีค่ะ ยินดีต้อนรับ มีอะไรให้ช่วยไหมคะ?",
        "fallback": "ขออภัยค่ะ ไม่เข้าใจที่พิมพ์มา ลองใหม่อีกครั้งนะคะ",
        "keywords": {
            "สวัสดี": "สวัสดีค่ะ ยินดีต้อนรับ มีอะไรให้ช่วยไหมคะ?",
            "ราคา": "ราคาเริ่มต้นที่ 500 บาทค่ะ",
            "สั่งซื้อ": "สนใจสั่งซื้อ DM มาได้เลยค่ะ จะมีเจ้าหน้าที่ตอบภายใน 5 นาที",
        }
    }

def save_settings(settings):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

settings = load_settings()

@app.route('/')
def home():
    return "Bot is running!"

# ========== Webhook Verify ==========
@app.route('/webhook', methods=['GET'])
def verify():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    if mode == 'subscribe' and token == VERIFY_TOKEN:
        return challenge, 200
    return 'Forbidden', 403

# ========== Webhook Messages ==========
@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()
    if data.get('object') == 'page':
        for entry in data.get('entry', []):
            for event in entry.get('messaging', []):
                sender = event['sender']['id']
                text = event.get('message', {}).get('text', '')
                if text:
                    reply = get_reply(text)
                    send_message(sender, reply)
    return 'OK', 200

def get_reply(text):
    text_lower = text.lower().strip()
    for keyword, answer in settings["keywords"].items():
        if keyword in text_lower:
            return answer
    return settings["fallback"]

def send_message(recipient_id, text):
    url = "https://graph.facebook.com/v19.0/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "access_token": PAGE_ACCESS_TOKEN
    }
    requests.post(url, json=payload)

# ========== API สำหรับ Desktop App ==========

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    global settings
    new_settings = request.get_json()
    settings.update(new_settings)
    save_settings(settings)
    return jsonify({"success": True, "settings": settings})

@app.route('/api/keywords', methods=['POST'])
def add_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    answer = data.get('answer')
    if keyword and answer:
        settings["keywords"][keyword] = answer
        save_settings(settings)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Missing keyword or answer"}), 400

@app.route('/api/keywords', methods=['DELETE'])
def delete_keyword():
    data = request.get_json()
    keyword = data.get('keyword')
    if keyword and keyword in settings["keywords"]:
        del settings["keywords"][keyword]
        save_settings(settings)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Keyword not found"}), 404

@app.route('/api/keywords', methods=['GET'])
def get_keywords():
    return jsonify(settings["keywords"])

if __name__ == '__main__':
    app.run(port=5000)
