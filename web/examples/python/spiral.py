# Drawing on the canvas of the page: the global JavaScript object
# `canvas` is reached through `js`, its 2D context works as in a browser.
import math

canvas = js.canvas
canvas.width = 480
canvas.height = 480
ctx = canvas.getContext("2d")
ctx.fillStyle = "#101820"
ctx.fillRect(0, 0, 480, 480)

for i in range(720):
    angle = i * 0.1
    radius = i * 0.3
    x = 240 + radius * math.cos(angle)
    y = 240 + radius * math.sin(angle)
    ctx.fillStyle = f"hsl({i % 360}, 90%, 60%)"
    ctx.beginPath()
    ctx.arc(x, y, 2 + i / 120, 0, 2 * math.pi)
    ctx.fill()

print("A spiral of 720 dots.")
