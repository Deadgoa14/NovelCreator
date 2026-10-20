"""Dev entrypoint: python run.py"""
import socket

import uvicorn

from app import shutdown as sd
from app.main import app


def lan_ips():
    """Best-effort list of this machine's LAN IPv4 addresses."""
    ips = set()
    # Default-route IP (the one used to reach the internet) is usually the LAN IP.
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        if ip and not ip.startswith("127."):
            ips.add(ip)
    except Exception:
        pass
    finally:
        s.close()
    # Enumerate all IPv4 addresses.
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254."):
                ips.add(ip)
    except Exception:
        pass
    return sorted(ips)


def main():
    # 用 8765 而非 8000：8000 常被本机其它程序（如 NeatReader）占用，容易冲突。
    # host 用 0.0.0.0：同一局域网的其它设备（手机等）也能访问；本机体验不变。
    config = uvicorn.Config(app, host="0.0.0.0", port=8765, log_level="info")
    server = uvicorn.Server(config)
    sd.set_callback(lambda: setattr(server, "should_exit", True))
    sd.start_watchdog(timeout=75.0)
    ips = lan_ips()
    print("=" * 56)
    print("本机访问：http://127.0.0.1:8765")
    if ips:
        print("局域网访问（手机等设备，需连同一 WiFi）：")
        for ip in ips:
            print(f"  http://{ip}:8765")
    print("若手机无法访问，通常是 Windows 防火墙拦截，")
    print("请用管理员身份运行一次：")
    print('  netsh advfirewall firewall add rule name="NovelCreator" dir=in action=allow protocol=TCP localport=8765')
    print("=" * 56)
    server.run()


if __name__ == "__main__":
    main()
