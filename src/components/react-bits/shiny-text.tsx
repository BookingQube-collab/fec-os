"use client";

/**
 * Official React Bits ShinyText look (https://reactbits.dev/r/ShinyText-TS-TW.json),
 * implemented with CSS animation + IntersectionObserver so idle pages do not run
 * per-frame JS (motion useAnimationFrame) that blocks pointer input delay / INP.
 */
import React, { useEffect, useRef, useState } from "react";

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: "left" | "right";
  delay?: number;
}

const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = "",
  color = "#b5b5b5",
  shineColor = "#ffffff",
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = "left",
  delay = 0,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) {
      setInView(false);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { rootMargin: "48px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  const animate = !disabled && inView && !(pauseOnHover && hovered);
  const durationSec = Math.max(0.35, speed);
  const delaySec = Math.max(0, delay);

  const style: React.CSSProperties = {
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: disabled ? color : "transparent",
    color: disabled ? color : undefined,
    // Compositor-friendly custom props for the keyframes in styles.css
    ["--fec-shiny-duration" as string]: `${durationSec}s`,
    ["--fec-shiny-delay" as string]: `${delaySec}s`,
  };

  return (
    <span
      ref={ref}
      className={`block w-full max-w-full min-w-0 whitespace-normal [overflow-wrap:normal] [word-break:normal] ${
        animate ? "fec-shiny-text" : ""
      } ${yoyo && animate ? "fec-shiny-text-yoyo" : ""} ${
        direction === "right" && animate ? "fec-shiny-text-reverse" : ""
      } ${className}`}
      style={style}
      onMouseEnter={pauseOnHover ? () => setHovered(true) : undefined}
      onMouseLeave={pauseOnHover ? () => setHovered(false) : undefined}
    >
      {text}
    </span>
  );
};

export default ShinyText;
