"""Barra lateral (fixar / trilho), personalização adaptativa e conversas por disciplina. Sirva `out/` e ajuste URL."""
from playwright.sync_api import sync_playwright
import json
URL = "http://localhost:4177/"
R = []
def check(name, cond, extra=""):
    R.append(bool(cond)); print(("PASS" if cond else "FAIL"), name, extra)

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
def sse(text): return "data: " + json.dumps({"choices": [{"delta": {"content": text}}]}) + "\n\ndata: [DONE]\n\n"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    def eventually(js, timeout=3000):
        """As listas vêm do IndexedDB (assíncrono): espera a condição em vez de checar na hora."""
        try: page.wait_for_function(js, timeout=timeout); return True
        except Exception: return False
    def convs(n):
        js = ("document.querySelector(\"select[aria-label='Conversas anteriores']\") === null" if n == 0
              else "document.querySelectorAll(\"select[aria-label='Conversas anteriores'] option\").length === %d" % (n + 1))
        return eventually(js)
    ctx.add_init_script("if (!localStorage.getItem('studyflow.ai.v1')) localStorage.setItem('studyflow.ai.v1', JSON.stringify({provider:'openrouter',baseUrl:'',model:'x/m',apiKey:'sk-or-T',consentGiven:true}))")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    calls = []
    def chat_route(route):
        if route.request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        body = json.loads(route.request.post_data); calls.append(body)
        last = [m["content"] for m in body["messages"] if m["role"] == "user"][-1]
        route.fulfill(status=200, headers={**CORS, "content-type": "text/event-stream"}, body=sse("Resposta a: " + last))
    page.route("https://openrouter.ai/api/v1/chat/completions", chat_route)

    aside = page.locator("aside[aria-label='Barra lateral']")
    pin = page.get_by_role("button", name="Fixar barra lateral")
    w = lambda: aside.evaluate("e => Math.round(e.getBoundingClientRect().width)")
    main_x = lambda: page.locator("#workspace").evaluate("e => Math.round(e.getBoundingClientRect().left)")

    page.goto(URL); page.wait_for_selector("text=Bem-vindo ao StudyFlow")

    # ---------- fixada (padrão) ----------
    check("padrão: fixada e expandida", pin.get_attribute("aria-pressed") == "true" and w() == 288, str(w()))
    page.mouse.move(900, 400); page.wait_for_timeout(500)
    check("fixada: continua expandida com o mouse fora", w() == 288)

    # ---------- desafixar ----------
    page.mouse.move(100, 300); pin.click()
    check("botão reflete o estado desafixado", pin.get_attribute("aria-pressed") == "false")
    page.wait_for_timeout(400)
    check("desafixada com o mouse ainda sobre a barra: não colapsa embaixo do cursor", w() == 288)
    page.mouse.move(900, 400); page.wait_for_timeout(600)
    check("mouse fora: recolhe para o trilho de ícones", w() == 56, str(w()))
    check("conteúdo ocupa o espaço liberado", main_x() == 56, str(main_x()))
    check("trilho: botões de navegação seguem acessíveis", page.get_by_role("button", name="Tarefas").count() == 1)

    # ---------- expandir ao aproximar da borda ----------
    page.mouse.move(8, 300); page.wait_for_timeout(500)
    check("borda: expande ao passar o mouse", w() == 288, str(w()))
    check("expandida por hover flutua sobre o conteúdo (sem empurrá-lo)", main_x() == 56, str(main_x()))
    check("estado do botão preservado durante o hover", pin.get_attribute("aria-pressed") == "false")
    page.mouse.move(900, 400); page.wait_for_timeout(600)
    check("sair com o mouse recolhe de novo", w() == 56)

    # ---------- persistência e primeira pintura ----------
    page.reload(); page.wait_for_selector("text=Bem-vindo ao StudyFlow")
    check("recarregar mantém desafixada", w() == 56 and pin.get_attribute("aria-pressed") == "false", str(w()))

    # ---------- clique não deixa a barra presa aberta ----------
    page.mouse.move(8, 300); page.wait_for_timeout(400)
    page.get_by_role("button", name="Tarefas").click()
    page.mouse.move(900, 400); page.wait_for_timeout(600)
    check("depois de clicar num item e sair, recolhe (foco do mouse não prende)", w() == 56, str(w()))

    # ---------- teclado ----------
    page.keyboard.press("Tab")
    for _ in range(3):
        if w() == 288: break
        page.keyboard.press("Tab")
    page.wait_for_timeout(300)
    check("foco por teclado expande a barra", w() == 288, str(w()))
    page.locator("#workspace").click(); page.wait_for_timeout(500)
    check("tirar o foco recolhe", w() == 56, str(w()))

    # ---------- fixar de novo ----------
    page.mouse.move(8, 300); page.wait_for_timeout(400)
    pin.click(); page.mouse.move(900, 400); page.wait_for_timeout(500)
    check("fixar de novo: permanece expandida fora", w() == 288 and main_x() == 288 and pin.get_attribute("aria-pressed") == "true", f"{w()} {main_x()}")
    page.reload(); page.wait_for_selector("text=Bem-vindo ao StudyFlow")
    check("recarregar mantém fixada", w() == 288 and pin.get_attribute("aria-pressed") == "true")

    # ---------- disciplinas, cores e abas ----------
    def new_subject(name):
        page.get_by_label("Nova disciplina").click(); page.get_by_placeholder("Ex.: Cálculo I").fill(name)
        page.get_by_role("button", name="Salvar", exact=True).click(); page.wait_for_selector(f"h1:has-text('{name}')")
    new_subject("Cálculo"); new_subject("Física")
    dots = page.locator("aside span.rounded-full[style*='background']").evaluate_all("els => els.map(e => e.style.background)")
    check("disciplinas novas recebem cores diferentes", len(set(dots[:2])) == 2, str(dots[:2]))
    acc = page.locator("h1").evaluate("e => getComputedStyle(e.closest('div[class*=flex-col]')).getPropertyValue('--accent').trim()")
    check("acento da área de trabalho assume a cor da disciplina", acc != "" , acc)
    page.get_by_role("button", name="Início").click()
    acc2 = page.locator("h1").evaluate("e => getComputedStyle(e.closest('div[class*=flex-col]')).getPropertyValue('--accent').trim()")
    check("fora da disciplina volta o acento padrão", acc2 == "#8b7cf6", acc2)

    # ---------- conversas independentes por disciplina ----------
    page.get_by_role("button", name="Cálculo", exact=True).click(); page.wait_for_selector("h1:has-text('Cálculo')")
    def ask(text):
        page.get_by_label("Mensagem para a IA").fill(text); page.keyboard.press("Enter")
        page.wait_for_selector(f"text=Resposta a: {text}")
        page.wait_for_timeout(200)
    ask("calc um")
    page.get_by_role("button", name="Nova conversa").click(); ask("calc dois")
    sel = page.locator("select[aria-label='Conversas anteriores']")
    check("Cálculo: duas conversas na lista", convs(2))
    check("histórico da 2ª conversa não carrega a 1ª", "calc um" not in json.dumps(calls[-1], ensure_ascii=False))

    page.get_by_role("button", name="Física", exact=True).click(); page.wait_for_selector("h1:has-text('Física')")
    page.get_by_role("button", name="Conversas desta disciplina").click()
    check("Física começa sem conversas (lista de Cálculo não vaza)", convs(0))
    check("Física não mostra mensagens de Cálculo", page.get_by_text("calc dois").count() == 0)
    ask("fis um")
    check("requisição de Física não contém nada de Cálculo", "calc" not in json.dumps(calls[-1], ensure_ascii=False))

    page.get_by_role("button", name="Cálculo", exact=True).click(); page.wait_for_selector("h1:has-text('Cálculo')")
    page.get_by_role("button", name="Conversas desta disciplina").click()
    check("voltar a Cálculo reabre a conversa em que estava", eventually("document.body.innerText.includes('Resposta a: calc dois')") and page.get_by_text("fis um").count() == 0)
    check("Cálculo ainda tem as 2 conversas", convs(2))
    page.once("dialog", lambda d: d.accept())
    page.get_by_role("button", name="Excluir conversa").click()
    check("excluir apaga só a conversa atual", convs(1))

    page.get_by_role("button", name="Física", exact=True).click()
    page.get_by_role("button", name="Conversas desta disciplina").click()
    check("Física intacta após excluir em Cálculo", eventually("document.body.innerText.includes('Resposta a: fis um')") and convs(1))
    page.once("dialog", lambda d: d.accept())
    page.get_by_role("button", name="Limpar histórico").click()
    check("limpar histórico esvazia a lista de Física", convs(0))
    page.get_by_role("button", name="Cálculo", exact=True).click()
    page.get_by_role("button", name="Conversas desta disciplina").click()
    check("limpar Física não afeta Cálculo", convs(1))
    page.reload(); page.wait_for_selector("text=Cálculo")
    page.get_by_role("button", name="Cálculo", exact=True).click()
    page.get_by_role("button", name="Conversas desta disciplina").click()
    check("conversas persistem após recarregar", convs(1))

    # ---------- ordem adaptativa dos painéis ----------
    nav_names = lambda: page.locator("nav[aria-label='Principal'] button").all_inner_texts()
    before = [t.strip() for t in nav_names()]
    for _ in range(5):
        page.get_by_role("button", name="Quizzes", exact=True).click(); page.get_by_role("button", name="Início").click()
    page.mouse.move(900, 400); page.wait_for_timeout(400)
    after = [t.strip() for t in nav_names()]
    check("ordem padrão no início", before[:3] == ["Início", "Tarefas", "Anotações"], str(before))
    check("painel mais usado sobe para o topo (depois de Início)", after[1] == "Quizzes", str(after))
    page.reload(); page.wait_for_selector("text=Cálculo")
    check("a ordem persiste", [t.strip() for t in nav_names()][1] == "Quizzes")
    page.get_by_role("button", name="Configurações", exact=True).last.click()
    page.get_by_role("button", name="Redefinir personalização").click()
    page.wait_for_timeout(300)
    check("redefinir devolve a ordem padrão", [t.strip() for t in nav_names()][1] == "Tarefas")

    # ---------- celular ----------
    m = b.new_context(viewport={"width": 390, "height": 800}).new_page()
    m.goto(URL); m.wait_for_timeout(800)
    check("celular: barra desktop escondida", not m.locator("aside[aria-label='Barra lateral']").is_visible())
    m.get_by_label("Abrir menu").click()
    check("celular: menu abre sem botão de fixar", m.get_by_role("button", name="Fixar barra lateral").count() == 0 and m.get_by_role("dialog", name="Menu").is_visible())

    check("sem erros de JS na página", not errs, str(errs))
    print(f"\n{sum(R)}/{len(R)} verificações passaram")
    b.close()
