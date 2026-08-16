"""Dev entrypoint: python run.py"""
import uvicorn

from app import shutdown as sd
from app.main import app


def main():
    # 用 8765 而非 8000：8000 常被本机其它程序（如 NeatReader）占用，容易冲突。
    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="info")
    server = uvicorn.Server(config)
    sd.set_callback(lambda: setattr(server, "should_exit", True))
    sd.start_watchdog(timeout=75.0)
    server.run()


if __name__ == "__main__":
    main()
