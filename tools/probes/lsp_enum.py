#!/usr/bin/env python3
# Real-LSP probe: does completion after `Перечисления.<Имя>.` offer the enum VALUES
# (Ошибка/Предупреждение/...) in addition to manager methods? Root = SSL workspace.
# Needs the SSL configuration at <WS>/src/cf. On the host workspace/src is only an empty
# Docker mount point, so pass BSL_PROBE_WS=vendor/ssl_3_2 (the module is opened in memory
# via didOpen, nothing is written to disk).
import subprocess, json, threading, queue, time, os
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JAVA = os.environ.get("BSL_LS_JAVA", os.path.join(ROOT, "work/jre25/bin/java"))
JAR  = os.environ.get("BSL_LS_JAR", os.path.join(ROOT, "work/bsl-ls.jar"))
WS   = os.environ.get("BSL_PROBE_WS", os.path.join(ROOT, "workspace"))
def furi(p): return "file://" + quote(p, safe="/")

proc = subprocess.Popen([JAVA, "-jar", JAR, "--lsp"],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
q = queue.Queue()
def send(m):
    d = json.dumps(m).encode(); proc.stdin.write(f"Content-Length: {len(d)}\r\n\r\n".encode()+d); proc.stdin.flush()
def reader():
    f = proc.stdout
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
threading.Thread(target=reader, daemon=True).start()
def wait_id(i,t=60):
    end=time.time()+t
    while time.time()<end:
        try: m=q.get(timeout=max(0.1,end-time.time()))
        except queue.Empty: break
        if m.get("id")==i and ("result" in m or "error" in m): return m
    return None

send({"jsonrpc":"2.0","id":1,"method":"initialize",
      "params":{"processId":os.getpid(),"rootUri":furi(WS),"capabilities":{},
                "workspaceFolders":[{"uri":furi(WS),"name":"ssl"}]}})
print("initialize:", "ok" if wait_id(1) else "NO RESP")
send({"jsonrpc":"2.0","method":"initialized","params":{}})

content = ("Процедура Демонстрация()\n"
           "\tПеречисления.ВажностьПроблемыУчета.\n"
           "КонецПроцедуры\n")
uri = furi(os.path.join(WS, "comp-enum-probe.bsl"))
send({"jsonrpc":"2.0","method":"textDocument/didOpen",
      "params":{"textDocument":{"uri":uri,"languageId":"bsl","version":1,"text":content}}})

VALUES = {"Ошибка","Предупреждение","ВажнаяИнформация","Информация","ПолезныйСовет"}
LINE, CH = 1, 36  # caret right after the trailing dot on line idx 1 (tab+Перечисления.+ВажностьПроблемыУчета.)

def complete(i):
    send({"jsonrpc":"2.0","id":i,"method":"textDocument/completion",
          "params":{"textDocument":{"uri":uri},"position":{"line":LINE,"character":CH}}})
    m=wait_id(i,60)
    if not m or m.get("result") is None: return None
    r=m["result"]; return r["items"] if isinstance(r,dict) and "items" in r else r

print("indexing SSL config (polling completion until Перечисления resolves)…")
deadline=time.time()+300; items=None; n=0
while time.time()<deadline:
    n+=1; items=complete(100+n)
    labels=[it.get("label","") for it in (items or [])]
    if any("Получить" in l or "ПолучитьМакет" in l for l in labels):
        print(f"  resolved on attempt {n} (count={len(labels)})"); break
    print(f"  attempt {n}: count={len(labels) if items is not None else 'NO RESP'}")
    time.sleep(10)

labels=[it.get("label","") for it in (items or [])]
found_vals=sorted(VALUES & set(labels))
print("\n=== RESULT ===")
print("total items:", len(labels))
print("enum VALUES present:", found_vals if found_vals else "NONE")
print("sample labels:", labels[:25])

send({"jsonrpc":"2.0","id":99,"method":"shutdown","params":{}}); wait_id(99,5)
send({"jsonrpc":"2.0","method":"exit","params":{}}); time.sleep(0.5); proc.terminate()
