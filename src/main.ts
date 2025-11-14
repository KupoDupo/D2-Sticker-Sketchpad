import "./style.css";

document.body.innerHTML = `
  <h1>Sticker Sketchpad</h1>

  <div id="sketch-wrap">
    <canvas id="sketchpad" style="border:1px solid black;"></canvas>
    <button style="margin-top:8px;" id="clearBtn">Clear</button>
  </div>
`;

const canvas = document.getElementById("sketchpad") as HTMLCanvasElement;
canvas.width = 256;
canvas.height = 256;
document.body.append(canvas);

const ctx = canvas.getContext("2d")!;

type Point = { x: number; y: number };

// strokes is an array of strokes; each stroke is an array of points
const strokes: Point[][] = [];

const cursor = { active: false, x: 0, y: 0 };

const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
clearBtn.onclick = () => {
  // clear model and view, then notify observers
  strokes.length = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dispatchEvent(new Event("drawing-changed"));
};

// Redraw handler — listens to custom "drawing-changed" events
canvas.addEventListener("drawing-changed", () => {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw each stroke
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
  ctx.fillStyle = "black";

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      // single point — draw a small dot
      const p = stroke[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
});

canvas.addEventListener("mousedown", (e) => {
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  cursor.active = true;

  // start a new stroke with the initial point
  strokes.push([{ x: cursor.x, y: cursor.y }]);
  canvas.dispatchEvent(new Event("drawing-changed"));
});

canvas.addEventListener("mousemove", (e) => {
  if (cursor.active) {
    // append point to current stroke
    const pt = { x: e.offsetX, y: e.offsetY };
    const current = strokes[strokes.length - 1];
    if (current) {
      current.push(pt);
      // update cursor position
      cursor.x = pt.x;
      cursor.y = pt.y;

      // notify observers that the drawing model changed
      canvas.dispatchEvent(new Event("drawing-changed"));
    }
  }
});

canvas.addEventListener("mouseup", () => {
  cursor.active = false;
});

// also stop drawing if the pointer leaves the canvas
canvas.addEventListener("mouseleave", () => {
  cursor.active = false;
});
