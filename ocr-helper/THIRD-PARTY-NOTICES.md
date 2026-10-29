# Optional Cozy OCR helper

The helper source belongs to the Cozy Read Aloud project and follows its repository license. The separate helper distribution includes:

- [Sdcb.SimdPaddleOCR](https://github.com/sdcb/SimdPaddleOCR), version 2.0.0, Apache License 2.0.
- Sdcb.SimdPaddleOCR.ModelProvider, ChineseV6Tiny, ChineseV6Small and TextLineOrientation model packages, version 1.0.0, Apache License 2.0. Model-package authorship and provenance remain with their respective upstream authors. See the upstream [third-party notices](https://github.com/sdcb/SimdPaddleOCR/blob/main/THIRD-PARTY-NOTICES.md).
- The Microsoft .NET runtime in self-contained builds, distributed under its included `LICENSE.txt` and `ThirdPartyNotices.txt`.

Include the upstream Apache license and third-party notices in binary distributions. The helper does not use ImageSharp, ONNX Runtime, Paddle Inference, or OpenCV. It accepts RGB pixels and uses CPU inference only. Inclusion does not imply endorsement by the upstream authors.
