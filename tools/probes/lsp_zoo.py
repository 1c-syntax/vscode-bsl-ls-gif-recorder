#!/usr/bin/env python3
# Real-LSP probe for the zoo extends-demo: verifies TypeHierarchy (supertypes/subtypes)
# and Implementation against the freshly built jar, with the oscript-demo workspace as root
# so oscript_modules/zoolib gets indexed as library classes.
import subprocess, json, threading, queue, time, os, sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JAVA = os.environ.get("BSL_LS_JAVA", os.path.join(ROOT, "work/jre25/bin/java"))
JAR = os.environ.get("BSL_LS_JAR", os.path.join(ROOT, "work/bsl-ls.jar"))
WS = os.path.join(ROOT, "workspace/oscript-demo")
def furi(p): return "file://" + quote(p, safe="/")

proc = subprocess.Popen([JAVA, "-jar", JAR, "--lsp"],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
q = queue.Queue()
def send(msg):
    data = json.dumps(msg).encode("utf-8")
    proc.stdin.write(f"Content-Length: {len(data)}\r\n\r\n".encode() + data); proc.stdin.flush()
def reader():
    f = proc.stdout
    while True:
        header = b""
        while b"\r\n\r\n" not in header:
            c = f.read(1)
            if not c: return
            header += c
        length = int(next(l for l in header.decode().split("\r\n")
                          if l.lower().startswith("content-length")).split(":")[1])
        body = f.read(length)
        try: q.put(json.loads(body))
        except Exception: pass
threading.Thread(target=reader, daemon=True).start()
def wait_id(id_, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        try: m = q.get(timeout=max(0.1, end - time.time()))
        except queue.Empty: break
        if m.get("id") == id_ and ("result" in m or "error" in m): return m
    return None

caps = {"textDocument": {"implementation": {"linkSupport": True},
                          "typeHierarchy": {"dynamicRegistration": True}}}
send({"jsonrpc":"2.0","id":1,"method":"initialize",
      "params":{"processId":os.getpid(),"rootUri":furi(WS),"capabilities":caps,
                "workspaceFolders":[{"uri":furi(WS),"name":"oscript-demo"}]}})
print("initialize:", "ok" if wait_id(1) else "NO RESP")
send({"jsonrpc":"2.0","method":"initialized","params":{}})
print("indexing workspace (oscript_modules)…"); time.sleep(18)

def openf(rel):
    p = os.path.join(WS, rel)
    with open(p, encoding="utf-8") as fh: text = fh.read()
    uri = furi(p)
    send({"jsonrpc":"2.0","method":"textDocument/didOpen",
          "params":{"textDocument":{"uri":uri,"languageId":"bsl","version":1,"text":text}}})
    return uri

def names(items, *keys):
    if items is None: return "NO RESPONSE"
    out = []
    for it in items:
        for k in keys:
            if k in it: out.append(it[k]); break
        else: out.append(str(it)[:40])
    return out

koshka = openf("oscript_modules/zoolib/src/Кошка.os")
plav   = openf("oscript_modules/zoolib/src/Плавающее.os")
time.sleep(4)

# --- prepareTypeHierarchy on Кошка (position-independent) ---
send({"jsonrpc":"2.0","id":10,"method":"textDocument/prepareTypeHierarchy",
      "params":{"textDocument":{"uri":koshka},"position":{"line":6,"character":10}}})
m = wait_id(10); root = (m or {}).get("result")
print("\nprepareTypeHierarchy(Кошка):", names(root, "name") if root else "EMPTY")

if root:
    item = root[0]
    send({"jsonrpc":"2.0","id":11,"method":"typeHierarchy/supertypes","params":{"item":item}})
    print("  supertypes(Кошка):", names((wait_id(11) or {}).get("result"), "name"))
    send({"jsonrpc":"2.0","id":12,"method":"typeHierarchy/subtypes","params":{"item":item}})
    print("  subtypes(Кошка):", names((wait_id(12) or {}).get("result"), "name"))

# Млекопитающее prepare+subtypes (richer: Кошка+Собака)
mlek = openf("oscript_modules/zoolib/src/Млекопитающее.os"); time.sleep(2)
send({"jsonrpc":"2.0","id":13,"method":"textDocument/prepareTypeHierarchy",
      "params":{"textDocument":{"uri":mlek},"position":{"line":6,"character":5}}})
mr = (wait_id(13) or {}).get("result")
print("prepareTypeHierarchy(Млекопитающее):", names(mr, "name") if mr else "EMPTY")
if mr:
    send({"jsonrpc":"2.0","id":14,"method":"typeHierarchy/subtypes","params":{"item":mr[0]}})
    print("  subtypes(Млекопитающее):", names((wait_id(14) or {}).get("result"), "name"))
    send({"jsonrpc":"2.0","id":15,"method":"typeHierarchy/supertypes","params":{"item":mr[0]}})
    print("  supertypes(Млекопитающее):", names((wait_id(15) or {}).get("result"), "name"))

# --- implementation on Плавающее.Плавать() export method (line idx 6) ---
send({"jsonrpc":"2.0","id":20,"method":"textDocument/implementation",
      "params":{"textDocument":{"uri":plav},"position":{"line":6,"character":12}}})
mi = (wait_id(20) or {}).get("result")
print("\nimplementation(Плавающее.Плавать):", names(mi, "targetUri", "uri") if mi else "EMPTY")

send({"jsonrpc":"2.0","id":99,"method":"shutdown","params":{}}); wait_id(99,5)
send({"jsonrpc":"2.0","method":"exit","params":{}}); time.sleep(0.5); proc.terminate()
