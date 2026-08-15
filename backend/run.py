"""Dev entrypoint: python run.py"""
import uvicorn

from app import shutdown as sd
from app.main import app


def main():
    config = uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="info")
    server = uvicorn.Server(config)
    sd.set_callback(lambda: setattr(server, "should_exit", True))
    sd.start_watchdog(timeout=75.0)
    server.run()


if __name__ == "__main__":
    main()
