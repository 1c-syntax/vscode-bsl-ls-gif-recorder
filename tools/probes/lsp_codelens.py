#!/usr/bin/env python3
# Probe: does the LS emit run-test codeLenses for tests/ПримерТестов.os?
import subprocess, json, threading, queue, time, os
from urllib.parse import quote
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JAVA=os.environ.get("BSL_LS_JAVA",os.path.join(ROOT,"work/jre25/bin/java"))
JAR=os.environ.get("BSL_LS_JAR",os.path.join(ROOT,"work/bsl-ls.jar"))
WS=os.path.join(ROOT,"workspace/oscript-demo")
def furi(p): return "file://"+quote(p,safe="/")
proc=subprocess.Popen([JAVA,"-jar",JAR,"--lsp"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
q=queue.Queue()
def send(m):
    d=json.dumps(m).encode();proc.stdin.write(f"Content-Length: {len(d)}\r\n\r\n".encode()+d);proc.stdin.flush()
def reader():
    f=proc.stdout
    while True:
        h=b""
        while b"\r\n\r\n" not in h:
            c=f.read(1)
            if not c:return
            h+=c
        ln=int(next(l for l in h.decode().split("\r\n") if l.lower().startswith("content-length")).split(":")[1])
        b=f.read(ln)
        try:q.put(json.loads(b))
        except:pass
threading.Thread(target=reader,daemon=True).start()
def wait_id(i,t=60):
    end=time.time()+t
    while time.time()<end:
        try:m=q.get(timeout=max(0.1,end-time.time()))
        except queue.Empty:break
        if m.get("id")==i and("result" in m or "error" in m):return m
    return None
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":os.getpid(),
    "clientInfo":{"name":"code-server"},"rootUri":furi(WS),"capabilities":{},
    "workspaceFolders":[{"uri":furi(WS),"name":"oscript-demo"}]}})
print("initialize:","ok" if wait_id(1) else "NO")
send({"jsonrpc":"2.0","method":"initialized","params":{}})
time.sleep(16)
p=os.path.join(WS,"tests/ПримерТестов.os")
uri=furi(p)
with open(p,encoding="utf-8") as fh:text=fh.read()
send({"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":uri,"languageId":"bsl","version":1,"text":text}}})
time.sleep(4)
send({"jsonrpc":"2.0","id":10,"method":"textDocument/codeLens","params":{"textDocument":{"uri":uri}}})
m=wait_id(10,40)
res=(m or {}).get("result")
print("codeLens count:",len(res) if res else res)
for cl in (res or []):
    cmd=cl.get("command") or {}
    print(f"  line {cl['range']['start']['line']}: cmd={cmd.get('command')!r} title={cmd.get('title')!r} data={cl.get('data')}")
send({"jsonrpc":"2.0","id":99,"method":"shutdown","params":{}});wait_id(99,5)
send({"jsonrpc":"2.0","method":"exit","params":{}});time.sleep(0.5);proc.terminate()
