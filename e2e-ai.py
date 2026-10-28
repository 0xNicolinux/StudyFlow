from playwright.sync_api import sync_playwright
import json
URL = "http://localhost:4176/"
R = []
def check(name, cond, extra=""):
    R.append(bool(cond)); print(("PASS" if cond else "FAIL"), name, extra)

def sse(*parts, error_after=None):
    body = "".join("data: " + json.dumps({"choices": [{"delta": {"content": p}}]}) + "\n\n" for p in parts)
    if error_after: body += "data: " + json.dumps({"error": {"message": "falhou"}}) + "\n\n"
    else: body += "data: [DONE]\n\n"
    return body

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    calls = []          # requests de chat ao OpenRouter
    mode = {"v": "ok"}  # comportamento do mock

    def chat_route(route):
        req = route.request
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        calls.append({"auth": req.headers.get("authorization"), "body": json.loads(req.post_data)})
        m = mode["v"]
        if m == "401": return route.fulfill(status=401, headers=CORS, body=json.dumps({"error": {"message": "bad key"}}))
        if m == "402": return route.fulfill(status=402, headers=CORS, body=json.dumps({"error": {"message": "no credits"}}))
        if m == "429": return route.fulfill(status=429, headers=CORS, body="{}")
        if m == "partial": return route.fulfill(status=200, headers={**CORS, "content-type": "text/event-stream"}, body=sse("Resposta pa", "rcial", error_after=True))
        return route.fulfill(status=200, headers={**CORS, "content-type": "text/event-stream"},
                             body=sse("Olá! ", "Veja:\n\n```python\nprint('ok')\n```\n\n**fim**"))
    page.route("https://openrouter.ai/api/v1/chat/completions", chat_route)
    page.route("https://openrouter.ai/api/v1/models", lambda r: r.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"data": [
        {"id": "x/pago", "pricing": {"prompt": "0.1", "completion": "0.1"}}, {"id": "x/gratis:free", "pricing": {"prompt": "0", "completion": "0"}}]})))

    page.goto(URL); page.wait_for_selector("text=Bem-vindo ao StudyFlow")

    # 1) sem chave: erro claro, rascunho preservado, nenhuma chamada
    page.get_by_label("Mensagem para a IA").fill("Pergunta sem chave"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Nenhuma chave de API configurada")
    check("sem chave: erro claro e nenhuma requisição", len(calls) == 0)
    check("sem chave: rascunho preservado", page.get_by_label("Mensagem para a IA").input_value() == "Pergunta sem chave")
    page.get_by_role("button", name="Abrir configurações de IA").click()

    # 2) configurar
    page.get_by_text("Inteligência artificial (opcional)").wait_for()
    check("aviso de risco da chave visível", page.get_by_text("em texto, neste navegador").count() == 1)
    page.get_by_placeholder("sk-or-…").fill("sk-or-TESTE-123")
    page.get_by_role("button", name="Carregar lista de modelos").click()
    page.wait_for_selector("select[aria-label='Modelos disponíveis']")
    opts = page.locator("select[aria-label='Modelos disponíveis'] option").all_inner_texts()
    check("lista só gratuitos por padrão", any("gratis" in o for o in opts) and not any("pago" in o for o in opts), str(opts))
    page.locator("select[aria-label='Modelos disponíveis']").select_option(label="x/gratis:free (gratuito)")
    page.get_by_role("button", name="Salvar configuração de IA").click()
    page.wait_for_selector("text=Configuração salva")

    # backup não contém a chave
    with page.expect_download() as d: page.get_by_role("button", name="Exportar backup").click()
    check("backup não contém a chave de API", "sk-or-TESTE" not in open(d.value.path()).read())

    # 3) disciplina + 2 anotações
    page.get_by_label("Nova disciplina").click(); page.get_by_placeholder("Ex.: Cálculo I").fill("Cálculo"); page.get_by_role("button", name="Salvar", exact=True).click()
    page.wait_for_selector("h1:has-text('Cálculo')")
    page.get_by_role("tab", name="Anotações").click()
    for title, body in (("Limites", "SEGREDO-LIMITES"), ("Derivadas", "SEGREDO-DERIVADAS")):
        page.get_by_role("button", name="Nova anotação").click()
        page.wait_for_function("document.querySelector(\"[aria-label='Título da anotação']\")?.value === 'Nova anotação'")
        page.get_by_label("Título da anotação").fill(title); page.get_by_label("Conteúdo da anotação").fill(body)
        page.wait_for_timeout(900)
        page.wait_for_selector("text=Salvo neste dispositivo")

    # contexto: só "Limites"
    page.get_by_role("button", name="Contexto").click()
    page.get_by_label("Anotação: Limites").check()
    page.get_by_label("Mensagem para a IA").fill("Explique limites"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Confirmar envio à IA")
    check("modal de confirmação antes de enviar; nada enviado ainda", len(calls) == 0)
    check("modal mostra destino e conteúdo selecionado", page.get_by_text("openrouter.ai").count() > 0 and page.get_by_text("Anotação: Limites").count() > 0)
    page.get_by_role("button", name="Enviar", exact=True).click()
    page.wait_for_selector("text=fim")
    check("uma requisição feita após confirmar", len(calls) == 1)
    body = json.dumps(calls[0]["body"], ensure_ascii=False)
    check("request contém a anotação selecionada", "SEGREDO-LIMITES" in body)
    check("request NÃO contém a anotação não selecionada", "SEGREDO-DERIVADAS" not in body)
    check("header Authorization correto e stream=true", calls[0]["auth"] == "Bearer sk-or-TESTE-123" and calls[0]["body"]["stream"] is True and calls[0]["body"]["model"] == "x/gratis:free")
    check("markdown renderizado (bloco de código e negrito)", page.locator(".md pre code").count() == 1 and page.locator(".md strong").count() >= 1)

    # 4) segunda mensagem sem contexto -> sem modal (consentimento já dado, sem itens)
    page.get_by_role("button", name="Contexto").click()
    page.get_by_text("Anotação: Limites").click()  # desmarca
    page.get_by_label("Mensagem para a IA").fill("Outra dúvida"); page.keyboard.press("Enter")
    page.wait_for_function("document.querySelectorAll('.md').length >= 2")
    check("sem contexto e com consentimento: envia sem modal", len(calls) == 2 and "SEGREDO" not in json.dumps(calls[1]["body"]))
    check("histórico é enviado na 2ª chamada", any(m["content"] == "Explique limites" or "Explique limites" in m["content"] for m in calls[1]["body"]["messages"] if m["role"] == "user"))

    # 5) erros
    page.get_by_role("button", name="Nova conversa").click()
    for m, text in (("401", "chave de API foi recusada"), ("402", "Créditos insuficientes"), ("429", "Limite de requisições")):
        mode["v"] = m
        page.get_by_label("Mensagem para a IA").fill(f"teste {m}"); page.keyboard.press("Enter")
        page.wait_for_selector(f"text={text}")
        check(f"erro {m} tratado", True)
        page.get_by_role("button", name="Dispensar").click()
    # retry funciona depois do 429
    mode["v"] = "429"; page.get_by_label("Mensagem para a IA").fill("retry"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Limite de requisições")
    n = len(calls); mode["v"] = "ok"
    page.get_by_role("button", name="Tentar novamente").click()
    page.wait_for_selector("text=fim")
    check("tentar novamente refaz a chamada sem duplicar a mensagem do usuário", len(calls) == n + 1 and page.get_by_text("retry", exact=True).count() == 1)

    # 6) falha no meio do stream
    page.get_by_role("button", name="Nova conversa").click(); mode["v"] = "partial"
    page.get_by_label("Mensagem para a IA").fill("parcial"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Resposta incompleta")
    check("resposta parcial preservada e marcada como incompleta", page.get_by_text("Resposta parcial").count() > 0)
    page.get_by_role("button", name="Dispensar").click()

    # 7) offline
    n = len(calls); mode["v"] = "ok"; ctx.set_offline(True)
    page.get_by_label("Mensagem para a IA").fill("offline"); page.keyboard.press("Enter")
    page.wait_for_selector("text=sem internet")
    check("offline: aviso claro e nenhuma requisição", len(calls) == n)
    ctx.set_offline(False)

    # 8) persistência e limpar histórico
    page.reload(); page.wait_for_selector("h1")
    page.get_by_label("Mensagem para a IA").fill("x"); page.keyboard.press("Enter")  # abre o chat
    page.wait_for_selector("select[aria-label='Conversas anteriores']")
    check("conversas persistem após recarregar", page.locator("select[aria-label='Conversas anteriores'] option").count() > 1)
    page.on("dialog", lambda dlg: dlg.accept())
    page.get_by_role("button", name="Limpar histórico").click()
    page.wait_for_function("document.querySelector(\"select[aria-label='Conversas anteriores']\") === null")
    check("limpar histórico apaga as conversas", True)

    # 9) remover chave
    page.get_by_role("button", name="Configurações", exact=True).click()
    page.get_by_role("button", name="Remover chave").click()
    page.wait_for_selector("text=Chave removida")
    page.get_by_label("Mensagem para a IA").fill("sem chave de novo"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Nenhuma chave de API configurada")
    check("remover chave volta a bloquear o envio", True)
    check("sem erros de página", not errs, str(errs[:3]))
    b.close()
print(sum(R), "/", len(R))
