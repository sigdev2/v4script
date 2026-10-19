// Drawing on the canvas of the page: the global object `canvas` with a
// 2D context, as in a browser.
canvas.width = 480;
canvas.height = 320;
const ctx = canvas.getContext('2d');
const sky = ctx.createLinearGradient(0, 0, 0, 320);
sky.addColorStop(0, '#0b1d3a');
sky.addColorStop(1, '#3d6db5');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, 480, 320);

for (let i = 0; i < 12; i++) {
    const x = 40 + i * 37, height = 60 + ((i * 53) % 110);
    ctx.fillStyle = `hsl(${210 + i * 4}, 25%, ${18 + (i % 3) * 6}%)`;
    ctx.fillRect(x, 320 - height, 32, height);
    ctx.fillStyle = '#ffd86b';
    for (let y = 320 - height + 8; y < 310; y += 14)
        for (let wx = x + 5; wx < x + 28; wx += 9)
            if ((wx * 7 + y * 3) % 5 < 3)
                ctx.fillRect(wx, y, 4, 6);
}
ctx.fillStyle = '#fff6d0';
ctx.beginPath();
ctx.arc(400, 60, 26, 0, Math.PI * 2);
ctx.fill();
ctx.font = 'bold 18px sans-serif';
ctx.fillText('A city at night', 16, 28);
