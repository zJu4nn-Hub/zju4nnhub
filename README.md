# zJu4nn Hub

> App desktop tipo Hydra Launcher pra fãs do canal **[zJu4nn](https://www.youtube.com/@zJu4nn)** — catálogo de jogos, biblioteca pessoal, conquistas, amigos e tudo mais. ✨

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4)

---

## ✨ Features

- 🎮 **Catálogo** com curadoria de jogos
- 📚 **Biblioteca** com tracking de tempo de jogo, último acesso e tamanho em disco
- 🌊 **Downloads in-app** via WebTorrent + HTTP (Pixeldrain etc)
- 📦 **Auto-extração** de `.zip`/`.rar`/`.7z` quando o download conclui
- 🎯 **Detect automático do `.exe`** após extração
- 🏆 **Sistema de Conquistas** (achievements) com 11+ formatos suportados (Goldberg, CODEX, OnlineFix, EMPRESS, RLD!, SKIDROW, …)
- 🔔 **Notificação flutuante** quando desbloqueia conquista (overlay sobre jogos fullscreen)
- 👥 **Sistema de Amigos** com busca por @handle/Discord ID + comparação de conquistas em tempo real
- 🔒 **Privacy toggle** — perfil público ou só pra amigos
- 🔑 **Login via Discord OAuth** (Supabase)
- ⚙️ **Auto-update** via GitHub Releases

---

## 🚀 Download (usuário final)

Pega a última versão na aba **[Releases](../../releases)**. Baixa o `.exe` do instalador, executa e segue o assistente. O app se atualiza sozinho a cada nova versão.

---

## 🛠️ Build / Dev local

### Pré-requisitos

- **Node.js 20+**
- **Windows 10+** (única plataforma suportada por enquanto)

### Setup

```bash
git clone https://github.com/USERNAME/zjuannhub.git
cd zjuannhub
npm install
```

### Configuração de fontes (obrigatório pra Steam Tools)

O app baixa Lua/manifest de fontes externas configuráveis. Copie o exemplo e preencha com suas próprias fontes:

```bash
cp electron/sources-config.example.json electron/sources-config.json
# edite com seus endpoints
```

Sem esse arquivo configurado, a aba "Adicionar à Steam" fica desabilitada. As demais features (Catálogo, Downloads, Biblioteca, Conquistas, Amigos) funcionam normalmente.

### Rodar em dev

```bash
npm run dev
```

### Build de produção

```bash
npm run build
```

Gera o instalador NSIS em `dist/`.

### Release publicada (requer GH_TOKEN)

```bash
$env:GH_TOKEN = "seu_token_github"  # PowerShell
npm run release
```

Ou simplesmente faça `git tag v0.1.X && git push --tags` — o GitHub Actions builda e publica automaticamente.

---

## 📁 Estrutura

```
zjuannhub/
├── electron/        ← main process (Node)
├── renderer/        ← UI (HTML/CSS/JS vanilla)
├── assets/          ← icon, tray
├── scripts/         ← utilitários de build
└── electron-builder.yml
```

---

## 🤝 Contribuindo

Feedback, bug reports e PRs são bem-vindos! Abra uma [issue](../../issues) descrevendo o problema ou sugestão.

---

## 📄 Licença

[GPL-3.0](LICENSE) — qualquer fork público também precisa ser GPL.

---

> Feito com 💜 pela comunidade do canal **zJu4nn**.
