<div align="center">

<img src="assets/logo.png" alt="zJu4nn Hub" width="160" />

# zJu4nn Hub

**Launcher de jogos pra fãs do canal [zJu4nn](https://www.youtube.com/@zJu4nn)** — catálogo, biblioteca, conquistas e amigos, tudo num só lugar. ✨

[![Última versão](https://img.shields.io/github/v/release/zJu4nn-Hub/zjuannhub?style=for-the-badge&color=ff3d9a&labelColor=14091e)](https://github.com/zJu4nn-Hub/zjuannhub/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/zJu4nn-Hub/zjuannhub/total?style=for-the-badge&color=a04bff&labelColor=14091e)](https://github.com/zJu4nn-Hub/zjuannhub/releases)
[![License: GPL v3](https://img.shields.io/badge/license-GPL_3.0-2bd6e6?style=for-the-badge&labelColor=14091e)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows-10_+-0078d4?style=for-the-badge&logo=windows&labelColor=14091e)](https://github.com/zJu4nn-Hub/zjuannhub/releases/latest)

[**📥 Baixar última versão**](https://github.com/zJu4nn-Hub/zjuannhub/releases/latest) · [Reportar bug](https://github.com/zJu4nn-Hub/zjuannhub/issues) · [Sugerir feature](https://github.com/zJu4nn-Hub/zjuannhub/issues)

</div>

---

## ✨ Features

- 🎮 **Catálogo curado** com ~2.000 jogos
- 📚 **Biblioteca pessoal** com tracking de tempo de jogo, último acesso e tamanho em disco
- 🌊 **Downloads in-app** via WebTorrent + HTTP (Pixeldrain etc.)
- 📦 **Auto-extração** de `.zip` / `.rar` / `.7z` quando o download conclui
- 🎯 **Detect automático do `.exe`** após extração ou pasta da Steam
- 🏆 **Sistema de Conquistas** com 11+ formatos suportados (Goldberg, CODEX, OnlineFix, EMPRESS, RLD!, SKIDROW, …)
- 🔔 **Notificação flutuante** que aparece sobre jogos fullscreen quando uma conquista desbloqueia
- 👥 **Sistema de Amigos** com busca por @handle ou Discord ID, comparação de conquistas em tempo real
- 🔒 **Privacy toggle** — perfil público ou só pra amigos
- 🔑 **Login Discord** via OAuth (Supabase)
- ⚙️ **Auto-update** via GitHub Releases — instala atualizações sozinho

---

## 📥 Download

Pega a última versão na aba [**Releases**](https://github.com/zJu4nn-Hub/zjuannhub/releases/latest) e baixa o instalador. O app se atualiza sozinho a cada nova versão.

---

## 🛠️ Build from source

### Pré-requisitos

- **Node.js 20+**
- **Python 3.11** (3.12+ removeu `distutils` que algumas deps nativas ainda usam)
- **Windows 10+**

### Setup

```bash
git clone https://github.com/zJu4nn-Hub/zjuannhub.git
cd zjuannhub
npm install
```

### Configuração de fontes (opcional)

A feature de **adicionar jogos via Steam Tools** lê endpoints dum arquivo de configuração local. Pra habilitar:

```bash
cp electron/sources-config.example.json electron/sources-config.json
# edite com suas próprias fontes
```

Sem esse arquivo, todas as outras features (catálogo, downloads, biblioteca, conquistas, amigos) funcionam normalmente.

### Rodar em dev

```bash
npm run dev
```

### Buildar instalador

```bash
$env:GH_TOKEN = "seu_token_github"   # PowerShell — só pra publish
npm run release
```

Ou simplesmente faça `git tag v0.1.X && git push --tags` — o GitHub Actions builda e publica automaticamente.

---

## 🤝 Contribuindo

Feedback, bug reports e PRs são bem-vindos! Abra uma [issue](https://github.com/zJu4nn-Hub/zjuannhub/issues) descrevendo o problema ou sugestão.

---

## 📄 Licença

Distribuído sob a licença [GPL-3.0](LICENSE) — qualquer fork público também precisa ser GPL.

---

<div align="center">

Feito com 💜 pela comunidade do canal **[zJu4nn](https://www.youtube.com/@zJu4nn)**

</div>
