"""Server shutdown coordination: exit button + heartbeat watchdog."""
import threading
import time

_callback = None
_last_heartbeat = time.time()
_lock = threading.Lock()


def set_callback(cb):
    global _callback
    with _lock:
        _callback = cb


def heartbeat():
    global _last_heartbeat
    with _lock:
        _last_heartbeat = time.time()


def request_shutdown():
    with _lock:
        cb = _callback
    if cb:
        cb()


def start_watchdog(timeout=75.0, interval=5.0):
    """Background thread that requests shutdown after ``timeout`` seconds without a heartbeat."""

    def loop():
        while True:
            time.sleep(interval)
            with _lock:
                idle = time.time() - _last_heartbeat
            if idle > timeout:
                request_shutdown()
                return

    t = threading.Thread(target=loop, daemon=True, name="heartbeat-watchdog")
    t.start()
    return t
