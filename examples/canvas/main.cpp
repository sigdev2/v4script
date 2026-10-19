// canvas - graphics of programs into PNG files: BASIC (SCREEN, CIRCLE,
// PAINT), Pascal (the Graph unit) and JavaScript (the 2D context) draw on
// an ImageCanvas, the application saves its picture.
//
//     v4script-canvas [directory]

#include <v4script/ImageCanvas.hpp>
#include <v4script/V4Script.hpp>

#include <QDir>
#include <QGuiApplication>
#include <QJSEngine>

#include <iostream>

int main(int argc, char* argv[])
{
    v4script::prepareProcess();
    // The canvas draws text with Qt fonts: a GUI application, but no window.
    // Without a display (a Linux server) the offscreen platform does.
#ifdef Q_OS_LINUX
    if (qEnvironmentVariableIsEmpty("QT_QPA_PLATFORM") && qEnvironmentVariableIsEmpty("DISPLAY") &&
        qEnvironmentVariableIsEmpty("WAYLAND_DISPLAY"))
    {
        qputenv("QT_QPA_PLATFORM", "offscreen");
    }
#endif
    QGuiApplication application(argc, argv);
    const QDir directory(argc > 1 ? QString::fromLocal8Bit(argv[1]) : QDir::currentPath());

    // The canvas outlives the runtime that keeps the callback.
    v4script::ImageCanvas canvas;
    v4script::Runtime runtime;
    runtime.setOutput([](v4script::Stream, const QString& text) { std::cout << text.toStdString(); });
    runtime.setCanvas([&canvas, &runtime]() { return canvas.jsValue(runtime.jsEngine()); });
    // Plain JavaScript reaches the canvas through a global of its own.
    runtime.jsEngine()->globalObject().setProperty("canvas", canvas.jsValue(runtime.jsEngine()));

    const QList<QPair<QString, QString>> programs = {
        { "basic",
          "SCREEN 13\n"
          "LINE (20, 20)-(300, 180), 14, B\n"
          "PAINT (25, 25), 1, 14\n"
          "FOR r = 10 TO 90 STEP 8: CIRCLE (160, 100), r, 32 + r \\ 4: NEXT\n"
          "PRINT \"BASIC: a frame and rings\"" },
        { "pascal",
          "uses Graph;\n"
          "var gd, gm, i: SmallInt;\n"
          "begin\n"
          "  gd := VGA; gm := VGAHi; InitGraph(gd, gm, '');\n"
          "  for i := 0 to 15 do begin SetFillStyle(SolidFill, i); Bar(i * 40, 0, i * 40 + 39, 40); end;\n"
          "  SetColor(Yellow); Circle(320, 260, 150);\n"
          "  SetFillStyle(HatchFill, LightBlue); FloodFill(320, 260, Yellow);\n"
          "  SetTextStyle(DefaultFont, HorizDir, 3); SetTextJustify(CenterText, CenterText);\n"
          "  OutTextXY(320, 440, 'Pascal Graph');\n"
          "end." },
        { "javascript",
          "var c = canvas; c.width = 400; c.height = 200;\n"
          "var g = c.getContext('2d');\n"
          "g.fillStyle = '#204080'; g.fillRect(0, 0, 400, 200);\n"
          "g.strokeStyle = 'orange'; g.lineWidth = 6;\n"
          "g.beginPath(); g.arc(200, 100, 70, 0, Math.PI * 2); g.stroke();\n"
          "g.fillStyle = 'white'; g.font = '24px sans-serif'; g.fillText('JavaScript', 140, 110);" },
    };
    int failures = 0;
    for (const auto& program : programs) {
        const v4script::Result result = runtime.run(program.first, program.second);
        if (!result.isOk()) {
            std::cerr << program.first.toStdString() << ": " << result.describeError().toStdString() << "\n";
            ++failures;
            continue;
        }
        const QString file = directory.filePath(program.first + ".png");
        if (canvas.image().save(file)) {
            std::cout << "saved " << file.toStdString() << " (" << canvas.getWidth() << " x " << canvas.getHeight()
                      << ")\n";
        }
    }
    return failures == 0 ? 0 : 1;
}
