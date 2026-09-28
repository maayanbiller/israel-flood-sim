from http.server import BaseHTTPRequestHandler, HTTPServer
import json

class TestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
        
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        with open('test_results.txt', 'a') as f:
            f.write(f"[{data.get('type')}] {data.get('message')}\n")
            
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")
        
    def log_message(self, format, *args):
        pass

server = HTTPServer(('localhost', 8081), TestHandler)
print("Test log server running on 8081")
server.serve_forever()
