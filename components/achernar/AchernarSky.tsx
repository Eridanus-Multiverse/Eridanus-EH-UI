import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";

export default function AchernarSky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<any[]>([]);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    // inject river glow CSS
    if (!document.getElementById("demo-sky-css")) {
      const style = document.createElement("style");
      style.id = "demo-sky-css";
      style.textContent = `
        .demo-river-glow {
          position: fixed; bottom: -20%; left: -10%; width: 120%; height: 45%;
          background: radial-gradient(ellipse at 50% 100%, rgba(14,50,100,0.30) 0%, transparent 70%);
          z-index: 0; pointer-events: none;
          animation: demo-river-breath 8s ease-in-out infinite;
        }
        @keyframes demo-river-breath {
          0%, 100% { opacity: 0.55; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-10px); }
        }
      `;
      document.head.appendChild(style);
    }

    // create canvas
    const container = containerRef.current;
    if (!container) return;
    const cvs = document.createElement("canvas");
    cvs.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;";
    container.appendChild(cvs);
    canvasRef.current = cvs;
    const ctx = cvs.getContext("2d")!;

    // create river glow
    const river = document.createElement("div");
    river.className = "demo-river-glow";
    document.body.appendChild(river);


    function resize() {
      cvs.width = window.innerWidth;
      cvs.height = window.innerHeight;
      const stars: any[] = [];
      const count = Math.floor((cvs.width * cvs.height) / 9000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * cvs.width,
          y: Math.random() * cvs.height,
          r: Math.random() * 1.3 + 0.2,
          a: Math.random() * 0.5 + 0.15,
          p: Math.random() * Math.PI * 2,
          s: Math.random() * 0.005 + 0.002,
          c: Math.random() > 0.9 ? "212,165,116" : "200,216,240",
        });
      }
      starsRef.current = stars;
    }

    let paused = false;
    function drawStars(t: number) {
      if (paused) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      for (const s of starsRef.current) {
        const tw = Math.sin(t * s.s + s.p) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.c},${s.a * tw})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(drawStars);
    }
    function onVisChange() {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(rafRef.current);
      } else {
        paused = false;
        rafRef.current = requestAnimationFrame(drawStars);
      }
    }
    document.addEventListener("visibilitychange", onVisChange);

    let alive = true;

    window.addEventListener("resize", resize);
    resize();
    rafRef.current = requestAnimationFrame(drawStars);

    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("resize", resize);
      alive = false;
      cancelAnimationFrame(rafRef.current);
      cvs.remove();
      river.remove();
    };
  }, []);

  if (Platform.OS !== "web") {
    return <View style={styles.fallback} pointerEvents="none" />;
  }

  return <div ref={containerRef as any} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" } as any} />;
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#050c1f",
  },
});
