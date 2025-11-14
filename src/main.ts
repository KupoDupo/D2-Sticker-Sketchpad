import "./style.css";

document.body.innerHTML = `
  <h1>Sticker Sketchpad</h1>

  <div id="sketch-wrap">
    <canvas id="sketchpad" style="border:1px solid black;"></canvas>
    <div style="margin-top:8px;">
      <button id="undoBtn">Undo</button>
      <button id="redoBtn">Redo</button>
      <button id="clearBtn">Clear</button>
    </div>
  </div>
`;

const canvas = document.getElementById("sketchpad") as HTMLCanvasElement;
canvas.width = 256;
canvas.height = 256;
document.body.append(canvas);

const ctx = canvas.getContext("2d")!;

type Point = { x: number; y: number };
// MarkerLine describes an object that represents a drawable marker line.
// It supports being constructed with an initial point, being incrementally
// extended with drag(x,y) calls, and being displayed via display(ctx).
export interface MarkerLine {
  drag(x: number, y: number): void;
  display(ctx: CanvasRenderingContext2D): void;
}

// Optional constructor signature type for MarkerLine implementations.
export interface MarkerLineConstructor {
  new (x: number, y: number): MarkerLine;
}

// SimpleMarkerLine is a straightforward implementation of MarkerLine that
// stores an array of Point internally.
class SimpleMarkerLine implements MarkerLine {
  private points: Point[];

  constructor(x: number, y: number) {
    this.points = [{ x, y }];
  }

  drag(x: number, y: number) {
    this.points.push({ x, y });
  }

  display(ctx: CanvasRenderingContext2D) {
    if (this.points.length === 0) return;

    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";
    ctx.fillStyle = "black";

    if (this.points.length === 1) {
      const p = this.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
  }
}

// strokes is an array of MarkerLine objects
const strokes: MarkerLine[] = [];

const cursor = { active: false, x: 0, y: 0 };

const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement;
const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;

// redoStack holds MarkerLine objects that were undone so they can be redone
const redoStack: MarkerLine[] = [];

undoBtn.onclick = () => {
  if (strokes.length === 0) return;
  // pop the most recent stroke from strokes and push it to redoStack
  const s = strokes.pop();
  if (s) redoStack.push(s);
  // notify to redraw
  canvas.dispatchEvent(new Event("drawing-changed"));
};

redoBtn.onclick = () => {
  if (redoStack.length === 0) return;
  // pop from redoStack and push back to strokes
  const s = redoStack.pop();
  if (s) strokes.push(s);
  canvas.dispatchEvent(new Event("drawing-changed"));
};

clearBtn.onclick = () => {
  // clear model and view, then notify observers
  strokes.length = 0;
  redoStack.length = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dispatchEvent(new Event("drawing-changed"));
};

// Redraw handler — listens to custom "drawing-changed" events
canvas.addEventListener("drawing-changed", () => {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw each MarkerLine by delegating to its display method
  for (const stroke of strokes) {
    stroke.display(ctx);
  }
});

canvas.addEventListener("mousedown", (e) => {
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  cursor.active = true;

  // start a new stroke with the initial point
  strokes.push(new SimpleMarkerLine(cursor.x, cursor.y));
  // clear redo stack because new user input invalidates redo history
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

canvas.addEventListener("mousemove", (e) => {
  if (cursor.active) {
    // append point to current stroke
    const pt = { x: e.offsetX, y: e.offsetY };
    const current = strokes[strokes.length - 1];
    if (current) {
      current.drag(pt.x, pt.y);
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
