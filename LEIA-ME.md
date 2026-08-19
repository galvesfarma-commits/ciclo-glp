# Ciclo GLP — PWA (app web instalável)

Um único conjunto de arquivos estáticos que funciona no iPhone e no Android,
instala na tela inicial e roda offline. Sem loja, sem build, sem servidor.

## O que tem aqui
- `index.html` — página principal
- `app.compiled.js` — o app (já compilado; edite `app.js` e recompile se precisar)
- `app.js` — código-fonte (JSX), só para manutenção
- `sw.js` — service worker (offline + lembretes)
- `manifest.webmanifest` — define nome, ícone e modo standalone
- `vendor/` — React embutido (funciona offline, sem CDN)
- `icons/` — ícones do app

## Como testar no seu computador
Precisa ser servido por HTTP (não abra o arquivo direto — o service worker exige http/https):
```bash
cd ciclo-glp-pwa
python3 -m http.server 8000
```
Abra `http://localhost:8000` no navegador.

## Como colocar no ar (grátis)
Qualquer hospedagem de site estático serve. A exigência é **HTTPS** (obrigatório para PWA).

**Opção A — GitHub Pages**
1. Crie um repositório e suba esta pasta
2. Settings → Pages → Source: branch `main`, pasta root
3. A URL será `https://SEU-USUARIO.github.io/NOME-REPO/`

**Opção B — Netlify / Vercel / Cloudflare Pages**
Arraste a pasta na interface. Sai no ar em segundos, com HTTPS automático.

## Como instalar no celular

**iPhone (Safari):**
1. Abra a URL no **Safari** (tem que ser o Safari)
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**
3. Abra pelo ícone que apareceu. Pronto — vira app em tela cheia
4. Os lembretes só funcionam depois de instalado assim (limitação da Apple)

**Android (Chrome):**
1. Abra a URL no Chrome
2. Ele oferece "Instalar app" — ou menu ⋮ → **Instalar aplicativo**

## Sobre os lembretes
São **notificações locais**, agendadas pelo próprio aparelho — não há servidor.
- **Android:** funcionam bem.
- **iPhone:** funcionam a partir do iOS 16.4, **desde que o app esteja instalado na tela inicial**. Como o iOS não roda tarefas em segundo plano para PWA, o app reagenda os lembretes toda vez que é aberto. Na prática: abrir o app de tempos em tempos mantém os lembretes em dia. Para quem quiser algo infalível, o lembrete nativo do celular (app Relógio/Lembretes) é um reforço.

## Se quiser cobrar acesso
Como é um site, você controla o acesso como quiser: página de login, link privado, código de acesso, integração com um gateway de pagamento. Isso fica fora do app em si — posso ajudar a montar quando você decidir o modelo.

Lembrando as duas ressalvas de sempre, agora que entra a possibilidade de cobrar:
consulte seu CRF sobre publicar/comercializar conteúdo farmacêutico sob seu nome, e a
fronteira regulatória da Anvisa é interpretativa — vale uma conversa com advogado da área.

## Para editar o app depois
O código-fonte é `app.js`. Após alterar, recompile para `app.compiled.js`:
```bash
npx babel app.js --presets react -o app.compiled.js
```
(ou me mande a alteração que eu recompilo).
