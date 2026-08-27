# 🤖 Facebook Chatbot Manager

แอปพลิเคชัน Desktop สำหรับจัดการแชทบอท Facebook Page

## ✨ ฟีเจอร์

- 📄 **จัดการเพจ** - เชื่อมต่อ Facebook Page หลายเพจ
- 💬 **ตอบกลับอัตโนมัติ** - ตั้งค่า Keyword → คำตอบ
- 📢 **ส่งข้อความ** - ส่งข้อความถึงผู้ใช้
- 📋 **ประวัติข้อความ** - ดูประวัติการสนทนา
- 🔗 **ตั้งค่า Webhook** - ตั้งค่า Webhook ได้ง่าย
- ⚙️ **ตั้งค่า** - ปรับแต่งแอปพลิเคชัน

## 🚀 วิธีติดตั้ง

### 1. ตรวจสอบว่ามี Node.js แล้วหรือยัง
```
node --version
```
ถ้ายังไม่มี โหลดจาก https://nodejs.org

### 2. ติดตั้ง Dependencies
```
npm install
```

### 3. เริ่มแอปพลิเคชัน
```
npm start
```

หรือดับเบิลคลิกไฟล์ `start.bat`

## 📋 วิธีใช้งาน

### ขั้นตอนที่ 1: ตั้งค่า Facebook App
1. ไปที่ https://developers.facebook.com/apps
2. สร้าง App ใหม่ (เลือก Business)
3. เพิ่ม Product: Messenger
4. สร้าง Page Access Token

### ขั้นตอนที่ 2: ตั้งค่า Webhook
1. เปิดแอป → ไปที่ "ตั้งค่า Webhook"
2. คัดลอก Callback URL และ Verify Token
3. ไปที่ Facebook App Dashboard → Messenger → Settings
4. วาง Callback URL และ Verify Token
5. คลิก "Verify and Save"

### ขั้นตอนที่ 3: เพิ่มเพจ
1. เปิดแอป → ไปที่ "เพิ่มเพจ"
2. วาง Page Access Token
3. คลิก "บันทึกเพจ"

### ขั้นตอนที่ 4: ตั้งค่าตอบกลับอัตโนมัติ
1. เปิดแอป → ไปที่ "ตอบกลับอัตโนมัติ"
2. ตั้งค่า Keyword → คำตอบ
3. บันทึกการตั้งค่า

## 📁 โครงสร้างโปรเจค

```
facebook-chatbot-app/
├── main.js          # Electron main process + Webhook server
├── index.html       # หน้าจอหลัก
├── styles.css       # สไตล์ชีท
├── renderer.js      # โค้ดฝั่งหน้าจอ
├── package.json     # ตั้งค่าโปรเจค
├── start.bat        # ไฟล์เริ่มแอป
└── README.md        # เอกสารประกอบ
```

## 🔧 เทคโนโลยีที่ใช้

- **Electron** - Desktop Application Framework
- **Node.js** - Backend Runtime
- **Express** - Webhook Server
- **HTML/CSS/JavaScript** - Frontend

## 📝 หมายเหตุ

- แอปนี้รัน Webhook Server บน port 3000
- ต้อง Deploy Webhook ขึ้น Render.com เพื่อให้ Facebook เรียกได้
- Token ที่เก็บในแอปจะอยู่ในหน่วยความจำ (ยังไม่ได้บันทึกลงไฟล์)

## 📄 License

MIT License
