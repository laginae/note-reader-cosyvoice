# Cozy Read Aloud

[English](README.md) | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Italiano](README.it.md) | Português

Ouça notas, PDFs, arquivos HTML e páginas da web no Obsidian. A privacidade vem primeiro: o texto é extraído localmente e só é enviado a serviços de voz online com seu consentimento explícito.

## Destaques

- Leia o documento inteiro, apenas a seleção ou continue a partir do ponto selecionado, inclusive em PDFs.
- Acompanhe o destaque opcional no documento original, com suporte à ordem de leitura de artigos PDF comuns de duas colunas.
- Navegue por títulos, marcadores de PDF ou uma estrutura detectada localmente.
- Leitura acadêmica: ignore fórmulas LaTeX complexas e tabelas numéricas longas, use nomes concisos como `sub` e `bar` e agrupe referências bibliográficas consecutivas.
- Ouça respostas salvas do Copilot. É necessário instalar o Copilot e salvar as conversas no cofre.
- Exporte áudio após confirmação. Por padrão, apenas o próximo fragmento de áudio é sintetizado antecipadamente.

## Início rápido

1. Instale e ative o plugin no Obsidian para desktop. Em **Settings language**, escolha **Português**.
2. Escolha um mecanismo. **Voz local do sistema** usa vozes compatíveis já instaladas, sem chave de API. **Xiaomi MiMo** e **OpenRouter** precisam de uma chave de API e da permissão de processamento online. Prefira Obsidian SecretStorage para armazenar as chaves.
3. **Edge TTS** exige a instalação separada do programa de terceiros `edge-tts`; sua interface não garante explicitamente ZDR. As solicitações ao OpenRouter exigem roteamento ZDR, mas o texto ainda é enviado ao serviço.
4. Abra um documento e clique no ícone de áudio para mostrar a barra de leitura. Controle a reprodução, pausa, velocidade e trecho de leitura.

## Leitura acadêmica

A seção **Leitura acadêmica** reúne as opções de fórmulas, tabelas e conteúdo complementar do PDF. O modo inteligente ignora fórmulas complexas e tabelas numéricas longas, mantendo tabelas pequenas e glossários de texto. O aviso de conteúdo ignorado pode ser desativado. Os arquivos originais não são alterados.

A detecção de tabelas em PDF é conservadora e depende de títulos e linhas numéricas reconhecíveis. Fórmulas sem estrutura no PDF ainda podem ser lidas. PDFs precisam conter texto selecionável; documentos digitalizados exigem OCR.

Para arquivos HTML locais, instale um visualizador compatível, como HTML Reader. O idioma da interface não altera a voz. A conversão de fórmulas atualmente aceita inglês e chinês; algumas instruções detalhadas e caixas de diálogo secundárias permanecem em inglês.

Para documentos sensíveis, use vozes locais do sistema ou CosyVoice local. Consulte o [guia completo em inglês](README.md) para configurar os serviços. Envie sugestões ou erros pelo [GitHub Issues](https://github.com/laginae/note-reader-cosyvoice/issues), sem incluir chaves ou documentos privados.
