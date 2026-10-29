using System.Text;
using System.Text.Json;
using Sdcb.SimdPaddleOCR;
using Sdcb.SimdPaddleOCR.Models.ChineseV6Tiny;
using Sdcb.SimdPaddleOCR.Models.ChineseV6Small;

// No HTTP client or filesystem document access. Only bounded RGB pages on stdin.
if (args.Length != 2 || args[0] != "--model" || (args[1] != "tiny" && args[1] != "small")) return 2;
using Stream input = Console.OpenStandardInput();
PaddleOcrAll? ocr = null;
try {
    while (true) {
        var header = new List<byte>();
        int next;
        while ((next = input.ReadByte()) >= 0 && next != 10) {
            if (header.Count >= 256) return 3;
            header.Add((byte)next);
        }
        if (next < 0) return header.Count == 0 ? 0 : 3;
        using var request = JsonDocument.Parse(Encoding.UTF8.GetString(header.ToArray()));
        var root = request.RootElement;
        int width = root.GetProperty("width").GetInt32(), height = root.GetProperty("height").GetInt32();
        if (root.GetProperty("version").GetInt32() != 1 || width < 1 || height < 1 || width > 4096 || height > 4096 || (long)width * height > 4_000_000) return 3;
        byte[] rgb = new byte[width * height * 3];
        input.ReadExactly(rgb);
        ocr ??= await PaddleOcrAll.LoadAsync(args[1] == "tiny" ? ChineseV6TinyModels.Default : ChineseV6SmallModels.Default,
            new PaddleOcrOptions {
                UseDirectionClassification = false, LineWorkerCount = 4, DetIntraOpThreads = 4,
                Detector = new() { Backend = OcrBackend.Cpu, LimitSideLength = 960 },
                Classifier = new() { Backend = OcrBackend.Cpu }, Recognizer = new() { Backend = OcrBackend.Cpu }
            });
        var result = ocr.Run(rgb, width, height, format: ImagePixelFormat.Rgb24);
        var lines = result.Lines.Select(l => new {
            text = l.Text, confidence = Math.Clamp(l.RecognitionScore, 0, 1),
            box = new[] {
                Math.Clamp(new[]{l.Box.X1,l.Box.X2,l.Box.X3,l.Box.X4}.Min(),0,width),
                Math.Clamp(new[]{l.Box.Y1,l.Box.Y2,l.Box.Y3,l.Box.Y4}.Min(),0,height),
                Math.Clamp(new[]{l.Box.X1,l.Box.X2,l.Box.X3,l.Box.X4}.Max(),0,width),
                Math.Clamp(new[]{l.Box.Y1,l.Box.Y2,l.Box.Y3,l.Box.Y4}.Max(),0,height)
            }
        }).Where(l => l.box[2] > l.box[0] && l.box[3] > l.box[1]).ToArray();
        if (lines.Length > 10000 || lines.Sum(l => l.text.Length) > 200000) return 3;
        Console.WriteLine(JsonSerializer.Serialize(new { version = 1, width, height, lines }));
        Array.Clear(rgb);
    }
} catch { return 4; }
finally { ocr?.Dispose(); }
