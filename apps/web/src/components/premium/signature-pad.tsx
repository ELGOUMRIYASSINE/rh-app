"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@yghr/ui";

export interface SignaturePadHandle {
  /** PNG data URL of the drawing (transparent background), or null when empty. */
  toDataURL(): string | null;
  clear(): void;
}

/** Draw a signature with a finger, stylus or mouse. Smooth strokes, high-DPI, transparent PNG export. */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const setup = () => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = c.getBoundingClientRect();
    c.width = width * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0B2422";
    ctx.lineWidth = 2.4;
  };
  useEffect(() => {
    setup();
    const onResize = () => { if (empty) setup(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0B2422";
    ctx.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    // pressure-aware width for pens, constant for mouse/finger
    ctx.lineWidth = e.pointerType === "pen" && e.pressure > 0 ? 1.2 + e.pressure * 2.8 : 2.4;
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange?.(true);
  };

  useImperativeHandle(ref, () => ({
    toDataURL: () => (empty ? null : canvas.current!.toDataURL("image/png")),
    clear,
  }));

  return (
    <div>
      <div className="relative overflow-hidden rounded-[12px] border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          className="block h-44 w-full cursor-crosshair touch-none"
          aria-label="Zone de signature : tracez votre signature"
          role="img"
        />
        {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-[#66736F]">Signez ici avec le doigt, le stylet ou la souris</div>}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-[#E6E8E3]" />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={clear} disabled={empty}><Eraser /> Effacer</Button>
      </div>
    </div>
  );
});
