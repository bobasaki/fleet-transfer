"use client";

import { useEffect, useState } from "react";

/**
 * Animated launch splash for Fleet Transfer.
 * Drop-in: renders a full-screen overlay that plays the scan-line reveal once,
 * then fades out. Self-contained (no external CSS). Respects prefers-reduced-motion.
 *
 * Usage in app/layout.tsx (inside <body>, above {children}):
 *   import SplashScreen from "./components/SplashScreen";
 *   ...
 *   <SplashScreen />
 *   {children}
 *
 * Props:
 *   minDuration — how long the splash stays before fading (ms). Default 2500.
 *   oncePerSession — if true, only shows on the first load of a browser session.
 */
export default function SplashScreen({
  minDuration = 2500,
  oncePerSession = false,
}: {
  minDuration?: number;
  oncePerSession?: boolean;
}) {
  const [gone, setGone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (oncePerSession && sessionStorage.getItem("fleet-splash-seen")) {
      setGone(true);
      return;
    }
    sessionStorage.setItem("fleet-splash-seen", "1");
    const t1 = setTimeout(() => setHide(true), minDuration);
    const t2 = setTimeout(() => setGone(true), minDuration + 550);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [minDuration, oncePerSession]);

  if (gone) return null;

  return (
    <div className={`ftSplash play${hide ? " hide" : ""}`} role="status" aria-label="Fleet Transfer">
      <div className="ftLogo">
        <div className="ftScan" />
        <svg viewBox="0 0 1000 1000" aria-hidden="true">
          <g className="ftTicks" strokeWidth="20" strokeLinecap="round" fill="none">
            <path d="M150,250 L150,205 L195,205" />
            <path d="M850,750 L850,795 L805,795" />
          </g>
          <g transform="translate(170 170) scale(0.66)">
            <path
              className="ftDim"
              d="M530,250 L780,500 L530,750"
              fill="none"
              strokeWidth="114"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              className="ftBright"
              d="M530,250 L780,500 L530,750"
              fill="none"
              strokeWidth="114"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect className="ftBar" x="190" y="471" width="530" height="58" rx="12" />
          </g>
        </svg>
      </div>

      <div className="ftWord">
        <div className="ftName">fleet</div>
        <div className="ftSub">Transfer&nbsp;Log</div>
      </div>

      <div className="ftLoader" />

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ftSplash{
  position:fixed; inset:0; z-index:9999;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:radial-gradient(120% 120% at 50% 38%, #1F5FAE 0%, #174A8B 58%, #0F3566 100%);
  transition:opacity .5s ease;
  --sweep:1.35s; --sweep-delay:.42s;
  font-family:var(--font-sans, 'Instrument Sans', system-ui, sans-serif);
}
.ftSplash.hide{ opacity:0; pointer-events:none; }
.ftSplash::before{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(0deg, transparent 0 46px, rgba(255,255,255,.025) 46px 47px);
  -webkit-mask:radial-gradient(75% 60% at 50% 42%, #000 30%, transparent 78%);
          mask:radial-gradient(75% 60% at 50% 42%, #000 30%, transparent 78%);
}
.ftLogo{ position:relative; width:min(40vw,190px); aspect-ratio:1; }
.ftLogo svg{ display:block; width:100%; height:100%; overflow:visible; }
.ftDim{ stroke:rgba(255,255,255,.16); }
.ftBright{ stroke:#fff; clip-path:inset(0 0 100% 0); }
.play .ftBright{ animation:ftReveal var(--sweep) cubic-bezier(.55,0,.35,1) var(--sweep-delay) forwards; }
@keyframes ftReveal{ to{ clip-path:inset(0 0 0% 0); } }
.ftBar{ fill:#fff; opacity:0; }
.play .ftBar{ animation:ftBar .5s ease-out calc(var(--sweep-delay) + var(--sweep)*.62) forwards; }
@keyframes ftBar{
  0%{ opacity:0; filter:drop-shadow(0 0 0 rgba(255,255,255,0)); }
  40%{ opacity:1; filter:drop-shadow(0 0 14px rgba(230,240,255,.95)); }
  100%{ opacity:1; filter:drop-shadow(0 0 6px rgba(230,240,255,.45)); }
}
.ftScan{
  position:absolute; left:-12%; width:124%; height:5px; top:0; border-radius:3px; opacity:0;
  background:linear-gradient(90deg, transparent, #e6f0ff 18%, #fff 50%, #e6f0ff 82%, transparent);
  box-shadow:0 0 18px 3px rgba(225,236,255,.85), 0 0 42px 8px rgba(200,220,255,.45);
}
.play .ftScan{ animation:ftSweep var(--sweep) cubic-bezier(.55,0,.35,1) var(--sweep-delay) forwards; }
@keyframes ftSweep{
  0%{ top:-4%; opacity:0; } 8%{ opacity:1; } 92%{ opacity:1; } 100%{ top:104%; opacity:0; }
}
.ftTicks{ stroke:rgba(255,255,255,.42); opacity:0; }
.play .ftTicks{ animation:ftFade .5s ease-out .12s forwards; }
.ftWord{ margin-top:30px; text-align:center; opacity:0; transform:translateY(10px); }
.play .ftWord{ animation:ftRise .6s cubic-bezier(.16,1,.3,1) calc(var(--sweep-delay) + var(--sweep)*.78) forwards; }
.ftName{ font-size:clamp(34px,8vw,48px); font-weight:800; letter-spacing:.02em; text-transform:uppercase; color:#fff; line-height:1; }
.ftSub{ margin-top:14px; font-size:clamp(13px,3.2vw,16px); font-weight:600; letter-spacing:.38em; text-transform:uppercase; color:rgba(255,255,255,.58); }
.ftLoader{
  position:absolute; bottom:max(8%,34px); left:50%; transform:translateX(-50%);
  width:128px; height:3px; border-radius:2px; overflow:hidden; background:rgba(255,255,255,.12); opacity:0;
}
.play .ftLoader{ animation:ftFade .5s ease-out calc(var(--sweep-delay) + var(--sweep)*.85) forwards; }
.ftLoader::after{
  content:""; position:absolute; inset:0; width:42%;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent);
  animation:ftSlide 1.15s ease-in-out infinite;
}
@keyframes ftSlide{ 0%{ transform:translateX(-120%); } 100%{ transform:translateX(330%); } }
@keyframes ftFade{ to{ opacity:1; } }
@keyframes ftRise{ to{ opacity:1; transform:translateY(0); } }
@media (prefers-reduced-motion:reduce){
  .ftBright{ clip-path:none; animation:none; } .ftScan,.ftLoader{ display:none; }
  .ftBar,.ftWord,.ftTicks{ opacity:1; transform:none; animation:none; }
}
`;
