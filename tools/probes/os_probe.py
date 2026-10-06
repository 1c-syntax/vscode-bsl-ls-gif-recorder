#!/usr/bin/env python3
# Probe: почему completion в .os на "Сцена" показывает СтартовыйСценарий, но не ТекущийСценарий.
# oscript-глобалы грузятся из bundled JSON → платформа/HBK не нужны (хост).
import subprocess, json, threading, queue, time, os, tempfile
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JAVA = os.environ.get("BSL_LS_JAVA", os.path.join(ROOT, "work/jre25/bin/java"))
JAR  = os.environ.get("BSL_LS_JAR", os.path.join(ROOT, "work/bsl-ls.jar"))
WS  = tempfile.mkdtemp(prefix="osprobe-")
def furi(p): return "file://" + quote(p, safe="/")

proc = subprocess.Popen([JAVA, "-jar", JAR, "--lsp"],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
q = queue.Queue()
def send(m):
    d=json.dumps(m).encode(); proc.stdin.write(f"Content-Length: {len(d)}\r\n\r\n".encode()+d); proc.stdin.flush()
def reader():
    f=proc.stdout
    while True:
        h=b""
        while b"\r\n\r\n" not in h:
            c=f.read(1)
            if not c: return
            h+=c
        ln=int(next(l for l in h.decode().split("\r\n") if l.lower().startswith("content-length")).split(":")[1])
        b=f.read(ln)
        try: q.put(json.loads(b))
        except: pass
threading.Thread(target=reader,daemon=True).start()
def wait_id(i,t=30):
    end=time.time()+t
    while time.time()<end:
        try: m=q.get(timeout=max(0.1,end-time.time()))
        except queue.Empty: break
        if m.get("id")==i and ("result" in m or "error" in m): return m
    return None

send({"jsonrpc":"2.0","id":1,"method":"initialize",
      "params":{"processId":os.getpid(),"rootUri":furi(WS),"capabilities":{},
                "workspaceFolders":[{"uri":furi(WS),"name":"os"}]}})
print("init:", "ok" if wait_id(1) else "NO", flush=True)
send({"jsonrpc":"2.0","method":"initialized","params":{}})
time.sleep(8)  # bootstrap oscript globals (JSON)

content = "С\nСцена\nСценарий\nТекущ\nТекущийСцен\n"
uri = furi(os.path.join(WS, "probe.os"))
send({"jsonrpc":"2.0","method":"textDocument/didOpen",
      "params":{"textDocument":{"uri":uri,"languageId":"bsl","version":1,"text":content}}})
time.sleep(2)

TARGETS = ("СтартовыйСценарий", "ТекущийСценарий")
def complete(i, line, ch, label):
    send({"jsonrpc":"2.0","id":i,"method":"textDocument/completion",
          "params":{"textDocument":{"uri":uri},"position":{"line":line,"character":ch}}})
    m=wait_id(i,30)
    if not m or m.get("result") is None:
        print(f"[{label}] NO RESULT"); return
    r=m["result"]
    if isinstance(r,dict):
        items=r.get("items",[]); incomplete=r.get("isIncomplete")
    else:
        items=r; incomplete="(list, no flag)"
    labels=[it.get("label","") for it in items]
    present={t: (t in labels) for t in TARGETS}
    scen=[l for l in labels if "Сценарий" in l or "Сцен" in l]
    print(f"[{label}] line={line} ch={ch} total={len(labels)} isIncomplete={incomplete}")
    print(f"    СтартовыйСценарий={present['СтартовыйСценарий']}  ТекущийСценарий={present['ТекущийСценарий']}")
    print(f"    *Сцен* items: {scen[:15]}", flush=True)

n=100
complete(n+1, 0, 1, "prefix=С");        complete(n+2, 1, 5, "prefix=Сцена")
complete(n+3, 2, 8, "prefix=Сценарий"); complete(n+4, 3, 5, "prefix=Текущ")
complete(n+5, 4, 11, "prefix=ТекущийСцен")
send({"jsonrpc":"2.0","id":99,"method":"shutdown","params":{}}); wait_id(99,5)
send({"jsonrpc":"2.0","method":"exit","params":{}}); time.sleep(0.3); proc.terminate()
