"use client";

import { useEffect, useRef, useState } from "react";

function Counter({ to, label, suffix = "" }: { to: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const start = performance.now();
        const dur = 1400;
        const tick = (now: number) => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(eased * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-bold text-gradient sm:text-5xl">
        {val}
        {suffix}
      </div>
      <div className="mt-2 text-sm text-slate-400">{label}</div>
    </div>
  );
}

export default function Stats() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="glass grid grid-cols-2 gap-8 p-10 sm:grid-cols-4">
        <Counter to={320} suffix="+" label="服务企业客户" />
        <Counter to={98} suffix="%" label="客户续约率" />
        <Counter to={1500} suffix="万" label="累计检索次数" />
        <Counter to={24} suffix="h" label="平均交付周期" />
      </div>
    </section>
  );
}
