# Cozy Read Aloud

[English](README.md) | [简体中文](README.zh-CN.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Русский](README.ru.md) | 한국어 | [日本語](README.ja.md) | [Español](README.es.md) | [Italiano](README.it.md) | [Português](README.pt.md)

Obsidian에서 노트, PDF, HTML 파일과 웹 페이지를 듣습니다. 개인정보 보호를 우선합니다. 텍스트는 로컬에서 추출하며, 온라인 음성 서비스에는 명시적으로 동의한 경우에만 전송합니다.

## 주요 기능

- 전체 문서, 선택한 텍스트 또는 선택 위치부터 읽기. PDF도 지원합니다.
- 원문에서 선택적으로 강조 표시하며 일반적인 2단 구성 PDF 논문의 읽기 순서를 지원합니다.
- 제목, PDF 책갈피 또는 로컬에서 감지한 개요로 이동합니다.
- 학술 읽기: 복잡한 LaTeX 수식과 긴 숫자 표를 생략하고, `sub`와 `bar`를 사용하며 연속된 참고문헌 번호를 묶어 읽습니다.
- 저장된 Copilot 답변을 읽습니다. Copilot을 설치하고 대화를 보관함에 저장해야 합니다.
- 확인 후 오디오를 내보냅니다. 기본적으로 다음 오디오 조각 하나만 미리 합성합니다.

## 빠른 시작

1. Obsidian 데스크톱에서 플러그인을 설치하고 켭니다. **Settings language**에서 한국어를 선택합니다.
2. 엔진을 선택합니다. **System local speech**는 API 키 없이 호환되는 설치된 시스템 음성을 사용합니다. **Xiaomi MiMo**와 **OpenRouter**는 API 키와 온라인 처리 동의가 필요합니다. 키 저장에는 Obsidian SecretStorage를 권장합니다.
3. **Edge TTS**는 타사 프로그램 `edge-tts`를 별도로 설치해야 하며, 해당 인터페이스는 ZDR을 명시적으로 보장하지 않습니다. OpenRouter 요청은 ZDR 라우팅을 강제하지만 텍스트는 서비스로 전송됩니다.
4. 문서를 열고 오디오 아이콘을 눌러 읽기 도구 모음을 표시합니다. 재생, 일시 정지, 속도와 읽기 범위를 조절할 수 있습니다.

## 학술 읽기

**학술 읽기** 설정에서 수식과 표를 조절합니다. 스마트 모드는 복잡한 수식과 긴 숫자 표를 건너뛰며 작은 표와 텍스트 용어집은 유지합니다. 생략 알림은 끌 수 있고 원본 파일은 바꾸지 않습니다. PDF 표 감지는 보수적으로 동작하며 구조 정보가 없는 수식을 모두 감지하지는 못합니다.

PDF에는 선택 가능한 텍스트가 있어야 합니다. 스캔 문서는 OCR이 필요합니다. 로컬 HTML에는 HTML Reader 같은 호환 뷰어를 설치하세요. 인터페이스 언어와 음성은 별개이며 수식 변환은 현재 중국어와 영어를 지원합니다. 일부 상세 도움말과 보조 대화상자는 영어로 표시됩니다.

민감한 문서에는 로컬 시스템 음성 또는 로컬 CosyVoice를 사용하세요. [전체 영어 안내](README.md) · [문제 신고](https://github.com/laginae/note-reader-cosyvoice/issues). 키나 개인 문서는 올리지 마세요.
