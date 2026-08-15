@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo [1/4] 正在创建虚拟环境并安装后端依赖...
  cd backend
  python -m venv .venv
  .venv\Scripts\python -m pip install -r requirements.txt
  cd ..
)

if not exist "frontend\node_modules" (
  echo [2/4] 正在安装前端依赖...
  cd frontend
  call npm install
  cd ..
)

if not exist "frontend\dist\index.html" (
  echo [3/4] 正在构建前端...
  cd frontend
  call npm run build
  cd ..
)

echo [4/4] 正在启动服务，稍后浏览器会自动打开 http://127.0.0.1:8000 ...
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000"
cd backend
.venv\Scripts\python run.py

echo.
echo 服务已停止。
pause
