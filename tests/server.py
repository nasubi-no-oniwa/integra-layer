# テスト用：ゲームのファイルを配りつつ、にせ Firebase のデータを持つ
import json, sys, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
DATA = {}
def parts(p): return [k for k in str(p or '').split('/') if k]
def get_at(t, p):
    for k in parts(p):
        if not isinstance(t, dict) or k not in t: return None
        t = t[k]
    return t
def set_at(root, p, v):
    ks = parts(p); t = root
    for k in ks[:-1]:
        if not isinstance(t.get(k), dict): t[k] = {}
        t = t[k]
    if v is None: t.pop(ks[-1], None)
    else: t[ks[-1]] = v
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        if self.path != '/__db': return self.send_error(404)
        b = json.loads(self.rfile.read(int(self.headers['Content-Length'])) or b'{}')
        tree = DATA.setdefault(b.get('db', 'x'), {}); op = b.get('op'); out = {'ok': True}
        if op == 'get': out['tree'] = tree
        elif op == 'set': set_at(tree, b['path'], b.get('value'))
        elif op == 'update':
            for k, v in (b.get('value') or {}).items(): set_at(tree, b['path'] + '/' + k, v)
        elif op == 'cas':
            if get_at(tree, b['path']) == b.get('expect'): set_at(tree, b['path'], b.get('value'))
            else: out['ok'] = False
        r = json.dumps(out).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(r))); self.end_headers(); self.wfile.write(r)
os.chdir(sys.argv[1]); ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2])), H).serve_forever()
