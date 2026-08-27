@echo off
echo ========================================
echo   Facebook Chatbot Manager
echo   กำลังเริ่มต้นแอปพลิเคชัน...
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/2] กำลังติดตั้ง dependencies...
    npm install
    echo.
)

echo [2/2] กำลังเริ่มแอป...
npm start

pause
