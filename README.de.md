# Cozy Read Aloud

[English](README.md) | [简体中文](README.zh-CN.md) | Deutsch | [Français](README.fr.md) | [Русский](README.ru.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Italiano](README.it.md) | [Português](README.pt.md)

Notizen, PDFs, HTML-Dateien und Webseiten in Obsidian vorlesen lassen. Datenschutz zuerst: Der Text wird lokal extrahiert; Online-Stimmen erhalten ihn nur nach ausdrücklicher Zustimmung.

## Vorteile

- Ganzes Dokument, Auswahl oder ab der Auswahl lesen, auch in PDFs.
- Optionale Hervorhebung im Originaldokument und Unterstützung gängiger zweispaltiger PDF-Artikel.
- Navigation über Überschriften, PDF-Lesezeichen oder lokal erkannte Gliederungen.
- Wissenschaftliches Lesen: komplexe LaTeX-Formeln und lange Zahlentabellen überspringen; kurze Symbolnamen wie `sub` und `bar` verwenden und aufeinanderfolgende Literaturverweise zusammenfassen.
- Gespeicherte Copilot-Antworten lesen; dafür Copilot installieren und Gespräche im Vault speichern.
- Audio mit Bestätigung exportieren. Standardmäßig wird nur ein kommender Audioteil vorab synthetisiert.

## Schnellstart

1. Das Plugin auf Obsidian Desktop installieren und aktivieren. Unter **Settings language** Deutsch wählen.
2. Eine Sprachsynthese wählen: **System local speech** nutzt kompatible installierte Systemstimmen ohne API-Schlüssel. **Xiaomi MiMo** oder **OpenRouter** benötigen einen API-Schlüssel und die jeweilige Online-Zustimmung. Für Schlüssel möglichst Obsidian SecretStorage nutzen.
3. **Edge TTS** benötigt das separate Drittanbieterprogramm `edge-tts`; seine Schnittstelle bietet keine ausdrückliche ZDR-Garantie. OpenRouter-Anfragen erzwingen ZDR-Routing, senden Text aber weiterhin an den Dienst.
4. Ein Dokument öffnen und die Vorleseleiste über das Audiosymbol einblenden. Wiedergabe, Pause, Geschwindigkeit und Lesebereich dort steuern.

## Wissenschaftliches Lesen

Unter **Wissenschaftliches Lesen** Formeln und Tabellen konfigurieren. Der intelligente Modus überspringt komplexe Formeln und lange numerische Tabellen, behält aber kleine Tabellen und Textglossare. Die kurze Auslassungsansage lässt sich abschalten. Originaldateien bleiben unverändert. PDF-Tabellenerkennung ist konservativ; unstrukturierte PDF-Formeln werden nicht zuverlässig erkannt.

PDFs benötigen auswählbaren Text; Scans benötigen OCR. Für lokale HTML-Dateien einen passenden Viewer wie HTML Reader installieren. Oberflächensprache und Stimme sind unabhängig; Formelumwandlung unterstützt derzeit Englisch und Chinesisch. Einige detaillierte Hilfetexte und Dialoge bleiben auf Englisch.

Für besonders sensible Texte lokale Systemstimmen oder lokales CosyVoice verwenden. Vollständige Konfiguration: [englische Anleitung](README.md). Fehler melden: [GitHub Issues](https://github.com/laginae/note-reader-cosyvoice/issues), ohne Schlüssel oder private Dokumente.
