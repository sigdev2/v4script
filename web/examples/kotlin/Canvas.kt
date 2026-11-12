// Drawing on the canvas of the page through JavaScript (js.JsValue).
import kotlin.math.PI
import kotlin.random.Random

val canvas = Js.global()["canvas"]
val ctx = canvas.call("getContext", "2d")
val width = canvas["width"].asDouble()
val height = canvas["height"].asDouble()
ctx["fillStyle"] = "#101828"
ctx.call("fillRect", 0, 0, width, height)
val random = Random(7)
for (i in 0 until 12) {
    val x = random.nextDouble() * width
    val y = random.nextDouble() * height
    val radius = 10 + random.nextInt(30)
    ctx["fillStyle"] = "hsla(${i * 30}, 80%, 60%, 0.7)"
    ctx.call("beginPath")
    ctx.call("arc", x, y, radius, 0, 2 * PI)
    ctx.call("fill")
}
ctx["fillStyle"] = "white"
ctx["font"] = "20px sans-serif"
ctx.call("fillText", "Kotlin on the canvas", 20, 30)
println("12 circles drawn")
