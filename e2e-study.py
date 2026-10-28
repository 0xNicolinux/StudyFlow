from playwright.sync_api import sync_playwright
import json, re, sys
URL = "http://localhost:4177/"
FX = "src/lib/__fixtures__/"
R = []
def check(name, cond, extra=""):
    R.append(bool(cond)); print(("PASS" if cond else "FAIL"), name, extra); sys.stdout.flush()

pdf = open(FX + "texto.pdf", "rb").read()
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}

def sse(*parts):
    return "".join("data: " + json.dumps({"choices": [{"delta": {"content": p}}]}) + "\n\n" for p in parts) + "data: [DONE]\n\n"

def nav(page, name): page.get_by_role("button", name=name, exact=True).first.click()
def new_subject(page, name):
    page.get_by_label("Nova disciplina").click(); page.get_by_placeholder("Ex.: Cálculo I").fill(name)
    page.get_by_role("button", name="Salvar", exact=True).click(); page.wait_for_selector(f"h1:has-text('{name}')")
def tab(page, name): page.get_by_role("tab", name=name).click()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.clock.install()
    page.goto(URL); page.wait_for_selector("text=Bem-vindo ao StudyFlow")

    # ================= ETAPA 4: FOCO =================
    new_subject(page, "Cálculo")
    nav(page, "Foco")
    check("relógio inicia em 25:00", page.get_by_test_id("clock").inner_text() == "25:00")
    page.get_by_label("Disciplina do foco").select_option(label="Cálculo")
    page.get_by_role("button", name="Iniciar", exact=True).click()
    page.clock.run_for(60_000)
    check("relógio corre (≈24:00 após 1 min)", page.get_by_test_id("clock").inner_text() in ("24:00", "23:59"), page.get_by_test_id("clock").inner_text())
    page.get_by_role("button", name="Pausar").click()
    page.clock.run_for(5 * 60_000)
    check("pausa congela o tempo", page.get_by_test_id("clock").inner_text() in ("24:00", "23:59"))
    page.reload(); page.wait_for_selector("h1"); nav(page, "Foco")
    check("estado pausado persiste após recarregar", page.get_by_role("button", name="Retomar").count() == 1 and page.get_by_test_id("clock").inner_text() in ("24:00", "23:59"))
    page.get_by_role("button", name="Retomar").click()
    nav(page, "Início")
    check("cronômetro aparece no cabeçalho fora da tela de foco", page.get_by_role("button", name=re.compile("Cronômetro de foco")).count() == 1)
    page.clock.run_for(24 * 60_000 + 2000)
    nav(page, "Foco")
    page.wait_for_selector("text=Descanso curto")
    check("foco concluído gera descanso curto parado", page.get_by_test_id("clock").inner_text() == "05:00" and page.get_by_role("button", name="Iniciar", exact=True).count() == 1)
    page.wait_for_selector("text=Últimos 7 dias")
    check("sessão de 25 min registrada nas estatísticas", page.get_by_text("25 min").count() >= 2)
    nav(page, "Início")
    page.get_by_text("Estudo hoje").wait_for()
    check("dashboard geral mostra tempo de estudo", page.get_by_text("25 min").count() >= 1)

    # ================= ETAPA 4: FLASHCARDS =================
    page.get_by_role("button", name="Cálculo").first.click(); tab(page, "Flashcards")
    for f, v in (("Derivada de x²?", "2x"), ("Limite de 1/x quando x→∞?", "0")):
        page.get_by_label("Frente do cartão").fill(f); page.get_by_label("Verso do cartão").fill(v)
        page.get_by_role("button", name="Adicionar cartão").click(); page.wait_for_selector(f"text={f}")
    page.get_by_role("button", name=re.compile(r"Revisar \(2\)")).wait_for()
    check("cartões novos já aparecem para revisar", True)
    page.get_by_role("button", name=re.compile(r"Revisar \(2\)")).click()
    page.wait_for_selector("text=Pergunta")
    page.keyboard.press("Space"); page.wait_for_selector("text=Resposta")
    check("verso só aparece depois de mostrar a resposta", page.get_by_text("Resposta", exact=True).count() == 1)
    page.keyboard.press("3")                 # Bom
    page.wait_for_selector("text=1 restante"); page.get_by_text("Resposta", exact=True).wait_for(state="hidden")
    page.keyboard.press("Space"); page.wait_for_selector("text=Resposta")
    page.keyboard.press("1")                 # Errei -> volta ao fim
    page.wait_for_selector("text=1 restante"); page.get_by_text("Resposta", exact=True).wait_for(state="hidden")
    page.keyboard.press("Space"); page.wait_for_selector("text=Resposta"); page.keyboard.press("3")
    page.wait_for_selector("text=Revisão concluída")
    check("revisão conclui e conta 3 avaliações (erro volta uma vez)", page.get_by_text("Você avaliou 3 cartões").count() == 1)
    page.get_by_role("button", name="Voltar aos cartões").click()
    page.wait_for_selector("text=Acertos nas revisões")
    check("retenção = 2 acertos / 3 avaliações = 67%", page.get_by_text("67%").count() == 1)
    check("nenhuma revisão pendente depois de revisar", page.get_by_role("button", name=re.compile(r"Revisar")).is_disabled())

    # ================= ETAPA 4: QUIZZES =================
    tab(page, "Quizzes")
    page.get_by_role("button", name="Novo quiz").click()
    page.get_by_label("Título", exact=True).fill("Derivadas")
    page.get_by_label("Enunciado da pergunta 1").fill("d/dx x²")
    page.get_by_label("Alternativa 1 da pergunta 1", exact=True).fill("x"); page.get_by_label("Alternativa 2 da pergunta 1", exact=True).fill("2x")
    page.get_by_label("Marcar alternativa 2 da pergunta 1 como correta").check()
    page.get_by_role("button", name="Adicionar pergunta").click()
    page.get_by_label("Enunciado da pergunta 2").fill("d/dx constante")
    page.get_by_label("Alternativa 1 da pergunta 2", exact=True).fill("0"); page.get_by_label("Alternativa 2 da pergunta 2", exact=True).fill("1")
    # tenta salvar com pergunta inválida primeiro (alternativa vazia)
    page.get_by_role("button", name="+ Alternativa").last.click()
    page.get_by_role("button", name="Salvar quiz").click()
    page.wait_for_selector("text=Alternativas não podem ficar vazias")
    check("quiz inválido é recusado com mensagem", True)
    page.get_by_role("button", name="Remover alternativa 3").click()
    page.get_by_label("Marcar alternativa 1 da pergunta 2 como correta").check()
    page.get_by_role("button", name="Salvar quiz").click()
    page.wait_for_selector("text=2 pergunta(s)")
    def take(answers):
        page.get_by_role("button", name="Fazer").click()
        for k, a in enumerate(answers):
            page.get_by_role("radio").nth(a).check(); page.get_by_role("button", name="Confirmar").click()
            page.get_by_role("button", name="Próxima" if k < len(answers) - 1 else "Ver resultado").click()
    take([1, 1])       # acerta 1 de 2
    page.wait_for_selector("text=Resultado")
    check("resultado 1/2 e gabarito mostrado", page.get_by_test_id("score").inner_text() == "1/2" and page.get_by_text("Correta:").count() == 1)
    page.get_by_role("button", name="Voltar aos quizzes").click()
    page.wait_for_selector("text=última: 1/2")
    take([1, 0])       # acerta 2 de 2
    page.get_by_role("button", name="Voltar aos quizzes").click()
    page.wait_for_selector("text=última: 2/2")
    check("média 75% em 2 tentativas e evolução 50% → 100%", page.get_by_text("média: 75% em 2 tentativa(s)").count() == 1 and page.get_by_text("50% → 100%").count() == 1)
    tab(page, "Visão geral")
    page.get_by_text("Média nos quizzes").wait_for(); page.get_by_text("75%").first.wait_for()
    check("visão geral da disciplina mostra os indicadores", page.get_by_text("Média nos quizzes").count() == 1 and page.get_by_text("Tempo de estudo").count() == 1 and page.get_by_text("75%").count() >= 1)

    # ================= ETAPA 5: BIBLIOTECA =================
    tab(page, "Materiais")
    files = [
        {"name": "apostila.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "notas.txt", "mimeType": "text/plain", "buffer": "Notas de aula sobre integrais definidas.".encode()},
        {"name": "resumo.md", "mimeType": "text/markdown", "buffer": "# Resumo\nAs derivadas medem a variação instantânea.".encode()},
        {"name": "foto.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n"},
        {"name": "falso.pdf", "mimeType": "application/pdf", "buffer": "isto é só texto".encode()},
        {"name": "vazio.txt", "mimeType": "text/plain", "buffer": b""},
    ]
    page.set_input_files("input[aria-label='Selecionar arquivos']", files)
    page.wait_for_selector("text=não importado(s)")
    for n in ("apostila.pdf", "notas.txt", "resumo.md"):
        check(f"importado: {n}", page.locator("ul >> text=" + n).count() >= 1)
    check("formato inválido recusado (png)", page.get_by_text("foto.png").count() == 1 and page.get_by_text("formato não suportado").count() == 1)
    check("PDF falso recusado pelo conteúdo", page.get_by_text("não parece ser um PDF válido").count() == 1)
    check("arquivo vazio recusado", page.get_by_text("o arquivo está vazio").count() == 1)
    check("metadados do PDF (tipo, páginas)", page.get_by_text(re.compile(r"PDF · .* · 2 pág\.")).count() == 1)
    page.get_by_role("button", name="Dispensar").click()

    page.get_by_label("Pesquisar materiais").fill("continuidade")
    page.wait_for_selector("text=Calculo diferencial")
    check("busca encontra texto dentro do PDF (com trecho)", page.locator("ul >> text=apostila.pdf").count() == 1 and page.locator("ul >> text=notas.txt").count() == 0)
    page.get_by_label("Pesquisar materiais").fill("VARIACAO")
    page.wait_for_selector("text=variação instantânea")
    check("busca ignora acento e maiúsculas", page.locator("ul >> text=resumo.md").count() == 1)
    page.get_by_label("Pesquisar materiais").fill("zzzz")
    page.wait_for_selector("text=Nada encontrado")
    page.get_by_label("Pesquisar materiais").fill("")

    page.get_by_role("button", name=re.compile("apostila.pdf")).click()
    page.wait_for_selector("section[aria-label='Arquivo original']")
    check("original e texto extraído são seções distintas e rotuladas", page.locator("section[aria-label='Arquivo original']").count() == 1 and page.locator("section[aria-label='Texto extraído']").count() == 1)
    check("texto extraído do PDF visível", "regra da cadeia" in page.locator("pre[aria-label='Texto extraído do documento']").inner_text())
    page.evaluate("() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; }")
    page.get_by_role("button", name="Abrir original em nova aba").click()
    page.wait_for_function("window.__opened.length === 1")
    opened = page.evaluate("window.__opened[0]")
    size = page.evaluate("async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); return [b.length, String.fromCharCode(...b.slice(0, 5))]; }", opened)
    check("abre o original: URL blob com o PDF intacto (mesmo tamanho e assinatura)", opened.startswith("blob:") and size == [len(pdf), "%PDF-"], str(size))
    # selecionar trecho e adicionar ao contexto
    page.evaluate("""() => { const pre = document.querySelector("pre[aria-label='Texto extraído do documento']");
      const t = pre.firstChild; const i = t.textContent.indexOf('O limite de f(x)');
      const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 40);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      pre.dispatchEvent(new MouseEvent('mouseup', {bubbles: true})); }""")
    page.get_by_role("button", name="Adicionar trecho selecionado").click()
    page.wait_for_selector("text=Trecho adicionado")
    page.get_by_role("button", name="Fechar").first.click() if page.get_by_role("button", name="Fechar").count() else page.keyboard.press("Escape")
    page.wait_for_selector("section[aria-label='Arquivo original']", state="hidden")

    # documento inteiro (notas.txt) ao contexto
    page.get_by_role("button", name=re.compile("notas.txt")).click()
    page.get_by_role("button", name="Adicionar documento ao contexto").click()
    page.keyboard.press("Escape")

    # ---- IA: só o que foi selecionado é enviado ----
    calls = []
    def chat_route(route):
        req = route.request
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        calls.append(json.loads(req.post_data))
        route.fulfill(status=200, headers={**CORS, "content-type": "text/event-stream"}, body=sse("Ok, ", "entendi."))
    page.route("https://openrouter.ai/api/v1/chat/completions", chat_route)
    nav(page, "Configurações")
    page.get_by_placeholder("sk-or-…").fill("sk-or-TESTE"); page.get_by_placeholder("ex.: provedor/nome-do-modelo").fill("x/modelo")
    page.get_by_role("button", name="Salvar configuração de IA").click(); page.wait_for_selector("text=Configuração salva")
    page.get_by_role("button", name="Cálculo").first.click()
    page.get_by_label("Mensagem para a IA").fill("Resuma o que selecionei"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Confirmar envio à IA")
    check("confirmação lista trecho do PDF e documento TXT", page.get_by_text("Trecho de apostila.pdf").count() >= 1 and page.get_by_text("Documento: notas.txt").count() >= 1)
    check("nada enviado antes de confirmar", len(calls) == 0)
    page.get_by_role("button", name="Enviar", exact=True).click()
    page.wait_for_selector("text=entendi")
    body = json.dumps(calls[0], ensure_ascii=False)
    check("request tem o trecho selecionado e o documento marcado", "O limite de f(x)" in body and "integrais definidas" in body)
    check("request NÃO tem o resto do PDF nem o outro documento", "regra da cadeia" not in body and "variação instantânea" not in body)

    # ---- backup sem e com arquivos ----
    nav(page, "Configurações")
    with page.expect_download() as d1: page.get_by_role("button", name="Exportar backup").click()
    j1 = json.load(open(d1.value.path()))
    check("backup sem arquivos: texto extraído presente, originais ausentes", len(j1["data"]["docTexts"]) == 3 and j1["data"]["docFiles"] == [] and all(not x["hasOriginal"] for x in j1["data"]["documents"]))
    page.get_by_text("Incluir os arquivos originais").click()
    with page.expect_download() as d2: page.get_by_role("button", name="Exportar backup").click()
    j2 = json.load(open(d2.value.path()))
    check("backup com arquivos: originais em base64", len(j2["data"]["docFiles"]) == 3 and all(x["hasOriginal"] for x in j2["data"]["documents"]))
    check("backup nunca contém a chave de API", "sk-or-TESTE" not in json.dumps(j1) + json.dumps(j2))
    page.on("dialog", lambda dlg: dlg.accept())
    page.set_input_files("input[aria-label='Arquivo de backup']", d1.value.path())
    page.wait_for_selector("text=sem o arquivo original")
    check("importar backup sem arquivos avisa que os originais não voltaram", page.get_by_text("3 material(is) sem o arquivo original").count() == 1)
    nav(page, "Biblioteca")
    page.get_by_role("button", name=re.compile("apostila.pdf")).click()
    page.wait_for_selector("text=O arquivo original não está neste dispositivo")
    check("visualizador avisa original ausente e mantém o texto extraído", "regra da cadeia" in page.locator("pre[aria-label='Texto extraído do documento']").inner_text())
    page.keyboard.press("Escape")
    page.set_input_files("input[aria-label='Arquivo de backup']", d2.value.path()) if page.get_by_label("Arquivo de backup").count() else None

    # excluir material
    nav(page, "Configurações"); page.set_input_files("input[aria-label='Arquivo de backup']", d2.value.path()); page.wait_for_selector("text=Importado:")
    nav(page, "Biblioteca")
    page.get_by_role("button", name=re.compile("resumo.md")).click()
    page.get_by_role("button", name="Excluir material").click()
    page.wait_for_selector("section[aria-label='Arquivo original']", state="hidden")
    check("excluir remove o material da lista", page.locator("ul >> text=resumo.md").count() == 0 and page.locator("ul >> text=notas.txt").count() == 1)

    # ================= OFFLINE: importar PDF sem internet =================
    page.clock.uninstall() if hasattr(page.clock, "uninstall") else None
    b.close()
print(sum(R), "/", len(R))
