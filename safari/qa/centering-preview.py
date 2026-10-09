#!/usr/bin/env python3
"""Render the actual button factory/CSS in normal and large player controls."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json
source = Path(__file__).resolve().parents[1] / 'extension/transcript.js'
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/watch':
            args = parse_qs(parsed.query)
            state = args.get('state', ['idle'])[0]
            large = args.get('size', ['normal'])[0] == 'large'
            width, height = (64, 48) if large else (48, 36)
            script = source.read_text().replace('  mount();', '  window.__qa = {setButton};\n  mount();')
            # Deliberately emulate inline/baseline offsets from host CSS; our rules must win.
            content = f'''<!doctype html><meta charset="utf-8"><style>
            body{{margin:0;background:#222;color:white;font:14px system-ui;}}
            #movie_player{{padding:24px;}}.ytp-right-controls{{height:{height}px;white-space:nowrap;}}
            .ytp-button{{display:inline-block;width:{width}px;height:100%;position:relative;padding:3px 5px;border:0;background:#444;color:white;box-sizing:border-box;}}
            .ytp-button svg{{position:absolute;top:3px;left:5px;margin-top:4px;}}
            #triangle-transcript-button svg{{animation:none!important;}}
            .ytp-right-controls{{outline:1px solid #888;}}
            </style><div id="movie_player"><div class="ytp-right-controls"></div></div>
            <script>{script}</script><script>__qa.setButton(document.getElementById('triangle-transcript-button'),{json.dumps(state)},{json.dumps(state)});</script>'''
        else:
            frames = ''.join(f'<div><p>{size}: {state}</p><iframe title="{size}-{state}" src="/watch?v=fixture0001&state={state}&size={size}"></iframe></div>' for size in ['normal','large'] for state in ['idle','busy','success','error'])
            content = '<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;background:#181818;color:white;padding:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}iframe{width:100%;height:120px;border:0}p{margin:8px 0}</style><h1>Triangle Transcript — центрирование</h1><div class="grid">'+frames+'</div>'
        raw=content.encode()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def log_message(self, *args): pass
print('Centering preview: http://127.0.0.1:8769', flush=True)
HTTPServer(('127.0.0.1',8769),Handler).serve_forever()
