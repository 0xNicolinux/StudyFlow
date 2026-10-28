from playwright.sync_api import sync_playwright
import json
R = []
def check(name, cond, extra=""):
    R.append((name, bool(cond))); print(("PASS" if cond else "FAIL"), name, extra)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.goto("http://localhost:4176/")
    page.wait_for_selector("text=Bem-vindo ao StudyFlow")
    bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("modo escuro por padrão", bg == "rgb(22, 23, 27)", bg)

    # criar disciplina
    page.get_by_label("Nova disciplina").click()
    page.get_by_placeholder("Ex.: Cálculo I").fill("Cálculo I")
    page.get_by_role("button", name="Salvar").click()
    page.wait_for_selector("h1:has-text('Cálculo I')")
    check("disciplina criada e aberta", True)

    # tarefa na disciplina
    page.get_by_role("tab", name="Tarefas").click()
    page.get_by_label("Título", exact=True).first.fill("Lista 1")
    page.get_by_role("button", name="Adicionar").click()
    page.wait_for_selector("text=Lista 1")
    # anotação
    page.get_by_role("tab", name="Anotações").click()
    page.get_by_role("button", name="Nova anotação").click()
    page.get_by_label("Título da anotação").fill("Limites")
    page.get_by_label("Conteúdo da anotação").fill("# Limite")
    page.wait_for_selector("text=Salvo neste dispositivo")

    # reload persiste
    page.reload()
    page.wait_for_selector("text=Cálculo I")
    page.get_by_role("button", name="Cálculo I").first.click()
    page.get_by_role("tab", name="Tarefas").click()
    page.wait_for_selector("text=Lista 1")
    check("disciplina e tarefa persistem após recarregar", True)
    page.get_by_role("tab", name="Anotações").click()
    page.get_by_text("Limites").first.wait_for()
    check("anotação persiste", page.get_by_text("Limites").count() > 0)

    # navegação central muda
    page.get_by_role("button", name="Início").click()
    page.get_by_text("Progresso geral").wait_for()
    check("dashboard geral mostra progresso", page.get_by_text("Progresso geral").count() == 1)

    # chat honesto
    page.get_by_label("Mensagem para a IA").fill("Olá")
    page.keyboard.press("Enter")
    page.wait_for_selector("text=Nenhuma chave de API configurada")
    check("chat assume a área central e avisa que falta configurar a IA", page.get_by_text("Voltar ao painel").count() == 1)
    page.screenshot(path="/tmp/desktop.png")

    # offline
    page.wait_for_timeout(1500)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r && !!r.active)")
    check("service worker ativo", sw)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector("h1")
    page.get_by_role("button", name="Cálculo I").first.click()
    page.get_by_role("tab", name="Tarefas").click()
    page.wait_for_selector("text=Lista 1")
    check("abre offline e dados locais continuam acessíveis", True)
    ctx.set_offline(False)

    # mobile
    m = b.new_context(viewport={"width": 390, "height": 800}).new_page()
    m.goto("http://localhost:4176/")
    m.wait_for_selector("h1")
    check("sidebar escondida no mobile", not m.locator("aside").first.is_visible())
    m.get_by_label("Abrir menu").click()
    m.locator("[aria-label=Menu]").get_by_text("Disciplinas").wait_for()
    sx = m.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    check("sem rolagem horizontal no mobile", sx)
    m.wait_for_timeout(500); m.screenshot(path="/tmp/mobile.png")
    check("sem erros de console/página", not errs, str(errs[:3]))
    b.close()
print(sum(1 for _, ok in R if ok), "/", len(R))
