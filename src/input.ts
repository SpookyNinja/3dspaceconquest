// Keyboard (WASD/arrows), mouse (hold left button to fly toward the cursor) and a floating touch joystick (SPEC §3.3).
export class InputState {
  keys = new Set<string>();
  mouseDown = false;
  mouseX = 0;
  mouseY = 0;
  touch: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
  private pressed = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && document.activeElement === document.body) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        if (!this.touch) this.touch = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
      } else if (e.button === 0) this.mouseDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.touch && e.pointerId === this.touch.id) {
        this.touch.x = e.clientX;
        this.touch.y = e.clientY;
      }
    });
    const up = (e: PointerEvent) => {
      if (this.touch && e.pointerId === this.touch.id) this.touch = null;
      if (e.pointerType !== 'touch' && e.button === 0) this.mouseDown = false;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True once per key press. */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPressed() {
    this.pressed.clear();
  }

  /** Screen-space move vector from keys or touch: x right, y up, length <= 1. */
  screenMove(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.touch) {
      const dx = this.touch.x - this.touch.sx, dy = this.touch.sy - this.touch.y;
      const l = Math.hypot(dx, dy);
      if (l > 8) {
        const m = Math.min(1, l / 60);
        x = (dx / l) * m;
        y = (dy / l) * m;
      }
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  get boost(): boolean {
    return this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
