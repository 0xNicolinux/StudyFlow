from playwright.sync_api import sync_playwright
import sys
URL = "http://localhost:4177/"
pdf = open("src/lib/__fixtures__/texto.pdf", "rb").read()
R = []
def check(n, c, extra=""):
    R.append(bool(c)); print(("PASS" if c else "FAIL"), n, extra); sys.stdout.flush()
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 900}); page = ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(URL); page.wait_for_selector("text=Bem-vindo ao StudyFlow")
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r => !!r && !!r.active)")
    page.wait_for_timeout(5000)  # pré-carga do leitor de PDF + cache
    keys = page.evaluate("caches.open('studyflow-v2').then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))")
    check("worker do PDF está no cache", "/pdf.worker.min.mjs" in keys, str(len(keys)) + " itens")
    check("chunk do leitor de PDF (pdfjs) foi pré-carregado no cache", any("_next/static/chunks" in k for k in keys) and len(keys) > 8)

    ctx.set_offline(True)
    page.reload(); page.wait_for_selector("h1")
    page.get_by_role("button", name="Biblioteca", exact=True).first.click()
    page.set_input_files("input[aria-label='Selecionar arquivos']", [
        {"name": "offline.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "offline.txt", "mimeType": "text/plain", "buffer": "texto local sem internet".encode()},
    ])
    page.wait_for_selector("text=2 arquivo(s) importado(s)", timeout=20000)
    check("importou PDF e TXT sem internet", page.locator("ul >> text=offline.pdf").count() == 1 and page.locator("ul >> text=offline.txt").count() == 1)
    page.get_by_role("button", name="offline.pdf").click()
    page.wait_for_selector("pre[aria-label='Texto extraído do documento']")
    check("texto do PDF foi extraído offline", "regra da cadeia" in page.locator("pre[aria-label='Texto extraído do documento']").inner_text())
    check("sem erros de página", not errs, str(errs[:2]))
    b.close()
print(sum(R), "/", len(R))
