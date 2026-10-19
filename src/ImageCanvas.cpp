#include "v4script/ImageCanvas.hpp"

#include <QFile>
#include <QFontMetricsF>
#include <QJSEngine>
#include <QPainter>
#include <QPainterPath>
#include <QRegularExpression>

#include <cmath>
#include <cstring>

namespace v4script {

namespace {

const int DEFAULT_WIDTH = 300;
const int DEFAULT_HEIGHT = 150;
// Larger canvases would take gigabytes; programs get an error instead.
const int MAX_SIDE = 16384;
const double PI = 3.14159265358979323846;

QColor toColor(const QVariant& value)
{
    const QColor color = QColor::fromString(value.toString());
    return color.isValid() ? color : QColor(Qt::black);
}

QFont toFont(const QString& css)
{
    // "italic bold 16px sans-serif": the parts of the CSS shorthand that
    // matter for drawing.
    static const QRegularExpression pattern(R"(^\s*((?:(?:italic|oblique|bold|normal|\d00)\s+)*)([\d.]+)px\s+(.+)$)");
    QFont font("sans-serif");
    font.setPixelSize(10);
    const QRegularExpressionMatch match = pattern.match(css);
    if (match.hasMatch()) {
        const QString style = match.captured(1);
        font.setItalic(style.contains("italic") || style.contains("oblique"));
        font.setBold(style.contains("bold") || style.contains("700") || style.contains("800") || style.contains("900"));
        font.setPixelSize(qMax(1, qRound(match.captured(2).toDouble())));
        QString family = match.captured(3).section(',', 0, 0).trimmed();
        family.remove('"').remove('\'');
        if (family == "monospace") {
            font.setStyleHint(QFont::Monospace);
        } else if (family == "serif") {
            font.setStyleHint(QFont::Serif);
        } else if (family == "sans-serif") {
            font.setStyleHint(QFont::SansSerif);
        }
        font.setFamily(family);
    }
    return font;
}

QPen toPen(const QVariantMap& state)
{
    QPen pen(toColor(state.value("strokeStyle")));
    pen.setWidthF(qMax(0.0, state.value("lineWidth").toDouble()));
    const QString cap = state.value("lineCap").toString();
    const Qt::PenCapStyle squareOrFlat = cap == "square" ? Qt::SquareCap : Qt::FlatCap;
    pen.setCapStyle(cap == "round" ? Qt::RoundCap : squareOrFlat);
    const QString join = state.value("lineJoin").toString();
    const Qt::PenJoinStyle bevelOrMiter = join == "bevel" ? Qt::BevelJoin : Qt::MiterJoin;
    pen.setJoinStyle(join == "round" ? Qt::RoundJoin : bevelOrMiter);
    return pen;
}

// Angles of an HTML canvas go clockwise in radians, those of Qt
// counterclockwise in degrees.
void addArc(QPainterPath& path, const QVariantMap& command, bool newSubpath)
{
    const double x = command.value("x").toDouble();
    const double y = command.value("y").toDouble();
    const double radius = command.value("radius").toDouble();
    const double start = command.value("start").toDouble();
    const double end = command.value("end").toDouble();
    const bool anticlockwise = command.value("anticlockwise").toBool();
    const double fullCircle = 2 * PI;
    double sweep = anticlockwise ? start - end : end - start;
    if (sweep >= fullCircle) {
        sweep = fullCircle;
    } else {
        sweep = std::fmod(sweep, fullCircle);
        if (sweep < 0) {
            sweep += fullCircle;
        }
    }
    const QRectF bounds(x - radius, y - radius, 2 * radius, 2 * radius);
    const double qtStart = -start * 180 / PI;
    const double qtSweep = (anticlockwise ? sweep : -sweep) * 180 / PI;
    if (newSubpath) {
        path.arcMoveTo(bounds, qtStart);
    }
    path.arcTo(bounds, qtStart, qtSweep);
}

QPainterPath toPath(const QVariantList& commands)
{
    QPainterPath path;
    bool open = false;
    for (const QVariant& item : commands) {
        const QVariantMap command = item.toMap();
        const QString op = command.value("op").toString();
        const QPointF point(command.value("x").toDouble(), command.value("y").toDouble());
        if (op == "M") {
            path.moveTo(point);
            open = true;
        } else if (op == "L") {
            if (open) {
                path.lineTo(point);
            } else {
                path.moveTo(point);
                open = true;
            }
        } else if (op == "R") {
            path.addRect(point.x(), point.y(), command.value("width").toDouble(), command.value("height").toDouble());
            open = false;
        } else if (op == "A") {
            addArc(path, command, !open);
            open = true;
        } else if (op == "Q") {
            if (!open) {
                path.moveTo(command.value("cx").toDouble(), command.value("cy").toDouble());
                open = true;
            }
            path.quadTo(command.value("cx").toDouble(), command.value("cy").toDouble(), point.x(), point.y());
        } else if (op == "C") {
            if (!open) {
                path.moveTo(command.value("c1x").toDouble(), command.value("c1y").toDouble());
                open = true;
            }
            path.cubicTo(
                command.value("c1x").toDouble(),
                command.value("c1y").toDouble(),
                command.value("c2x").toDouble(),
                command.value("c2y").toDouble(),
                point.x(),
                point.y());
        } else if (op == "Z") {
            path.closeSubpath();
        }
    }
    return path;
}

int nextCanvasNumber = 1;

} // namespace

ImageCanvas::ImageCanvas(QObject* parent) :
        QObject(parent),
        number(nextCanvasNumber++)
{
    resize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
}

QJSValue ImageCanvas::jsValue(QJSEngine* engine)
{
    // canvas.js makes one canvas object per native canvas and engine and
    // keeps it in the engine: no value of the engine outlives it here.
    QJSValue global = engine->globalObject();
    QJSValue make = global.property("__v4scriptCanvas");
    if (!make.isCallable()) {
        QFile file(":/v4script/js/host/canvas.js");
        if (!file.open(QIODevice::ReadOnly)) {
            qWarning("v4script: canvas.js is missing from the resources");
            return {};
        }
        make = engine->evaluate(QString::fromUtf8(file.readAll()), ":/v4script/js/host/canvas.js");
        if (!make.isCallable()) {
            qWarning("v4script: canvas.js failed: %s", qPrintable(make.toString()));
            return {};
        }
        engine
            ->evaluate("(function (global, make) { "
                       "Object.defineProperty(global, '__v4scriptCanvas', { value: make, configurable: true }); })")
            .call({ global, make });
    }
    QJSEngine::setObjectOwnership(this, QJSEngine::CppOwnership);
    return make.call({ engine->newQObject(this), number });
}

int ImageCanvas::getWidth() const
{
    return picture.width();
}

int ImageCanvas::getHeight() const
{
    return picture.height();
}

void ImageCanvas::setWidth(int width)
{
    resize(width, picture.height());
}

void ImageCanvas::setHeight(int height)
{
    resize(picture.width(), height);
}

void ImageCanvas::resize(int width, int height)
{
    if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) {
        QJSEngine* engine = qjsEngine(this);
        if (!picture.isNull() && engine != nullptr) {
            engine->throwError(QJSValue::RangeError, QString("Wrong canvas size %1 x %2").arg(width).arg(height));
            return;
        }
        width = qBound(1, width, MAX_SIDE);
        height = qBound(1, height, MAX_SIDE);
    }
    // A new size clears the canvas, as in HTML - even the same size.
    picture = QImage(width, height, QImage::Format_RGBA8888);
    picture.fill(Qt::transparent);
    emit resized();
    emit changed();
}

QImage ImageCanvas::image() const
{
    return picture;
}

void ImageCanvas::fillRect(double x, double y, double width, double height, const QVariantMap& state)
{
    QPainter painter(&picture);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    painter.fillRect(QRectF(x, y, width, height).normalized(), toColor(state.value("fillStyle")));
    emit changed();
}

void ImageCanvas::strokeRect(double x, double y, double width, double height, const QVariantMap& state)
{
    QPainter painter(&picture);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    painter.setPen(toPen(state));
    painter.drawRect(QRectF(x, y, width, height).normalized());
    emit changed();
}

void ImageCanvas::clearRect(double x, double y, double width, double height)
{
    QPainter painter(&picture);
    painter.setCompositionMode(QPainter::CompositionMode_Source);
    painter.fillRect(QRectF(x, y, width, height).normalized(), Qt::transparent);
    emit changed();
}

void ImageCanvas::drawPath(const QVariantList& commands, bool fill, const QVariantMap& state)
{
    QPainter painter(&picture);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    const QPainterPath path = toPath(commands);
    if (fill) {
        painter.fillPath(path, toColor(state.value("fillStyle")));
    } else {
        painter.strokePath(path, toPen(state));
    }
    emit changed();
}

void ImageCanvas::drawText(const QString& text, double x, double y, bool fill, const QVariantMap& state)
{
    const QFont font = toFont(state.value("font").toString());
    const QFontMetricsF metrics(font);
    const double width = metrics.horizontalAdvance(text);
    const QString align = state.value("textAlign").toString();
    if (align == "center") {
        x -= width / 2;
    } else if (align == "right" || align == "end") {
        x -= width;
    }
    const QString baseline = state.value("textBaseline").toString();
    if (baseline == "top" || baseline == "hanging") {
        y += metrics.ascent();
    } else if (baseline == "middle") {
        y += (metrics.ascent() - metrics.descent()) / 2;
    } else if (baseline == "bottom" || baseline == "ideographic") {
        y -= metrics.descent();
    }
    QPainter painter(&picture);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::TextAntialiasing);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    if (fill) {
        painter.setFont(font);
        painter.setPen(toColor(state.value("fillStyle")));
        painter.drawText(QPointF(x, y), text);
    } else {
        QPainterPath path;
        path.addText(QPointF(x, y), font, text);
        painter.strokePath(path, toPen(state));
    }
    emit changed();
}

double ImageCanvas::measureText(const QString& text, const QVariantMap& state)
{
    return QFontMetricsF(toFont(state.value("font").toString())).horizontalAdvance(text);
}

void ImageCanvas::putPixels(
    const QByteArray& rgba,
    int width,
    int height,
    int x,
    int y,
    int sourceX,
    int sourceY,
    int sourceWidth,
    int sourceHeight)
{
    if (width <= 0 || height <= 0 || rgba.size() < static_cast<qsizetype>(width) * height * 4) {
        return;
    }
    // The dirty rectangle in the image data, then its place on the canvas:
    // pixels are replaced, not blended.
    const QRect source = QRect(sourceX, sourceY, sourceWidth, sourceHeight).normalized() & QRect(0, 0, width, height);
    const QRect target = source.translated(x, y) & picture.rect();
    if (target.isEmpty()) {
        return;
    }
    const char* const data = rgba.constData();
    for (int row = target.top(); row <= target.bottom(); ++row) {
        const char* from = data + (static_cast<qsizetype>(row - y) * width + (target.left() - x)) * 4;
        uchar* to = picture.scanLine(row) + static_cast<qsizetype>(target.left()) * 4;
        std::memcpy(to, from, static_cast<size_t>(target.width()) * 4);
    }
    emit changed();
}

void ImageCanvas::drawPixels(
    const QByteArray& rgba,
    int width,
    int height,
    double x,
    double y,
    double targetWidth,
    double targetHeight,
    const QVariantMap& state)
{
    if (width <= 0 || height <= 0 || rgba.size() < static_cast<qsizetype>(width) * height * 4) {
        return;
    }
    // QByteArray holds char and QImage takes uchar: the bytes are the same.
    const QImage
        image(reinterpret_cast<const uchar*>(rgba.constData()), width, height, width * 4, QImage::Format_RGBA8888);
    QPainter painter(&picture);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    // Scaled up pixels stay sharp: retro graphics are drawn small and enlarged.
    painter.drawImage(QRectF(x, y, targetWidth, targetHeight), image);
    emit changed();
}

void ImageCanvas::drawCanvas(
    QObject* source,
    double x,
    double y,
    double targetWidth,
    double targetHeight,
    const QVariantMap& state)
{
    const auto* canvas = qobject_cast<ImageCanvas*>(source);
    if (canvas == nullptr) {
        return;
    }
    const QImage image = canvas->picture;
    QPainter painter(&picture);
    painter.setOpacity(state.value("globalAlpha").toDouble());
    painter.drawImage(QRectF(x, y, targetWidth, targetHeight), image);
    emit changed();
}

QByteArray ImageCanvas::getPixels(int x, int y, int width, int height) const
{
    if (width <= 0 || height <= 0) {
        return {};
    }
    // Outside the canvas the pixels are transparent black.
    QByteArray result(static_cast<qsizetype>(width) * height * 4, '\0');
    const QRect area = QRect(x, y, width, height) & picture.rect();
    for (int row = area.top(); row <= area.bottom() && !area.isEmpty(); ++row) {
        const uchar* from = picture.constScanLine(row) + static_cast<qsizetype>(area.left()) * 4;
        char* to = result.data() + (static_cast<qsizetype>(row - y) * width + (area.left() - x)) * 4;
        std::memcpy(to, from, static_cast<size_t>(area.width()) * 4);
    }
    return result;
}

} // namespace v4script
