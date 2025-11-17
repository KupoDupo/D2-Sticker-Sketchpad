import marker from "./marker.png";
import "./style.css";

document.body.innerHTML = `
<div class="sketchwrap">
  <div class="title">
    <h1>Sticker Sketchpad</h1>

    <canvas id="sketchpad"></canvas>
  </div>
  <div class="tools-container">
    <div id="tools">
      <div id="pens" class="tool-group">
        <h2>Markers</h2>
        <button id="thinBtn">Thin</button>
        <button id="thickBtn">Thick</button>
        <button id="highlightBtn">Highlight</button>
        <div id="colorBin"></div>
      </div>
      <div id="stickers" class="tool-group">
        <h2>Stickers</h2>
        <button id="flowerBtn">🌸 Flower</button>
        <button id="teddyBtn">🧸 Teddy</button>
        <button id="sparkleBtn">✨ Sparkle</button>
      </div>
      <div id="custom" class="tool-group">
        <h2>Custom Sticker</h2>
        <button id="customBtn">+ Custom</button>
        <div id="customBin"></div>
      </div>
      <div id="actions" class="tool-group">
        <h2>Actions</h2>
        <button id="undoBtn">Undo</button>
        <button id="redoBtn">Redo</button>
        <button id="clearBtn">Clear</button>
      </div>
      <div id="export" class="tool-group">
        <h2>Export</h2>
        <button id="exportBtn">Export PNG</button>
      </div>
    </div>
  </div>
</div>
`;

const canvas = document.getElementById("sketchpad") as HTMLCanvasElement;
canvas.width = 512;
canvas.height = 512;

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
  // third parameter is optional thickness for the marker
  new (x: number, y: number, thickness?: number): MarkerLine;
}

// SimpleMarkerLine is a straightforward implementation of MarkerLine that
// stores an array of Point internally.
class SimpleMarkerLine implements MarkerLine {
  private points: Point[];
  private thickness: number;
  private opacity: number;

  constructor(x: number, y: number, thickness = 1, opacity = 1) {
    this.points = [{ x, y }];
    this.thickness = thickness;
    this.opacity = opacity;
  }

  drag(x: number, y: number) {
    this.points.push({ x, y });
  }

  display(ctx: CanvasRenderingContext2D) {
    if (this.points.length === 0) return;

    ctx.lineWidth = this.thickness;
    ctx.globalAlpha = this.opacity;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (this.points.length === 1) {
      const p = this.points[0];
      ctx.beginPath();
      // radius scaled with thickness for visibility
      ctx.arc(p.x, p.y, Math.max(1, this.thickness), 0, Math.PI * 2);
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
// A ClearMarkerLine represents a "clear screen" command in the display list.
// When drawn it clears the entire canvas. It implements MarkerLine so it can
// live in the same display list as other MarkerLine objects; its `drag`
// implementation is a no-op.
class ClearMarkerLine implements MarkerLine {
  drag(_x: number, _y: number) {
    // no-op
  }
  display(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

const strokes: MarkerLine[] = [];

// Tool preview abstraction: an object that can draw itself to the canvas.
export interface ToolPreview {
  draw(ctx: CanvasRenderingContext2D): void;
}

// Global nullable preview reference — set by tool-moused listener
let preview: ToolPreview | null = null;

// MarkerPreview draws the provided `marker.png` centered at the given
// coordinates scaled to roughly match the marker thickness.
class MarkerPreview implements ToolPreview {
  constructor(
    private x: number,
    private y: number,
    private thickness: number,
    private img: HTMLImageElement,
  ) {}

  draw(ctx: CanvasRenderingContext2D) {
    const size = 32;
    const half = size / 2;
    ctx.save();
    ctx.globalAlpha = 0.9;
    // Adjust the image so the marker's tip appears at the pointer.
    // Tip-align: assume the tip is at the bottom-center of the image.
    const tipOffsetX = 15; // nudge right
    const tipOffsetY = 0; // nudge up
    if (this.img.complete) {
      // position top-left so bottom-center of image is at (this.x, this.y), then apply nudge
      const dx = this.x - half + tipOffsetX;
      const dy = this.y - size + tipOffsetY;
      ctx.drawImage(this.img, dx, dy, size, size);
    } else {
      // fallback: draw a simple asterisk-like preview scaled by thickness
      ctx.strokeStyle = "black";
      ctx.lineWidth = Math.max(1, this.thickness);
      const len = Math.max(6, size / 2);
      const cx = this.x + tipOffsetX; // center adjusted so tip aligns
      const cy = this.y + tipOffsetY;
      ctx.beginPath();
      // vertical
      ctx.moveTo(cx, cy - len);
      ctx.lineTo(cx, cy + len);
      // horizontal
      ctx.moveTo(cx - len, cy);
      ctx.lineTo(cx + len, cy);
      // diagonals
      ctx.moveTo(cx - len * 0.7, cy - len * 0.7);
      ctx.lineTo(cx + len * 0.7, cy + len * 0.7);
      ctx.moveTo(cx - len * 0.7, cy + len * 0.7);
      ctx.lineTo(cx + len * 0.7, cy - len * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Create an Image element from the imported marker URL and redraw when ready
const markerImg = new Image();
markerImg.src = marker;
markerImg.onload = () => canvas.dispatchEvent(new Event("drawing-changed"));

// Sticker implements MarkerLine to represent an emoji sticker on the canvas.
// It stores a single emoji character and a position; drag() updates the position.
class Sticker implements MarkerLine {
  private x: number;
  private y: number;

  constructor(x: number, y: number, private emoji: string) {
    this.x = x;
    this.y = y;
  }

  drag(x: number, y: number) {
    // reposition the sticker rather than tracking a path
    this.x = x;
    this.y = y;
  }

  display(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}

// EmojiPreview shows a preview of the selected emoji at the pointer.
class EmojiPreview implements ToolPreview {
  constructor(private x: number, private y: number, private emoji: string) {}

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}

const cursor = { active: false, x: 0, y: 0 };

const thinBtn = document.getElementById("thinBtn") as HTMLButtonElement;
const thickBtn = document.getElementById("thickBtn") as HTMLButtonElement;
const hlBtn = document.getElementById("highlightBtn") as HTMLButtonElement;
const colorBin = document.getElementById("colorBin") as HTMLDivElement;
const flowerBtn = document.getElementById("flowerBtn") as HTMLButtonElement;
const teddyBtn = document.getElementById("teddyBtn") as HTMLButtonElement;
const sparkleBtn = document.getElementById("sparkleBtn") as HTMLButtonElement;
const customBtn = document.getElementById("customBtn") as HTMLButtonElement;
const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement;
const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
const customBin = document.getElementById("customBin") as HTMLDivElement;

// currentThickness determines the thickness for the next line drawn
let currentThickness = 1;
let currentOpacity = 1;

// currentEmoji tracks the active emoji tool, or null if no emoji tool is selected
let currentEmoji: string | null = null;

// customStickers holds all custom stickers created by the user in this session
const customStickers: string[] = [];

// Helper function to create a button for a custom sticker
function createCustomStickerButton(sticker: string, index: number) {
  const btn = document.createElement("button");
  btn.textContent = sticker;
  btn.onclick = () => {
    currentEmoji = sticker;
    // disable all other buttons and enable others
    thinBtn.disabled = false;
    thickBtn.disabled = false;
    hlBtn.disabled = false;
    flowerBtn.disabled = false;
    teddyBtn.disabled = false;
    sparkleBtn.disabled = false;
    customBtn.disabled = false;
    // disable all custom sticker buttons except this one
    const customBtns = document.querySelectorAll("button[data-custom]");
    customBtns.forEach((b) => {
      (b as HTMLButtonElement).disabled =
        b.getAttribute("data-index") === String(index);
    });
  };
  btn.setAttribute("data-custom", "true");
  btn.setAttribute("data-index", String(index));
  // insert in custom row
  customBin.parentNode?.insertBefore(btn, customBin);
}

// Tool button wiring
thinBtn.onclick = () => {
  currentThickness = 1;
  currentOpacity = 1;
  currentEmoji = null;
  thinBtn.disabled = true;
  thickBtn.disabled = false;
  hlBtn.disabled = false;
  flowerBtn.disabled = false;
  teddyBtn.disabled = false;
  sparkleBtn.disabled = false;
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
thickBtn.onclick = () => {
  currentThickness = 4;
  currentOpacity = 1;
  currentEmoji = null;
  thickBtn.disabled = true;
  thinBtn.disabled = false;
  hlBtn.disabled = false;
  flowerBtn.disabled = false;
  teddyBtn.disabled = false;
  sparkleBtn.disabled = false;
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
hlBtn.onclick = () => {
  currentThickness = 10;
  currentOpacity = 0.3;
  currentEmoji = null;
  thickBtn.disabled = false;
  thinBtn.disabled = false;
  hlBtn.disabled = true;
  flowerBtn.disabled = false;
  teddyBtn.disabled = false;
  sparkleBtn.disabled = false;
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
flowerBtn.onclick = () => {
  currentEmoji = "🌸";
  flowerBtn.disabled = true;
  teddyBtn.disabled = false;
  sparkleBtn.disabled = false;
  thinBtn.disabled = false;
  thickBtn.disabled = false;
  hlBtn.disabled = false;
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
teddyBtn.onclick = () => {
  currentEmoji = "🧸";
  teddyBtn.disabled = true;
  flowerBtn.disabled = false;
  sparkleBtn.disabled = false;
  thinBtn.disabled = false;
  thickBtn.disabled = false;
  hlBtn.disabled = false;
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
sparkleBtn.onclick = () => {
  currentEmoji = "✨";
  sparkleBtn.disabled = true;
  flowerBtn.disabled = false;
  teddyBtn.disabled = false;
  thinBtn.disabled = false;
  thickBtn.disabled = false;
  customBtn.disabled = false;
  hlBtn.disabled = false;
  // disable all custom sticker buttons
  const customBtns = document.querySelectorAll("button[data-custom]");
  customBtns.forEach((b) => {
    (b as HTMLButtonElement).disabled = false;
  });
};
customBtn.onclick = () => {
  const input = prompt("Enter a custom sticker (emoji or text):", "😀");
  if (input && input.trim()) {
    customStickers.push(input.trim());
    // create and enable a new button for this custom sticker
    createCustomStickerButton(input.trim(), customStickers.length - 1);
  }
};
// default selection: thin
thinBtn.disabled = true;

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
  // If the last item is already a ClearMarkerLine, do nothing (coalesce)
  const last = strokes[strokes.length - 1];
  if (last instanceof ClearMarkerLine) return;

  // push a clear command onto the display list so it can be undone
  strokes.push(new ClearMarkerLine());
  // clear redo stack because new user input invalidates redo history
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
};

// Add Export button to the UI
exportBtn.onclick = () => {
  // Create a new offscreen canvas
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1024;
  exportCanvas.height = 1024;
  const exportCtx = exportCanvas.getContext("2d")!;
  // Scale context so 256x256 content fills 1024x1024
  exportCtx.save();
  exportCtx.scale(4, 4);
  // Draw all display list items (no preview)
  for (const stroke of strokes) {
    stroke.display(exportCtx);
  }
  exportCtx.restore();
  // Download as PNG
  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sketchpad-export.png";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, "image/png");
};

// Redraw handler — listens to custom "drawing-changed" events
canvas.addEventListener("drawing-changed", () => {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw each MarkerLine by delegating to its display method
  for (const stroke of strokes) {
    stroke.display(ctx);
  }

  // draw the preview on top (only when not actively drawing)
  if (!cursor.active && preview) {
    preview.draw(ctx);
  }
});

canvas.addEventListener("mousedown", (e) => {
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  cursor.active = true;
  // hide preview while drawing
  preview = null;

  // create either a marker line or an emoji sticker based on active tool
  if (currentEmoji) {
    strokes.push(new Sticker(cursor.x, cursor.y, currentEmoji));
  } else {
    strokes.push(
      createMarkerLine(cursor.x, cursor.y, currentThickness, currentOpacity),
    );
  }
  // clear redo stack because new user input invalidates redo history
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

canvas.addEventListener("mousemove", (e) => {
  // Notify listeners about tool-related mouse movement (preview, cursors, etc.)
  canvas.dispatchEvent(
    new CustomEvent("tool-moused", {
      detail: {
        x: e.offsetX,
        y: e.offsetY,
        active: cursor.active,
        thickness: currentThickness,
        opacity: currentOpacity,
      },
    }),
  );
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

// Listen for tool movement to update the preview object. We only show the
// preview when the user is not actively drawing (cursor.active === false).
canvas.addEventListener("tool-moused", (ev) => {
  const d = (ev as CustomEvent).detail as {
    x: number;
    y: number;
    active: boolean;
    thickness: number;
  };
  if (d.active) {
    // while drawing we hide the preview
    preview = null;
  } else {
    // create/update preview based on active tool
    if (currentEmoji) {
      preview = new EmojiPreview(d.x, d.y, currentEmoji);
    } else {
      preview = new MarkerPreview(d.x, d.y, d.thickness, markerImg);
    }
  }
  // redraw to show/hide preview
  canvas.dispatchEvent(new Event("drawing-changed"));
});

canvas.addEventListener("mouseup", () => {
  cursor.active = false;
});

// also stop drawing if the pointer leaves the canvas
canvas.addEventListener("mouseleave", () => {
  cursor.active = false;
  // hide preview when the pointer leaves canvas
  preview = null;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Add color picker button to the UI
const colorLabel = document.createElement("label");
colorLabel.textContent = " Color: ";
const colorInput = document.createElement("input");
colorInput.type = "color";
colorInput.value = "#000000";
colorInput.id = "colorPicker";
colorLabel.appendChild(colorInput);
colorBin.parentNode?.insertBefore(colorLabel, colorBin);

// Track current marker color
let currentColor = "#000000";
colorInput.oninput = (e) => {
  currentColor = (e.target as HTMLInputElement).value;
};

// Color-aware marker line implementation
class SimpleMarkerLineWithColor extends SimpleMarkerLine {
  private color: string;
  constructor(x: number, y: number, thickness = 1, opacity = 1, color: string) {
    super(x, y, thickness, opacity);
    this.color = color;
  }
  override display(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    super.display(ctx);
    ctx.restore();
  }
}

// Factory function for creating marker lines with the current color
function createMarkerLine(
  x: number,
  y: number,
  thickness: number,
  opacity = 1,
) {
  return new SimpleMarkerLineWithColor(x, y, thickness, opacity, currentColor);
}
