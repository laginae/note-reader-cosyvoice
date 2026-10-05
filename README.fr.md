# Note and PDF Voice Reader

[English](README.md) | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md) | Français | [Русский](README.ru.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Italiano](README.it.md) | [Português](README.pt.md)

Écoutez vos notes, PDF, fichiers HTML et pages web dans Obsidian. La confidentialité passe en premier : le texte est extrait localement et n’est envoyé à un service vocal en ligne qu’avec votre accord explicite.

## Points forts

- Lire tout le document, la sélection ou continuer depuis une sélection, y compris dans un PDF.
- Surlignage facultatif dans le document original, avec prise en charge des articles PDF courants à deux colonnes.
- Navigation par titres, signets PDF ou plan détecté localement.
- Lecture scientifique : ignorer les formules LaTeX complexes et longs tableaux numériques, utiliser `sub` et `bar`, regrouper les références bibliographiques consécutives.
- Écouter les réponses Copilot enregistrées : installer Copilot et enregistrer les conversations dans le coffre.
- Exporter l’audio après confirmation. Un seul prochain fragment audio est synthétisé à l’avance par défaut.

## Démarrage rapide

1. Installer et activer le plugin sur Obsidian Desktop. Choisir Français dans **Settings language**.
2. Choisir un moteur : **System local speech** utilise les voix système compatibles déjà installées, sans clé API. **Xiaomi MiMo** et **OpenRouter** nécessitent une clé API et l’autorisation du traitement en ligne. Préférer Obsidian SecretStorage pour les clés.
3. **Edge TTS** nécessite le programme tiers `edge-tts` ; son interface ne garantit pas explicitement le ZDR. OpenRouter impose le routage ZDR, mais reçoit toujours le texte à traiter.
4. Ouvrir un document et cliquer sur l’icône audio pour afficher la barre de lecture : lecture, pause, vitesse et portée.

## Lecture scientifique

La section **Lecture scientifique** regroupe les réglages des formules et tableaux. Le mode intelligent ignore les formules complexes et longs tableaux numériques, mais conserve les petits tableaux et glossaires textuels. L’annonce des omissions est facultative. Les fichiers originaux ne sont pas modifiés. La détection PDF est prudente et ne reconnaît pas toutes les équations sans structure.

Les PDF doivent contenir du texte sélectionnable ; les scans nécessitent un OCR. Pour les fichiers HTML locaux, installer un lecteur compatible, par exemple HTML Reader. La langue de l’interface ne change pas la voix. La conversion des formules prend actuellement en charge le chinois et l’anglais ; certaines aides détaillées et boîtes de dialogue restent en anglais.

Pour les documents sensibles, utiliser les voix système locales ou CosyVoice local. [Guide complet en anglais](README.md) · [Signaler un problème](https://github.com/laginae/note-reader-cosyvoice/issues), sans clé ni document privé.
