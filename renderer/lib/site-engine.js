/* =========================================================
   zJu4nn Tools — dados dos jogos + lógica do modal
   ========================================================= */

/**
 * Gera o tutorial Hypervisor com nomes de pasta e executável do jogo.
 * @param {string} folder    - nome da pasta de instalação do jogo (ex: "PRAGMATA")
 * @param {string} exe       - nome do executável (ex: "PRAGMATA.exe")
 * @param {string} [exeNote] - observação opcional sobre o executável
 */
function buildHypervisorTutorial(folder, exe, exeNote) {
  const exeLine = exeNote
    ? `Encontre o arquivo <code>${exe}</code>. <i>${exeNote}</i>`
    : `Encontre o arquivo <code>${exe}</code>.`;
  return [
    {
      title: "Passo 1 — Copiar os ficheiros do hypervisor (APENAS UMA VEZ)",
      body: [
        `Abra a pasta <code>${folder}-DenuvOwO\\DenuvOwO\\</code>`,
        `Copie TODO o conteúdo da pasta.`,
        `Cole na pasta <code>${folder}\\</code> (pasta do jogo).`,
        `Clique em "Substituir" quando solicitado.`,
        `<i>Este passo só precisa ser feito UMA VEZ após a instalação.</i>`
      ]
    },
    {
      title: "Passo 2 — Executar o VBS.cmd (TODAS AS VEZES QUE QUISER JOGAR)",
      body: [
        `<i>Você deve fazer isso TODAS AS VEZES após um desligamento ou reinício normal do PC.</i>`,
        `Vá para a pasta <code>${folder}-DenuvOwO\\</code>.`,
        `Clique com o botão direito em <code>VBS.cmd</code> → "Executar como administrador".`,
        `Na janela de comando, pressione <b>1</b> (Ativar/Instalar bypass).`,
        `Aguarde a conclusão — seu PC será reiniciado automaticamente.`
      ]
    },
    {
      title: "Passo 3 — Tela azul → Pressione F7 (TODAS AS VEZES)",
      body: [
        `<i>ISSO É NORMAL! Acontece após a reinicialização do Passo 2.</i>`,
        `Após a reinicialização, você verá uma tela azul (Recuperação do Windows / Configurações de inicialização).`,
        `Pressione a tecla <b>F7</b> imediatamente ao ver essa tela.`,
        `Isso seleciona: <b>"Desativar verificação de assinatura de driver"</b>.`,
        `Seu PC reiniciará novamente e iniciará o Windows normalmente.`,
        `<b>O bypass agora está ativo — você pode iniciar o jogo!</b>`
      ]
    },
    {
      title: "Passo 4 — Inicie o jogo",
      body: [
        `Assim que o Windows carregar, abra o Explorador de Arquivos.`,
        `Vá para: <code>${folder}\\</code> (pasta principal do jogo).`,
        exeLine,
        `Clique com o botão direito em <code>${exe}</code> → "Executar como administrador".`,
        `O jogo será iniciado. Divirta-se! 💖`
      ]
    }
  ];
}

// =============== JOGOS HYPERVISOR ===============
// Ordenados por data de lançamento (mais recentes primeiro)
const HYPER_GAMES = [
  {
    title: "PRAGMATA",
    folder: "PRAGMATA",
    exe: "PRAGMATA.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3357650/e32e168b25ed68a0cf6264c220c07e96c2abfb56/header.jpg?t=1776235822",
    summary: "Aventura de ficção científica única da Capcom. Acompanhe Hugh e a androide Diana enquanto exploram instalações lunares dominadas por uma IA descontrolada em busca de um caminho para a Terra.",
    fix: "https://buzzheavier.com/rkgntck0s0y8",
    game: null
  },
  {
    title: "City Transport Simulator 2026",
    folder: "City Transport Simulator 2026",
    exe: "CityTransportSim.exe",
    exeNote: "Por usar Unreal Engine, o executável de processamento real fica em Binaries/Win64/CityTransportSim-Win64-Shipping.exe — para perfis de placa de vídeo ou software de terceiros, use o -Shipping.exe.",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4148530/a25e6c79fe2ed7074e15d0fa0c9f61f87c05d6af/header.jpg?t=1776239195",
    summary: "Simulador imersivo de transporte público urbano com ônibus e bondes em uma cidade dinâmica que reage às suas decisões. Próxima geração da simulação urbana.",
    fix: "https://buzzheavier.com/r0z2m87f9hzy",
    game: "https://fileq.net/u8uq6ewggxkj.html"
  },
  {
    title: "WWE 2K26",
    folder: "WWE 2K26",
    exe: "WWE2K26_x64.exe",
    exeNote: "Não confunda com o crashpad_handler.exe que pode aparecer na mesma pasta — o motor principal é o WWE2K26_x64.exe.",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3717070/6e590c37107f7306ab9e42cc07d2aa92327625d1/header.jpg?t=1776272339",
    summary: "O show nunca para! Entre no 2K Showcase do CM Punk, domine com mais de 400 Superstars e Lendas, e libere o caos com novos tipos de luta.",
    fix: "https://vik1ngfile.site/f/Tk8kEl6esD",
    game: null
  },
  {
    title: "Crimson Desert",
    folder: "Crimson Desert",
    exe: "CrimsonDesert.exe",
    exeNote: "O executável fica em bin64\\CrimsonDesert.exe dentro da pasta do jogo.",
    img: "https://i.imgur.com/F8iPLI9.png",
    summary: "Aventura de mundo aberto épica da Pearl Abyss. Embarque na jornada dos Greymanes em um vasto continente cheio de batalhas, mistérios e personagens marcantes.",
    fix: "https://vik1ngfile.site/f/3cl4uanwww",
    game: null,
    tutorial: [
      {
        title: "Passo 1 — Copiar os ficheiros do hypervisor (APENAS UMA VEZ)",
        body: [
          `Abra a pasta <code>Crimson\\DenuvOwO\\</code> (extraída do <code>Crimson.zip</code>).`,
          `Copie TODO o conteúdo da pasta.`,
          `Cole na pasta <code>Crimson Desert\\</code> (pasta do jogo).`,
          `Clique em "Substituir" quando solicitado.`,
          `<i>Este passo só precisa ser feito UMA VEZ após a instalação.</i>`
        ]
      },
      {
        title: "Passo 2 — Executar o VBS.cmd (TODAS AS VEZES QUE QUISER JOGAR)",
        body: [
          `<i>Você deve fazer isso TODAS AS VEZES após um desligamento ou reinício normal do PC.</i>`,
          `Vá para a pasta <code>Crimson\\</code>.`,
          `Clique com o botão direito em <code>VBS.cmd</code> → "Executar como administrador".`,
          `Na janela de comando, pressione <b>1</b> (Ativar/Instalar bypass).`,
          `Aguarde a conclusão — seu PC será reiniciado automaticamente.`
        ]
      },
      {
        title: "Passo 3 — Tela azul → Pressione F7 (TODAS AS VEZES)",
        body: [
          `<i>ISSO É NORMAL! Acontece após a reinicialização do Passo 2.</i>`,
          `Após a reinicialização, você verá uma tela azul (Recuperação do Windows / Configurações de inicialização).`,
          `Pressione a tecla <b>F7</b> imediatamente ao ver essa tela.`,
          `Isso seleciona: <b>"Desativar verificação de assinatura de driver"</b>.`,
          `Seu PC reiniciará novamente e iniciará o Windows normalmente.`,
          `<b>O bypass agora está ativo — você pode iniciar o jogo!</b>`
        ]
      },
      {
        title: "Passo 4 — Inicie o jogo",
        body: [
          `Assim que o Windows carregar, abra o Explorador de Arquivos.`,
          `Vá para: <code>Crimson Desert\\bin64\\</code>.`,
          `Encontre o arquivo <code>CrimsonDesert.exe</code>.`,
          `Clique com o botão direito em <code>CrimsonDesert.exe</code> → "Executar como administrador".`,
          `O jogo será iniciado. Divirta-se! 💖`
        ]
      }
    ]
  },
  {
    title: "Resident Evil Requiem",
    folder: "Resident Evil Requiem",
    exe: "re9.exe",
    img: "https://i.imgur.com/UhZSRnm.png",
    summary: "Nono capítulo principal da série Resident Evil. Sobrevivência em primeira e terceira pessoa pela Capcom — terror, mistério e ação em uma nova história aterrorizante.",
    fix: "https://buzzheavier.com/w1n0m2wdn1gl",
    game: null,
    tutorial: [
      {
        title: "Passo 1 — Baixar a correção",
        body: [
          `Clique no botão <b>"Baixar Correção"</b> abaixo.`,
          `Aguarde o download terminar (servidor: BuzzHeavier).`
        ]
      },
      {
        title: "Passo 2 — Extrair o arquivo",
        body: [
          `Extraia o arquivo baixado usando WinRAR ou 7-Zip.`,
          `<i>Recomenda-se desativar temporariamente o antivírus, pois ele pode dar falso-positivo.</i>`
        ]
      },
      {
        title: "Passo 3 — Copiar para a pasta do jogo",
        body: [
          `Abra a pasta extraída.`,
          `Mova/copie <b>todos os arquivos</b> de dentro dela para a pasta raiz do jogo (<code>Resident Evil Requiem\\</code>).`,
          `Quando aparecer a janela perguntando, clique em <b>"Substituir"</b> para sobrescrever tudo.`
        ]
      },
      {
        title: "Passo 4 — Jogar",
        body: [
          `Pronto! A correção já está aplicada.`,
          `Abra o jogo normalmente e divirta-se! 💖`
        ]
      }
    ]
  },
  {
    title: "Anno 117: Pax Romana",
    folder: "Anno 117 Pax Romana",
    exe: "Anno117.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3274580/header.jpg",
    summary: "Construa um vasto império no auge de Roma. Lide com cidadãos, comércio, política e guerra na nova entrega da consagrada série Anno. ⚠️ Senha do download: cs.rin.ru",
    fix: "https://buzzheavier.com/i69vhrp246a5",
    game: null
  },
  {
    title: "EA SPORTS FC™ 26",
    folder: "EA SPORTS FC 26",
    exe: "FC26.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3405690/2d96aa1b06e453cd62dae9029d412f19e61932c3/header.jpg?t=1777414590",
    summary: "Sucessor do FIFA da EA. Authentic football experience com novidades táticas, modos Career e Ultimate Team renovados.",
    fix: "https://vikingfile.com/f/3jJPJ0fpCg",
    game: null
  },
  {
    title: "NBA 2K26",
    folder: "NBA 2K26",
    exe: "NBA2K26.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3472040/bcb5cbbcf26ab63fbcd228a6c62618828f6a7fda/header_alt_assets_4.jpg?t=1776196566",
    summary: "Mais nova entrada da franquia da NBA 2K. Tecnologia ProPLAY™ aprimorada, modos MyCAREER, MyTEAM e The W com novas mecânicas.",
    fix: "https://buzzheavier.com/yjql7jhl666m",
    game: null
  },
  {
    title: "Sonic Racing: CrossWorlds",
    folder: "Sonic Racing CrossWorlds",
    exe: "SonicRacingCrossWorlds.exe",
    exeNote: "Por usar Unreal Engine, o binário principal de envio fica em Binaries/Win64/SonicRacingCrossWorldsSteam.exe — para configurar drivers ou software de terceiros, use o -Shipping.exe.",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2486820/cbf30ec3d4b30a85e8f84b3d8bf262cf46acd420/header_alt_assets_4.jpg?t=1776993784",
    summary: "Acelere por terra, ar, mar, espaço e tempo. Use os Travel Rings para viajar entre dimensões com surpresas a cada curva.",
    fix: "https://vik1ngfile.site/f/Ny2RDMhjPP",
    game: "https://vik1ngfile.site/f/M4fGYZ6o8P"
  },
  {
    title: "Stellar Blade",
    folder: "Stellar Blade",
    exe: "SB-Win64-Shipping.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3489700/header.jpg?t=1776466244",
    summary: "Salve a humanidade da extinção neste jogo de ação. Combates alucinantes e uma narrativa cheia de reviravoltas enquanto desvenda os mistérios da queda da Terra.",
    fix: "https://buzzheavier.com/x0aokbw3je52",
    game: "https://vik1ngfile.site/f/mv2T8bO9oi"
  },
  {
    title: "Khazan: The First Berserker",
    folder: "The First Berserker Khazan",
    exe: "Khazan-Win64-Shipping.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2680010/header.jpg?t=1765255716",
    summary: "RPG de ação hardcore. Você assume o papel de Khazan, o grande general do Império Pell Los, que venceu a morte e parte em busca de vingança contra os responsáveis por sua queda.",
    fix: "https://buzzheavier.com/3k8ppdpz07jp",
    game: null
  },
  {
    title: "Assassin's Creed Shadows",
    folder: "Assassin's Creed Shadows",
    exe: "ACShadows.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3159330/header.jpg?t=1775589420",
    summary: "Viva uma história épica ambientada no Japão feudal. Torne-se uma assassina shinobi letal e um poderoso samurai lendário em um mundo aberto maravilhoso e caótico.",
    fix: "https://buzzheavier.com/03slu3o6yid8",
    game: null
  },
  {
    title: "Monster Hunter Wilds",
    folder: "Monster Hunter Wilds",
    exe: "MonsterHunterWilds.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2246340/header.jpg",
    summary: "A nova evolução da série Monster Hunter da Capcom. Explore vastos ambientes selvagens, cace criaturas colossais e descubra os mistérios de um mundo em constante mudança.",
    fix: "https://vikingfile.com/f/Byuxpbq7v3",
    game: null
  },
  {
    title: "Avatar: Frontiers of Pandora",
    folder: "Avatar Frontiers of Pandora",
    exe: "Avatar.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2840770/header.jpg",
    summary: "Explore Pandora em primeira pessoa como um Na'vi. Aventura em mundo aberto da Ubisoft baseada no universo de Avatar, com lutas pela liberdade contra a RDA.",
    fix: "https://vikingfile.com/f/s6JgPmzOqn",
    game: null
  },
  {
    title: "NBA 2K25",
    folder: "NBA 2K25",
    exe: "NBA2K25.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2878980/header.jpg?t=1754665445",
    summary: "Domine em todas as quadras com a Tecnologia ProPLAY™. Construa seu legado nos modos MyCAREER, MyTEAM, MyNBA e The W.",
    fix: "https://buzzheavier.com/zafyx3ykl3j3",
    game: "https://fileq.net/li3guvs67ywu.html"
  },
  {
    title: "F1® 24",
    folder: "F1 24",
    exe: "F1_24.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2488620/header.jpg?t=1748912330",
    summary: "Junte-se à grelha de partida e seja Um dos 20. Conduza como os melhores no jogo oficial do FIA Formula One World Championship™ 2024.",
    fix: "https://buzzheavier.com/w6cd5wjuuv93",
    game: "https://fileq.net/8o2s4f9hzry7.html"
  },
  {
    title: "TopSpin 2K25",
    folder: "TopSpin 2K25",
    exe: "Topspin2k25.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1785650/header.jpg?t=1739858016",
    summary: "Simulador de tênis premium com física realista e jogabilidade baseada em habilidades. Construa um MyPLAYER ou jogue como Roger Federer e Serena Williams.",
    fix: "https://buzzheavier.com/8lkf2lox3lrj",
    game: "https://fileq.net/4jj8pxtcidl1.html"
  },
  {
    title: "Persona 3 Reload",
    folder: "Persona 3 Reload",
    exe: "P3R.exe",
    exeNote: "Por usar Unreal Engine, o executável real fica em Binaries/Win64/P3R-Win64-Shipping.exe.",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2161700/header.jpg",
    summary: "Remake completo do clássico JRPG da Atlus. Acompanhe um grupo de estudantes que lutam contra Sombras durante a Hora Sombria, com gráficos e jogabilidade modernizados.",
    fix: "https://vikingfile.com/f/yi4p5VeX7f",
    game: null
  },
  {
    title: "FM 2024 (Football Manager 2024)",
    folder: "Football Manager 2024",
    exe: "fm.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2252570/header.jpg?t=1763646323",
    summary: "Construa uma equipa de classe mundial pronta para dominar todos os rivais nas competições futebolísticas mais prestigiosas. A perseguição da perfeição não termina.",
    fix: "https://buzzheavier.com/r0mtwgys4ya6",
    game: "https://fileq.net/xk3hutn81kqi.html"
  },
  {
    title: "EA SPORTS™ WRC",
    folder: "EA SPORTS WRC",
    exe: "WRC.exe",
    exeNote: "Por usar Unreal Engine, o executável real fica em Binaries/Win64/WRC-Win64-Shipping.exe.",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1849250/header.jpg",
    summary: "O simulador oficial do FIA World Rally Championship. Conduza pelos terrenos mais desafiadores do mundo com física avançada e modo Builder para criar seu próprio carro de rali.",
    fix: "https://vikingfile.com/f/Ocb2KN8ODW",
    game: null
  },
  {
    title: "Mortal Kombat 1",
    folder: "Mortal Kombat 1",
    exe: "MK12.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1971870/header.jpg?t=1750176505",
    summary: "Descubra um Universo de Mortal Kombat™ renascido criado pelo Liu Kang Deus do Fogo. Um novo sistema de combate, modos de jogo e fatalities marcam o início desta era.",
    fix: "https://vik1ngfile.site/f/gQ4uaP5xwo",
    game: null
  },
  {
    title: "NBA 2K24",
    folder: "NBA 2K24",
    exe: "NBA2K24.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2338770/header.jpg?t=1761842158",
    summary: "Edição clássica do simulador da NBA. ⚠️ Os servidores online foram desligados em 31/12/2025 — funções multijogador não estão mais disponíveis. O modo offline continua funcional.",
    fix: "https://buzzheavier.com/gpfparvup4lj",
    game: "https://fileq.net/x093y5dj9yqd.html"
  },
  {
    title: "F1® Manager 2023",
    folder: "F1 Manager 2023",
    exe: "F1Manager23.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2287220/header.jpg",
    summary: "Assuma o controle de uma equipe oficial da F1 e gerencie cada detalhe — pilotos, estratégia, P&D e finanças — para lutar pelo título mundial.",
    fix: "https://buzzheavier.com/xf019dwfx69n",
    game: null
  },
  {
    title: "F1® 23",
    folder: "F1 23",
    exe: "F1_23.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2108330/header.jpg?t=1743526253",
    summary: "Jogo oficial do FIA Formula One World Championship™ 2023. Inclui um novo capítulo do modo história Braking Point com drama em alta velocidade e rivalidades acaloradas.",
    fix: "https://buzzheavier.com/be3so3p947md",
    game: "https://fileq.net/r4kowfd71yfn.html"
  },
  {
    title: "Hogwarts Legacy",
    folder: "Hogwarts Legacy",
    exe: "HogwartsLegacy.exe",
    exeNote: "Por usar Unreal Engine, o executável real fica em Phoenix/Binaries/Win64/HogwartsLegacy.exe.",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/990080/header.jpg",
    summary: "RPG de mundo aberto ambientado no universo de Harry Potter no século XIX. Frequente Hogwarts, aprenda feitiços e descubra um mistério antigo no mundo bruxo.",
    fix: "https://buzzheavier.com/vqglbkemwnwc",
    game: null
  },
  {
    title: "Marvel's Midnight Suns",
    folder: "Marvels Midnight Suns",
    exe: "MidnightSuns.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/368260/header.jpg",
    summary: "RPG tático da Firaxis (criadores de XCOM). Lidere uma equipe de heróis Marvel, incluindo o Caçador, contra forças sombrenas em batalhas baseadas em cartas.",
    fix: "https://buzzheavier.com/t1vsmw5l2pll",
    game: null
  },
  {
    title: "Madden NFL 23",
    folder: "Madden NFL 23",
    exe: "Madden23.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1760250/header.jpg",
    summary: "Simulador oficial da NFL pela EA. Modo Franchise renovado, jogabilidade aprimorada e tributo a John Madden, lenda do esporte e da franquia.",
    fix: "https://vikingfile.com/f/L1yufVT08f",
    game: null
  },
  {
    title: "Far Cry® 6",
    folder: "Far Cry 6",
    exe: "FarCry6.exe",
    img: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2369390/header.jpg?t=1758656170",
    summary: "Mergulhe num mundo de adrenalina no meio de uma revolução de guerrilha moderna. Paisagens deslumbrantes, tiroteios viscerais e jogabilidade diversificada em Yara.",
    fix: "https://vikingfile.com/f/kF1E6XeZ6f",
    game: "https://fileq.net/4nr3hzejy1qg.html"
  },
  {
    title: "Madden NFL 21",
    folder: "Madden NFL 21",
    exe: "Madden21.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1239520/header.jpg",
    summary: "Simulador oficial da NFL pela EA. Conta com o modo Face of the Franchise: Rise to Fame, novas mecânicas de skill stick e atualizações para uma temporada NFL imersiva.",
    fix: "https://vikingfile.com/f/FFv2OfeRwo",
    game: null
  },
  {
    title: "Planet Zoo",
    folder: "Planet Zoo",
    exe: "PlanetZoo.exe",
    img: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/703080/header.jpg?t=1765896213",
    summary: "Construa um mundo para a vida selvagem. Dos criadores de Planet Coaster e Zoo Tycoon vem o simulador definitivo de zoológico, com habitats detalhados e animais autênticos.",
    fix: "https://vik1ngfile.site/f/PI3LLkKCHP",
    game: "https://fileq.net/bxl1vk4y5rm9.html"
  }
];

// =============== JOGOS VERDES ===============
// Catálogo é carregado de greenGames.json (extraído do davidkazumisource.com)
let GREEN_GAMES = [];

// Padrões "em alta" baseados no Top 50 mais vendidos do Steam Brasil
// (https://store.steampowered.com/charts/topselling/BR)
// Usa word boundaries (\b) pra evitar false positives tipo "sims" → "Simulator"
const HOT_PATTERNS = [
  // FPS / Shooters
  /counter[- ]?strike|\bcs ?(2|go)\b/i,         // Counter-Strike 2
  /\bbattlefield\b/i,                           // Battlefield 6, 4, 1, V
  /call of duty|\bwarzone\b/i,                  // Call of Duty: Warzone
  /marvel rivals/i,                             // Marvel Rivals
  /overwatch/i,                                 // Overwatch
  /\bpubg\b|battlegrounds/i,                    // PUBG: BATTLEGROUNDS
  /\barc raiders\b/i,                           // ARC Raiders
  /war thunder/i,                               // War Thunder
  /\bfar far west\b/i,                          // Far Far West

  // Esportes
  /ea sports fc|\bfifa\b/i,                     // EA SPORTS FC 26
  /\befootball\b/i,                             // eFootball
  /\bf1[\s_]?2[3-9]\b/i,                        // F1 25

  // Open-world / Sandbox
  /grand theft auto|\bgta\b/i,                  // Grand Theft Auto V Enhanced
  /cyberpunk|phantom liberty/i,                 // Cyberpunk 2077 + Phantom Liberty
  /\bwitcher\b/i,                               // The Witcher 3
  /forza horizon/i,                             // Forza Horizon 6
  /\brust\b/i,                                  // Rust
  /enshrouded/i,                                // Enshrouded
  /pacific drive/i,                             // Pacific Drive
  /crimson desert/i,                            // Crimson Desert
  /euro truck simulator/i,                      // Euro Truck Simulator 2

  // FromSoft / Souls-like
  /elden ring/i,                                // ELDEN RING

  // RPG / MMO / Action
  /\bdiablo\b/i,                                // Diablo IV
  /baldur'?s gate/i,                            // Baldur's Gate 3
  /black desert/i,                              // Black Desert
  /\bwarframe\b/i,                              // Warframe

  // Estratégia / Sim
  /heroes of might (and|&) magic/i,             // Heroes of Might and Magic: Olden Era
  /\bvictoria ?3\b/i,                           // Victoria 3
  /cities[: ]?skylines/i,                       // Cities: Skylines II / I
  /\bstellaris\b/i,                             // Stellaris
  /hearts of iron/i,                            // Hearts of Iron IV
  /the sims/i,                                  // The Sims 4 (cuidado: não /sims/ solto)

  // Multiplayer / Co-op
  /dead by daylight/i,                          // Dead by Daylight
  /\bdota ?2\b/i,                               // Dota 2
  /split fiction/i,                             // Split Fiction
  /overcooked/i,                                // Overcooked! 2

  // Capcom / Fighting
  /\bpragmata\b/i,                              // PRAGMATA
  /street fighter/i,                            // Street Fighter 6

  // Outros do top
  /seven deadly sins/i,                         // The Seven Deadly Sins: Origin
  /grandchase/i,                                // GrandChase
  /where winds meet/i,                          // Where Winds Meet
  /invincible vs/i,                             // Invincible VS
  /little nightmares/i,                         // Little Nightmares II
  /\bwindrose\b/i,                              // Windrose
  /\bpratfall\b/i                               // Pratfall
];

function isHotGame(name) {
  return HOT_PATTERNS.some(p => p.test(name));
}

/* ============== RENDER DOS CARDS ============== */
function renderHyperCard(g) {
  return `
    <article class="game-card" data-type="hyper" data-index="${g.__i}">
      <div class="cover-wrap">
        <img src="${g.img}" alt="${g.title}" loading="lazy" />
        <div class="cover-fade"></div>
      </div>
      <div class="info">
        <h3>${g.title}</h3>
        <span class="pill">HYPERVISOR</span>
      </div>
    </article>`;
}

// Normaliza estrutura de links pra sempre ser array {u,x,s}
function getLinks(g) {
  if (Array.isArray(g.l)) return g.l;
  // Backward compat: formato antigo {l:"url", x:0|1}
  return [{ u: g.l || "", x: g.x ? 1 : 0, s: detectSourceFromUrl(g.l) }];
}

function detectSourceFromUrl(url) {
  if (!url) return "Servidor";
  if (url.startsWith("magnet:")) return "Torrent";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const map = {
      "pixeldrain.com": "Pixeldrain", "gofile.io": "Gofile",
      "buzzheavier.com": "Buzzheavier", "mediafire.com": "MediaFire",
      "mega.nz": "Mega", "1fichier.com": "1Fichier",
      "krakenfiles.com": "KrakenFiles", "drive.google.com": "Google Drive",
    };
    return map[host] || host;
  } catch { return "Servidor"; }
}

function renderGreenCard(g) {
  const links = getLinks(g);
  const first = links[0] || { x: 0 };
  const typeText = first.x ? "TORRENT" : "DIRETO";
  const typeCls  = first.x ? "torrent" : "direct";
  // Marca como "em alta" os jogos que estão no top 50 do Steam BR
  const rank = g.__rank ?? (g.__rank = steamRank(g.n));
  const hot = rank < 50 ? `<span class="hot-badge">🔥 EM ALTA</span>` : "";
  const online = g.o ? `<span class="online-badge">🌐 ONLINE</span>` : "";
  const multi = links.length > 1
    ? `<span class="multi-badge">📡 ${links.length} servidores</span>` : "";
  const edition = g.e ? `<span class="edition-badge">${g.e}</span>` : "";
  return `
    <article class="game-card green-card" data-index="${g.__i}">
      <div class="cover-wrap">
        <span class="type-badge ${typeCls}">${typeText}</span>
        ${online}
        ${multi}
        ${hot}
        ${edition}
        <img src="${g.i}" alt="${g.n}" loading="lazy" />
        <div class="cover-fade"></div>
      </div>
      <div class="info">
        <h3>${g.n}</h3>
        <span class="pill pink">VERDE</span>
      </div>
    </article>`;
}

/* ============== HYPER GRID ============== */
function buildHyperGrid() {
  const hyperGrid = document.getElementById("hyper-grid");
  HYPER_GAMES.forEach((g, i) => (g.__i = i));
  hyperGrid.innerHTML = HYPER_GAMES.map(renderHyperCard).join("");
  const stat = document.getElementById("stat-hyper");
  if (stat) stat.textContent = HYPER_GAMES.length;
}

/* ============== GREEN GAMES — STATE & RENDER ============== */
const GREEN_PAGE_SIZE = 21;
const greenState = {
  search: "",
  genre: null,        // null = todos (padrão)
  online: false,      // true = só jogos com tag online
  sort: "popular",    // "popular" (Steam top) ou "az" (A-Z)
  page: 1
};

// Normaliza um título pra comparação (lowercase, sem trademarks/acentos)
function normTitle(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .replace(/[\s\-:_–—]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Calcula rank de popularidade do jogo (0 = mais popular, Infinity = sem match)
// Usa window.STEAM_TOPS (top sellers do Steam Brasil).
// Match é estrito: exato OU prefix com boundary (catalog "GTA V Enhanced" casa com "GTA V",
// mas "Hooked on You: Dead by Daylight Dating Sim" NÃO casa com "Dead by Daylight").
function steamRank(name) {
  const tops = window.STEAM_TOPS;
  if (!tops || !tops.length) return Infinity;
  const n = normTitle(name);
  // 1ª passada: match exato (prioridade)
  for (let i = 0; i < tops.length; i++) {
    if (n === tops[i]) return i;
  }
  // 2ª passada: prefix com boundary (espaço após o título Steam)
  // Ex: "cyberpunk 2077 phantom liberty" começa com "cyberpunk 2077 "
  // Ex: "grand theft auto v enhanced" começa com "grand theft auto v "
  for (let i = 0; i < tops.length; i++) {
    const t = tops[i];
    if (n.startsWith(t + " ") || t.startsWith(n + " ")) return i;
  }
  return Infinity;
}

function getGreenFilteredList() {
  const q = greenState.search.toLowerCase().trim();
  const filtered = GREEN_GAMES.filter(g => {
    if (q && !g.n.toLowerCase().includes(q)) return false;
    if (greenState.genre && !(g.t || []).includes(greenState.genre)) return false;
    if (greenState.online && g.o !== 1) return false;
    return true;
  });
  if (greenState.sort === "az") {
    // Ordena alfabeticamente (case-insensitive, com locale pt-BR)
    return filtered.sort((a, b) =>
      a.n.localeCompare(b.n, "pt-BR", { sensitivity: "base" })
    );
  }
  // Padrão: ordena por rank do Steam (top sellers BR)
  return filtered.sort((a, b) => {
    const ra = a.__rank ?? (a.__rank = steamRank(a.n));
    const rb = b.__rank ?? (b.__rank = steamRank(b.n));
    if (ra !== rb) return ra - rb;
    return (a.__orig ?? 0) - (b.__orig ?? 0);
  });
}

function renderGreenSection() {
  const grid = document.getElementById("green-grid");
  const countEl = document.getElementById("green-count");
  const pagEl = document.getElementById("green-pagination");

  if (!GREEN_GAMES.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Catálogo não carregado</h3>
        <p>Coloque o arquivo <code>greenGames.json</code> na pasta do site.</p>
      </div>`;
    countEl.textContent = "— jogos";
    pagEl.innerHTML = "";
    return;
  }

  const filtered = getGreenFilteredList();
  const totalPages = Math.max(1, Math.ceil(filtered.length / GREEN_PAGE_SIZE));
  if (greenState.page > totalPages) greenState.page = totalPages;
  const start = (greenState.page - 1) * GREEN_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + GREEN_PAGE_SIZE);

  const plural = filtered.length === 1 ? "" : "s";
  countEl.innerHTML = `<b>${filtered.length}</b> jogo${plural} encontrado${plural}`;

  if (!pageItems.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Nenhum jogo encontrado</h3>
        <p>Tente outra busca ou remova os filtros.</p>
      </div>`;
    pagEl.innerHTML = "";
    return;
  }

  // Atribui index correto (no array original) pra cada item da página
  pageItems.forEach(g => { g.__i = GREEN_GAMES.indexOf(g); });
  grid.innerHTML = pageItems.map(renderGreenCard).join("");

  // Paginação
  pagEl.innerHTML = renderPagination(greenState.page, totalPages);
}

function renderPagination(current, total) {
  if (total <= 1) return "";
  const btns = [];
  btns.push(`<button class="page-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}>‹</button>`);

  const push = (p) => btns.push(`<button class="page-btn ${p === current ? "active" : ""}" data-page="${p}">${p}</button>`);
  const dots = () => btns.push(`<button class="page-btn page-dots-btn" data-action="jump" title="Ir para página específica">…</button>`);

  if (total <= 7) {
    for (let p = 1; p <= total; p++) push(p);
  } else {
    push(1);
    if (current > 4) dots();
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) push(p);
    if (current < total - 3) dots();
    push(total);
  }

  btns.push(`<button class="page-btn" data-page="${current + 1}" ${current === total ? "disabled" : ""}>›</button>`);
  return btns.join("");
}

/* ============== FILTER CHIPS ============== */
// Lista fixa de gêneros que aparecem como chips (na ordem)
const GREEN_GENRES = [
  "Ação",
  "Indie",
  "Aventura",
  "Simulação",
  "RPG",
  "Estratégia",
  "Casual",
  "Corridas",
  "Utilidades"
];

function buildGreenFilters() {
  if (!GREEN_GAMES.length) return;
  const container = document.getElementById("green-filters");
  const todosActive = !greenState.genre ? " active" : "";
  let html = `<button class="chip${todosActive}" data-genre="">Todos</button>`;
  GREEN_GENRES.forEach(g => {
    const active = greenState.genre === g ? " active" : "";
    html += `<button class="chip${active}" data-genre="${g}">${g}</button>`;
  });
  // Chip de filtro Online (toggle independente)
  const onlineActive = greenState.online ? " active" : "";
  html += `<button class="chip chip-online${onlineActive}" data-toggle="online" title="Só jogos com modo online">🌐 Online</button>`;
  // Chip de ordenação A-Z (toggle independente, no final)
  const azActive = greenState.sort === "az" ? " active" : "";
  html += `<button class="chip chip-sort${azActive}" data-sort="az" title="Ordenar de A a Z">🔤 A-Z</button>`;
  container.innerHTML = html;
}

/* ============== PERSISTÊNCIA DE STATE (localStorage) ============== */
const GREEN_STATE_KEY = "zju4nn_green_state_v1";

// sessionStorage = persiste no F5 mas reseta ao fechar aba/navegador
function saveGreenState() {
  try {
    sessionStorage.setItem(GREEN_STATE_KEY, JSON.stringify({
      search: greenState.search,
      genre: greenState.genre,
      online: greenState.online,
      sort: greenState.sort,
      page: greenState.page
    }));
  } catch {}
}

function restoreGreenState() {
  try {
    const raw = sessionStorage.getItem(GREEN_STATE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.search === "string") greenState.search = s.search;
    if (s.genre === null || typeof s.genre === "string") greenState.genre = s.genre;
    if (typeof s.online === "boolean") greenState.online = s.online;
    if (s.sort === "popular" || s.sort === "az") greenState.sort = s.sort;
    if (typeof s.page === "number" && s.page >= 1) greenState.page = s.page;
  } catch {}
}

/* ============== INTERAÇÕES (search/filter/page) ============== */
function setupGreenInteractions() {
  const search = document.getElementById("green-search");
  const clear = document.getElementById("green-search-clear");

  search.addEventListener("input", (e) => {
    greenState.search = e.target.value;
    greenState.page = 1;
    clear.classList.toggle("show", !!e.target.value);
    renderGreenSection();
    saveGreenState();
  });
  clear.addEventListener("click", () => {
    search.value = "";
    greenState.search = "";
    greenState.page = 1;
    clear.classList.remove("show");
    renderGreenSection();
    saveGreenState();
  });

  // Filtros (delegação)
  document.getElementById("green-filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    // Chip de ordenação A-Z (toggle independente)
    if (chip.dataset.sort) {
      const isAz = greenState.sort === "az";
      greenState.sort = isAz ? "popular" : "az";
      chip.classList.toggle("active", !isAz);
      greenState.page = 1;
      renderGreenSection();
      saveGreenState();
      return;
    }
    // Chip Online (toggle independente)
    if (chip.dataset.toggle === "online") {
      greenState.online = !greenState.online;
      chip.classList.toggle("active", greenState.online);
      greenState.page = 1;
      renderGreenSection();
      saveGreenState();
      return;
    }
    // Chips de gênero (Todos / Ação / RPG ...)
    const genre = chip.dataset.genre;
    greenState.genre = genre || null;
    chip.parentElement.querySelectorAll(".chip:not(.chip-sort):not(.chip-online)")
      .forEach(c => c.classList.toggle("active", c === chip));
    greenState.page = 1;
    renderGreenSection();
    saveGreenState();
  });

  // Paginação (delegação)
  document.getElementById("green-pagination").addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;

    // Botão "..." → vira input pra digitar página
    if (btn.dataset.action === "jump") {
      const filtered = getGreenFilteredList();
      const totalPages = Math.max(1, Math.ceil(filtered.length / GREEN_PAGE_SIZE));
      const input = document.createElement("input");
      input.type = "number";
      input.className = "page-btn page-jump-input";
      input.min = "1";
      input.max = String(totalPages);
      input.placeholder = `1-${totalPages}`;
      btn.replaceWith(input);
      input.focus();

      let committed = false;
      const commit = (apply) => {
        if (committed) return;
        committed = true;
        if (apply) {
          const v = parseInt(input.value, 10);
          if (!isNaN(v) && v >= 1 && v <= totalPages && v !== greenState.page) {
            greenState.page = v;
            renderGreenSection();
            saveGreenState();
            document.getElementById("jogos-verdes").scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
        }
        // Restaura: re-renderiza a paginação atual (volta os ...)
        renderGreenSection();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
        else if (ev.key === "Escape") { commit(false); }
      });
      input.addEventListener("blur", () => commit(true));
      return;
    }

    const p = parseInt(btn.dataset.page, 10);
    if (!isNaN(p)) {
      greenState.page = p;
      renderGreenSection();
      saveGreenState();
      // Scroll suave pra cima da seção
      document.getElementById("jogos-verdes").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

/* ============== LOADER ============== */
// Extrai o Steam appID do URL da imagem (usado como desempate)
function extractAppId(imgUrl) {
  const m = (imgUrl || "").match(/\/apps\/(\d+)\//);
  return m ? parseInt(m[1], 10) : 0;
}

// Extrai ano de lançamento do nome do jogo, ex: "Resident Evil 3 (1999)" → 1999
// Procura por (YYYY) onde YYYY é entre 1970-2099
function extractYear(name) {
  const m = (name || "").match(/\((\d{4})\)/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (y >= 1970 && y <= 2099) return y;
  return null;
}

function loadGreenGames() {
  // Os dados são carregados via <script src="greenGames.js"> (window.GREEN_GAMES_DATA)
  if (window.GREEN_GAMES_DATA && Array.isArray(window.GREEN_GAMES_DATA)) {
    GREEN_GAMES = window.GREEN_GAMES_DATA.slice();
    // Preserva o índice original do catálogo (usado como desempate)
    GREEN_GAMES.forEach((g, i) => g.__orig = i);
    // Restaura state da sessão (página, filtros, busca) ANTES de renderizar
    restoreGreenState();
    // Sincroniza o UI com o state restaurado
    const searchEl = document.getElementById("green-search");
    const clearEl = document.getElementById("green-search-clear");
    if (searchEl && greenState.search) {
      searchEl.value = greenState.search;
      if (clearEl) clearEl.classList.add("show");
    }
    // Ordenação efetiva é feita dinamicamente em getGreenFilteredList()
    // baseada em window.STEAM_TOPS (top sellers do Steam BR)
    buildGreenFilters();
    renderGreenSection();
    // Atualiza contador no hero
    const sg = document.getElementById("stat-green");
    if (sg) sg.textContent = GREEN_GAMES.length;
    // Se restaurou pra uma página > 1, scroll suave pro topo da seção (sem animar muito brusco)
    if (greenState.page > 1) {
      setTimeout(() => {
        document.getElementById("jogos-verdes")?.scrollIntoView({ behavior: "instant", block: "start" });
      }, 50);
    }
  } else {
    console.warn("greenGames.js não carregado");
    renderGreenSection(); // Mostra empty-state
  }
}

/* ============== MODAL ============== */
const modal       = document.getElementById("modal");
const modalImg    = document.getElementById("modal-img");
const modalTitle  = document.getElementById("modal-title");
const modalSum    = document.getElementById("modal-summary");
const modalTut    = document.getElementById("modal-tutorial");
const modalActs   = document.getElementById("modal-actions");
const modalClose  = document.getElementById("modal-close");

function renderTutorial(steps) {
  return steps.map(s => {
    const lines = s.body.map(l => `<div class="step-line">${l}</div>`).join("");
    return `<li><div class="step-title">${s.title}</div>${lines}</li>`;
  }).join("");
}

function openModal(g, type) {
  modalImg.src = g.img;
  modalImg.alt = g.title;
  modalTitle.textContent = g.title;
  modalSum.textContent = g.summary || "";

  let steps;
  if (Array.isArray(g.tutorial) && g.tutorial.length) {
    steps = g.tutorial;
  } else {
    steps = buildHypervisorTutorial(g.folder || g.title, g.exe || "Game.exe", g.exeNote);
  }
  modalTut.innerHTML = renderTutorial(steps);

  let actions = "";
  if (g.fix)  actions += `<a class="btn btn-primary" href="${g.fix}"  target="_blank" rel="noopener">⬇ Baixar Correção</a>`;
  if (g.game) {
    if (g.gameBroken) {
      actions += `<button class="btn btn-ghost" data-broken="1">🎮 Baixar Jogo</button>`;
    } else {
      actions += `<a class="btn btn-ghost" href="${g.game}" target="_blank" rel="noopener">🎮 Baixar Jogo</a>`;
    }
  }
  modalActs.innerHTML = actions;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* ============== EVENTOS ============== */
document.addEventListener("click", (e) => {
  const card = e.target.closest(".game-card");
  if (!card) return;
  const idx = parseInt(card.dataset.index, 10);
  // Card verde: abre direto se 1 link, ou picker de servidor se 2+
  if (card.classList.contains("green-card")) {
    const g = GREEN_GAMES[idx];
    if (!g) return;
    const links = getLinks(g);
    if (!links.length) return;
    if (links.length === 1) {
      window.open(links[0].u, "_blank", "noopener");
    } else {
      openServerPicker(g, links);
    }
    return;
  }
  // Card hyper: abre o modal com tutorial
  if (card.dataset.type === "hyper") {
    openModal(HYPER_GAMES[idx], "hyper");
  }
});

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (notice.classList.contains("open")) closeNotice();
    else closeModal();
  }
});

/* ============== NOTICE (link de jogo quebrado) ============== */
const notice      = document.getElementById("notice");
const noticeClose = document.getElementById("notice-close");

function openNotice() {
  notice.classList.add("open");
  notice.setAttribute("aria-hidden", "false");
}
function closeNotice() {
  notice.classList.remove("open");
  notice.setAttribute("aria-hidden", "true");
}

modalActs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-broken]");
  if (btn) {
    e.preventDefault();
    openNotice();
  }
});
noticeClose.addEventListener("click", closeNotice);
document.getElementById("notice-ok").addEventListener("click", closeNotice);
notice.addEventListener("click", (e) => { if (e.target === notice) closeNotice(); });

/* ============== SERVER PICKER (multi-link) ============== */
const picker = document.getElementById("server-picker");

function openServerPicker(g, links) {
  if (!picker) {
    // Fallback: abre o primeiro link se modal não existe
    if (links[0]) window.open(links[0].u, "_blank", "noopener");
    return;
  }
  const nameEl = picker.querySelector(".picker-game-name");
  const listEl = picker.querySelector(".picker-servers");
  if (nameEl) nameEl.textContent = g.n;
  if (listEl) {
    listEl.innerHTML = links.map((L, i) => {
      const tipo = L.x ? "TORRENT" : "DIRETO";
      const tipoCls = L.x ? "torrent" : "direct";
      const src = L.s || detectSourceFromUrl(L.u);
      return `
        <button class="server-btn" data-url="${encodeURIComponent(L.u)}">
          <span class="server-num">${i + 1}</span>
          <span class="server-info">
            <span class="server-name">${src}</span>
            <span class="server-meta"><span class="type-badge ${tipoCls}">${tipo}</span></span>
          </span>
          <span class="server-arrow">→</span>
        </button>`;
    }).join("");
  }
  picker.classList.add("open");
  picker.setAttribute("aria-hidden", "false");
}

function closeServerPicker() {
  if (!picker) return;
  picker.classList.remove("open");
  picker.setAttribute("aria-hidden", "true");
}

if (picker) {
  picker.addEventListener("click", (e) => {
    if (e.target === picker) { closeServerPicker(); return; }
    const closeBtn = e.target.closest("#picker-close");
    if (closeBtn) { closeServerPicker(); return; }
    const btn = e.target.closest(".server-btn");
    if (btn) {
      const url = decodeURIComponent(btn.dataset.url || "");
      if (url) window.open(url, "_blank", "noopener");
      closeServerPicker();
    }
  });
}

// Estende ESC handler já existente pra também fechar picker
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && picker && picker.classList.contains("open")) {
    closeServerPicker();
  }
});

/* ============== INIT ============== */
document.getElementById("year").textContent = new Date().getFullYear();
buildHyperGrid();
setupGreenInteractions();
loadGreenGames();
