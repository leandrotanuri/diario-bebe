# Diário do Bebê — PWA

App instalável pra registrar **mamadas, trocas (xixi/coco) e sono** do bebê com um toque.
Sincroniza em tempo real entre celulares via **Firebase Firestore**, funciona **offline**
(Service Worker + cache do Firestore) e é **instalável** na tela inicial (PWA).

Feito pra ser **seu** — hospedado no seu GitHub Pages, sem depender de conta Claude.

---

## Arquivos

| Arquivo | O quê |
|---|---|
| `index.html` | O app inteiro (UI + lógica). |
| `firebase-config.js` | **Você preenche** com as chaves do seu projeto Firebase. |
| `manifest.webmanifest` | Config do PWA (nome, ícones, cor). |
| `sw.js` | Service Worker (offline + instalável). |
| `icons/` | Ícones do app (já gerados). |

---

## Passo 1 — Criar o projeto no Firebase (~5 min)

1. Acesse **https://console.firebase.google.com** e clique **Adicionar projeto**.
   Nome: `diario-bebe` (ou o que quiser). Pode **desativar o Google Analytics** (não precisa).
2. No menu esquerdo → **Criar** → **Firestore Database** → **Criar banco de dados**.
   - Escolha o modo **Produção** (as regras a gente cola no Passo 3).
   - Local: `southamerica-east1` (São Paulo).
3. Menu esquerdo → **Criar** → **Authentication** → **Vamos começar** →
   aba **Sign-in method** → habilite **Anônimo** → Salvar.
4. Registrar o app web: clique na engrenagem ⚙️ (**Configurações do projeto**) →
   role até **Seus apps** → clique no ícone **`</>` (Web)** → apelido `bebe` →
   **Registrar app**. Vai aparecer um bloco `const firebaseConfig = { ... }`.

## Passo 2 — Colar as chaves

Copie os valores do `firebaseConfig` que apareceu e cole em **`firebase-config.js`**.
> Essas chaves são **públicas** (ficam no navegador de qualquer visitante). Pode subir
> pro GitHub sem medo — a segurança fica nas **regras** do Passo 3.

**Me manda esse bloco aqui no chat que eu já preencho o arquivo pra você.**

## Passo 3 — Regras de segurança do Firestore

No Console → **Firestore Database** → aba **Regras** → cole isto → **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Só quem está autenticado (login anônimo do app) acessa,
    // e só dentro de uma "família" (o id secreto que vai no link).
    match /families/{fid}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Como funciona a privacidade: cada casal tem uma **família** com um `id` aleatório
que fica no link (`...#f=fam-xxxxxxxx`). Só quem tem o link entra naquela família.
Ninguém adivinha o id de outra família. (Dá pra deixar mais forte depois — ver "Próximos passos".)

## Passo 4 — Publicar no GitHub Pages

1. Crie um repositório em **github.com/leandrotanuri** (ex: `diario-bebe`), **público**.
2. Suba os arquivos desta pasta (via GitHub Desktop, ou:)

   ```bash
   cd "C:/Users/Leandro Tanuri/Downloads/baby-tracker"
   git init
   git add .
   git commit -m "feat: PWA diário do bebê"
   git branch -M main
   git remote add origin https://github.com/leandrotanuri/diario-bebe.git
   git push -u origin main
   ```

3. No repositório → **Settings** → **Pages** → em **Branch** escolha `main` / `/ (root)` → **Save**.
4. Em ~1 min o app fica em: **https://leandrotanuri.github.io/diario-bebe/**

## Passo 5 — Autorizar o domínio no Firebase Auth

No Console → **Authentication** → **Settings** → **Authorized domains** →
**Add domain** → `leandrotanuri.github.io`. (O `localhost` já vem liberado pra testar.)

---

## Como usar

- Abra o app → toque em **Mamou / Xixi / Coco / Sono**. O horário registra sozinho.
- **Mamou** e **Sono** são cronômetros: 1º toque inicia, 2º toque para e grava a **duração**.
- Toque em qualquer registro pra **corrigir horário, detalhar ou apagar**.
- **✎ Anotar** pro que é eventual (remédio, banho, febre…).
- **Data de nascimento** (toque na idade no topo): libera a **janela de sono** por idade.
- Card **Próximos**: mostra a **próxima soneca** (janela de sono, estilo Napper) e a
  **próxima mamada** (intervalo médio, ignorando a madrugada), ao vivo.
- Aba **Resumo** = contagens por período + **gráfico dos últimos 7 dias** (sono e mamadas/dia).
- Botão **🔊** = **ruído branco** (branco / rosa / marrom) com timer pra desligar sozinho.
- Botão **👥** = copia/compartilha o link da família pra mãe/pai abrir no celular dele.
- Botão **📲 Instalar** = adiciona à tela inicial (Android/Chrome; no iPhone use
  Safari → Compartilhar → "Adicionar à Tela de Início").

> ⚠️ A janela de sono é uma **referência** baseada na idade — cada bebê é único.
> Não substitui orientação do pediatra.

## Testar local (opcional, antes de subir)

PWA/Service Worker só rodam em `http`/`https`, não em `file://`. Rode um servidor:

```bash
cd "C:/Users/Leandro Tanuri/Downloads/baby-tracker"
python -m http.server 8000
```
Abra `http://localhost:8000`. Sem o Firebase configurado, ele roda em **modo offline**
(salva só no aparelho) — útil pra ver o visual antes de plugar o Firebase.

---

## Próximos passos (quando virar produto)

- **Segurança mais forte**: guardar a lista de membros por família e checar
  `request.auth.uid` nas regras (em vez de só "tem link").
- **Login real** (e-mail/Google) pra recuperar a conta em outro aparelho.
- **Múltiplos bebês** por conta.
- **Exportar PDF/planilha** pro pediatra.
- **Notificações** (lembrete da próxima mamada).
- Domínio próprio + tela de onboarding + assinatura.

---

## Mamei (beta) — `/beta/`

Redesenho novo rodando **em paralelo** em `mamei.com.br/beta/`, usando o **mesmo Firebase e a mesma família**
(o link `#f=fam-…` e o diário são os mesmos). O formato dos dados é compatível com o app atual e com o
servidor de lembretes: os tipos `feed/sleep/pee/poop/note/measure` continuam; só ganham campos novos
(lados E/D, ml, tipo de leite, extração, cor do cocô, perímetro cefálico…).

Para migrar de vez: copiar `beta/index.html` para a raiz, trocar `../` por `./` nos caminhos e unificar o `sw.js`.
