// python
import os
import requests
from flask import Flask, request
 
app = Flask(__name__)
 
PAGE_ACCESS_TOKEN = os.environ.get('PAGE_ACCESS_TOKEN')
VERIFY_TOKEN = os.environ.get('VERIFY_TOKEN', 'my_verify_token')
 
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
                text = event.get('message', {}).get('text', '')
                if text:
                    send_message(sender, f"คุณพิมพ์ว่า: {text}")
    return 'OK', 200
 
def send_message(recipient_id, text):
    url = "https://graph.facebook.com/v19.0/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "access_token": PAGE_ACCESS_TOKEN
    }
    requests.post(url, json=payload)
 
if __name__ == '__main__':
    app.run(port=5000)
