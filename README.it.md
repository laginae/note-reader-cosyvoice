# Cozy Read Aloud

[English](README.md) | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md) | Italiano | [Português](README.pt.md)

Ascolta note, PDF, file HTML e pagine web in Obsidian. La privacy viene prima: il testo viene estratto localmente e inviato ai servizi vocali online solo con il tuo consenso esplicito.

## Funzionalità

- Leggere tutto, solo la selezione o continuare dal punto selezionato, anche nei PDF.
- Evidenziazione facoltativa nel documento originale e supporto ai comuni articoli PDF a due colonne.
- Navigazione tramite titoli, segnalibri PDF o struttura rilevata localmente.
- Lettura accademica: saltare formule LaTeX complesse e lunghe tabelle numeriche, usare `sub` e `bar` e raggruppare riferimenti bibliografici consecutivi.
- Ascoltare risposte Copilot salvate. Occorre installare Copilot e salvare le conversazioni nel vault.
- Esportare audio dopo conferma. Per impostazione predefinita viene sintetizzato in anticipo solo il prossimo frammento audio.

## Avvio rapido

1. Installa e attiva il plugin in Obsidian desktop. Seleziona Italiano in **Settings language**.
2. Scegli un motore. **System local speech** usa le voci compatibili già installate, senza chiave API. **Xiaomi MiMo** e **OpenRouter** richiedono una chiave API e il consenso all’elaborazione online. Per le chiavi è consigliato Obsidian SecretStorage.
3. **Edge TTS** richiede l’installazione separata del programma di terze parti `edge-tts`; la sua interfaccia non garantisce esplicitamente ZDR. Le richieste OpenRouter impongono l’instradamento ZDR, ma il testo viene comunque inviato al servizio.
4. Apri un documento e premi l’icona audio per mostrare la barra con riproduzione, pausa, velocità e ambito di lettura.

## Lettura accademica

La sezione **Lettura accademica** raccoglie le impostazioni di formule e tabelle. La modalità intelligente salta formule complesse e lunghe tabelle numeriche, conservando tabelle piccole e glossari testuali. L’annuncio delle omissioni può essere disattivato. I file originali non vengono modificati. Il filtro PDF è prudente e non riconosce tutte le formule prive di struttura.

I PDF devono contenere testo selezionabile; le scansioni richiedono OCR. Per i file HTML locali installa un visualizzatore compatibile, ad esempio HTML Reader. Lingua dell’interfaccia e voce sono indipendenti. La conversione delle formule supporta attualmente inglese e cinese; alcune guide dettagliate e finestre secondarie restano in inglese.

Per documenti sensibili usa le voci locali di sistema o CosyVoice locale. [Guida completa in inglese](README.md) · [Segnala un problema](https://github.com/laginae/note-reader-cosyvoice/issues), senza chiavi o documenti privati.
