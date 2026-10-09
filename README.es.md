# Cozy Read Aloud

[English](README.md) | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | Español | [Italiano](README.it.md) | [Português](README.pt.md)

Escucha notas, PDF, archivos HTML y páginas web en Obsidian. La privacidad es prioritaria: el texto se extrae localmente y solo se envía a servicios de voz en línea con tu consentimiento explícito.

## Funciones destacadas

- Leer todo, solo la selección o continuar desde la selección, también en PDF.
- Resaltado opcional en el documento original y compatibilidad con artículos PDF habituales de dos columnas.
- Navegar por títulos, marcadores PDF o un índice detectado localmente.
- Lectura académica: omitir fórmulas LaTeX complejas y tablas numéricas largas, usar `sub` y `bar`, y agrupar referencias bibliográficas consecutivas.
- Escuchar respuestas guardadas de Copilot. Requiere instalar Copilot y guardar las conversaciones en la bóveda.
- Exportar audio tras confirmar. Por defecto solo se sintetiza por adelantado el siguiente fragmento de audio.

## Inicio rápido

1. Instala y activa el complemento en Obsidian de escritorio. Elige Español en **Settings language**.
2. Selecciona un motor. **System local speech** usa voces compatibles ya instaladas, sin clave API. **Xiaomi MiMo** y **OpenRouter** necesitan una clave API y permiso para procesar en línea. Se recomienda Obsidian SecretStorage para guardar las claves.
3. **Edge TTS** necesita instalar por separado el programa externo `edge-tts`; su interfaz no garantiza explícitamente ZDR. Las solicitudes a OpenRouter fuerzan el enrutamiento ZDR, aunque el texto sigue enviándose al servicio.
4. Abre un documento y pulsa el icono de audio para mostrar la barra con reproducción, pausa, velocidad y alcance de lectura.

## Lectura académica

La sección **Lectura académica** agrupa los ajustes de fórmulas y tablas. El modo inteligente omite fórmulas complejas y tablas numéricas largas, conservando tablas pequeñas y glosarios de texto. Puedes desactivar el aviso de omisión. Los archivos originales no se modifican. La detección PDF es conservadora; no identifica todas las fórmulas sin estructura.

El PDF debe contener texto seleccionable; los escaneos necesitan OCR. Para HTML local, instala un visor compatible como HTML Reader. El idioma de la interfaz no cambia la voz. La conversión de fórmulas admite actualmente inglés y chino; algunas ayudas detalladas y diálogos secundarios siguen en inglés.

Para documentos sensibles usa voces locales del sistema o CosyVoice local. [Guía completa en inglés](README.md) · [Informar de un problema](https://github.com/laginae/note-reader-cosyvoice/issues), sin claves ni documentos privados.
