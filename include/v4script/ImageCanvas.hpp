#ifndef V4SCRIPT_IMAGECANVAS_HPP
#define V4SCRIPT_IMAGECANVAS_HPP

#include <QByteArray>
#include <QImage>
#include <QJSValue>
#include <QObject>
#include <QVariantList>
#include <QVariantMap>

class QJSEngine;

namespace v4script {

/**
 * @brief A canvas for programs that draws into a QImage (target
 * V4Script::ImageCanvas).
 *
 *     v4script::ImageCanvas canvas; // outlives the runtime that keeps the callback
 *     v4script::Runtime runtime;
 *     runtime.setCanvas([&canvas, &runtime]() { return canvas.jsValue(runtime.jsEngine()); });
 *     runtime.run("basic", "SCREEN 13: CIRCLE (160, 100), 50, 14");
 *     canvas.image().save("circle.png");
 *
 * Programs see an HTML canvas: width, height (300 x 150 at first; a new size
 * clears the picture) and getContext("2d") with a subset of the 2D context:
 * fillStyle, strokeStyle, lineWidth, globalAlpha, font, textAlign,
 * textBaseline; fillRect, strokeRect, clearRect; beginPath, moveTo, lineTo,
 * rect, arc, quadraticCurveTo, bezierCurveTo, closePath, fill, stroke;
 * fillText, strokeText, measureText; createImageData, getImageData,
 * putImageData, drawImage (ImageData or another ImageCanvas). Colors: names,
 * #rgb, #rrggbb, rgb(), rgba(). See docs/embedding/canvas.md.
 */
class ImageCanvas : public QObject {
    Q_OBJECT
    Q_PROPERTY(int width READ getWidth WRITE setWidth NOTIFY resized)
    Q_PROPERTY(int height READ getHeight WRITE setHeight NOTIFY resized)

public:
    explicit ImageCanvas(QObject* parent = nullptr);

    /**
     * @brief The canvas object for programs in the engine (Host::canvas): the
     * same object on every call. The engine keeps it, so the canvas works
     * with a new engine too (Runtime::reset()).
     */
    QJSValue jsValue(QJSEngine* engine);

    int getWidth() const;
    int getHeight() const;
    void setWidth(int width);
    void setHeight(int height);
    void resize(int width, int height);

    /**
     * @brief The picture: transparent where nothing was drawn
     */
    QImage image() const;

    // The 2D context of js/host/canvas.js draws with these.
    Q_INVOKABLE void fillRect(double x, double y, double width, double height, const QVariantMap& state);
    Q_INVOKABLE void strokeRect(double x, double y, double width, double height, const QVariantMap& state);
    Q_INVOKABLE void clearRect(double x, double y, double width, double height);
    Q_INVOKABLE void drawPath(const QVariantList& commands, bool fill, const QVariantMap& state);
    Q_INVOKABLE void drawText(const QString& text, double x, double y, bool fill, const QVariantMap& state);
    Q_INVOKABLE double measureText(const QString& text, const QVariantMap& state);
    Q_INVOKABLE void putPixels(
        const QByteArray& rgba,
        int width,
        int height,
        int x,
        int y,
        int sourceX,
        int sourceY,
        int sourceWidth,
        int sourceHeight);
    Q_INVOKABLE void drawPixels(
        const QByteArray& rgba,
        int width,
        int height,
        double x,
        double y,
        double targetWidth,
        double targetHeight,
        const QVariantMap& state);
    Q_INVOKABLE void drawCanvas(
        QObject* source,
        double x,
        double y,
        double targetWidth,
        double targetHeight,
        const QVariantMap& state);
    Q_INVOKABLE QByteArray getPixels(int x, int y, int width, int height) const;

signals:
    void resized();
    // Something was drawn: a view of the canvas may repaint.
    void changed();

private:
    const int number;
    QImage picture;
};

} // namespace v4script

#endif // V4SCRIPT_IMAGECANVAS_HPP
