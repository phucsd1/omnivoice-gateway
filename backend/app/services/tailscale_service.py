import os
import sys
import json
import time
import shutil
import subprocess
import threading
from typing import Optional, Dict, Any, List

from app.config import settings

class TailscaleService:
    _process: Optional[subprocess.Popen] = None
    _lock = threading.Lock()
    _init_started = False

    @staticmethod
    def get_binaries():
        for d in ['/usr/local/bin', '/usr/bin', '/usr/sbin']:
            td = os.path.join(d, 'tailscaled')
            ts = os.path.join(d, 'tailscale')
            if os.path.isfile(td) and os.access(td, os.X_OK):
                return td, ts
        
        td = shutil.which('tailscaled')
        ts = shutil.which('tailscale')
        if td and ts:
            return td, ts
            
        win_path = r'C:\Program Files\Tailscale\tailscale.exe'
        if os.path.exists(win_path):
            return win_path, win_path
            
        return None, None

    @staticmethod
    def get_storage_dir():
        d = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'storage', 'tailscale'))
        os.makedirs(d, exist_ok=True)
        return d

    @staticmethod
    def get_socket_path():
        return os.path.join(TailscaleService.get_storage_dir(), 'tailscaled.sock')

    @staticmethod
    def get_auth_key():
        try:
            from app.database import SessionLocal
            from app.models import SystemSetting
            db = SessionLocal()
            entry = db.query(SystemSetting).filter(SystemSetting.key == 'tailscale_authkey').first()
            if entry and entry.value.strip():
                return entry.value.strip()
        except Exception:
            pass

        key_file = os.path.join(TailscaleService.get_storage_dir(), 'authkey.txt')
        if os.path.exists(key_file):
            try:
                with open(key_file, 'r', encoding='utf-8') as f:
                    val = f.read().strip()
                    if val:
                        return val
            except Exception:
                pass

        return getattr(settings, 'TAILSCALE_AUTHKEY', '') or os.environ.get('TAILSCALE_AUTHKEY', '')

    @staticmethod
    def save_auth_key(key: str):
        key = key.strip()
        key_file = os.path.join(TailscaleService.get_storage_dir(), 'authkey.txt')
        try:
            with open(key_file, 'w', encoding='utf-8') as f:
                f.write(key)
        except Exception:
            pass

        try:
            from app.database import SessionLocal
            from app.models import SystemSetting
            db = SessionLocal()
            entry = db.query(SystemSetting).filter(SystemSetting.key == 'tailscale_authkey').first()
            if not entry:
                entry = SystemSetting(key='tailscale_authkey', value=key)
                db.add(entry)
            else:
                entry.value = key
            db.commit()
        except Exception:
            pass

    @classmethod
    def start_background(cls):
        with cls._lock:
            if cls._init_started:
                return
            cls._init_started = True

        t = threading.Thread(target=cls.start_tailscale, daemon=True)
        t.start()

    @classmethod
    def start_tailscale(cls, auth_key=None):
        td_bin, ts_bin = cls.get_binaries()
        if not td_bin:
            return {'status': 'error', 'message': 'Tailscale binaries not found in container'}

        if not auth_key:
            auth_key = cls.get_auth_key()

        if not auth_key:
            return {'status': 'error', 'message': 'No Tailscale AuthKey configured'}

        cls.save_auth_key(auth_key)
        storage_dir = cls.get_storage_dir()
        socket_path = cls.get_socket_path()

        try:
            cmd = [
                td_bin,
                '--tun=userspace-networking',
                f'--statedir={storage_dir}',
                f'--socket={socket_path}',
                '--socks5-server=localhost:1055',
                '--outbound-http-proxy-listen=localhost:1055'
            ]

            status = cls.get_status()
            if not status.get('running'):
                print('[Tailscale] Starting tailscaled in userspace mode...', flush=True)
                cls._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL
                )

                for _ in range(20):
                    if os.path.exists(socket_path):
                        break
                    time.sleep(0.5)

            print('[Tailscale] Authenticating with Tailscale network...', flush=True)
            cmd_up = [
                ts_bin,
                f'--socket={socket_path}',
                'up',
                f'--authkey={auth_key}',
                '--hostname=omnivoice-gateway',
                '--accept-routes',
                '--reset'
            ]
            res = subprocess.run(cmd_up, capture_output=True, text=True, timeout=40)
            if res.returncode == 0:
                print('[Tailscale] Successfully connected to Tailscale! Listening on localhost:1055', flush=True)
                return {'status': 'success', 'message': 'Tailscale connected successfully'}
            else:
                err = res.stderr.strip() or res.stdout.strip()
                print(f'[Tailscale] tailscale up warning/error: {err}', flush=True)
                return {'status': 'warning', 'message': err}
        except Exception as e:
            print(f'[Tailscale] Exception starting tailscale: {e}', flush=True)
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def get_status(cls):
        td_bin, ts_bin = cls.get_binaries()
        if not td_bin:
            return {
                'installed': False,
                'running': False,
                'connected': False,
                'message': 'Tailscale binary is not installed on this system'
            }

        socket_path = cls.get_socket_path()
        if not os.path.exists(socket_path):
            return {
                'installed': True,
                'running': False,
                'connected': False,
                'message': 'tailscaled daemon is not running'
            }

        try:
            cmd = [ts_bin, f'--socket={socket_path}', 'status', '--json']
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode != 0:
                return {
                    'installed': True,
                    'running': True,
                    'connected': False,
                    'message': res.stderr.strip() or 'Not connected'
                }

            data = json.loads(res.stdout)
            backend_state = data.get('BackendState', '')
            self_node = data.get('Self', {})
            ips = self_node.get('TailscaleIPs', [])
            hostname = self_node.get('HostName', 'omnivoice-gateway')

            peers = []
            for peer_key, peer_info in data.get('Peer', {}).items():
                p_ips = peer_info.get('TailscaleIPs', [])
                peers.append({
                    'id': peer_key,
                    'hostname': peer_info.get('HostName', ''),
                    'os': peer_info.get('OS', ''),
                    'ip': p_ips[0] if p_ips else None,
                    'online': peer_info.get('Online', False),
                    'exit_node': peer_info.get('ExitNode', False),
                    'exit_node_option': peer_info.get('ExitNodeOption', False),
                })

            connected = backend_state.lower() == 'running'
            return {
                'installed': True,
                'running': True,
                'connected': connected,
                'backend_state': backend_state,
                'hostname': hostname,
                'tailscale_ip': ips[0] if ips else None,
                'all_ips': ips,
                'proxy_port': 1055,
                'peers': peers
            }
        except Exception as e:
            return {
                'installed': True,
                'running': False,
                'connected': False,
                'message': str(e)
            }

    @classmethod
    def set_exit_node(cls, exit_node: str):
        td_bin, ts_bin = cls.get_binaries()
        socket_path = cls.get_socket_path()
        if not ts_bin or not os.path.exists(socket_path):
            return {'status': 'error', 'message': 'Tailscale is not active'}

        try:
            cmd = [
                ts_bin,
                f'--socket={socket_path}',
                'set',
                f'--exit-node={exit_node.strip()}',
                '--exit-node-allow-lan-access'
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                return {'status': 'success', 'message': f'Đã định tuyến qua Exit Node: {exit_node}'}
            return {'status': 'error', 'message': res.stderr.strip() or res.stdout.strip()}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def is_proxy_available(cls):
        status = cls.get_status()
        if not status.get('connected'):
            return False
        import socket
        try:
            with socket.create_connection(('127.0.0.1', 1055), timeout=1.0):
                return True
        except Exception:
            return False
