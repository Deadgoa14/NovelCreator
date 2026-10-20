@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 需要管理员权限，正在请求...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="NovelCreator" >nul 2>&1
netsh advfirewall firewall add rule name="NovelCreator" dir=in action=allow protocol=TCP localport=8765 >nul 2>&1
echo.
echo 已放行端口 8765。
echo 手机连同一 WiFi，浏览器访问 http://你的电脑IPv4:8765 即可。
echo 电脑 IPv4 查看方法：命令行输入 ipconfig 回车，找「IPv4 地址」。
echo.
pause
