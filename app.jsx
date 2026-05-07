// app.jsx — Dew condensation playground. Wires Engine + Tweaks + scene picker + camera.
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tool": "wipe",
  "brushSize": 32,
  "fogDensity": 0.55,
  "fogBlur": 12,
  "density": 10,
  "dropSize": 1.0,
  "gravity": 0.12,
  "gravityX": 0,
  "slideThreshold": 8,
  "refogSpeed": 0.2,
  "accumulation": 0.15,
  "wipeBuildup": 0.7,
  "mistVariation": 0.5,
  "tint": "#7a98b8",
  "tintAmount": 0.0,
  "tiltEnabled": false,
  "sceneId": "morning"
}/*EDITMODE-END*/;

const SCENES = {
  dawn:    { id: 'dawn',    label: 'Dawn',    kind: 'gradient', stops: [[0, '#ffd9b1'], [0.45, '#c9a8c0'], [1, '#5d6f8e']], hueAccent: 30 },
  morning: { id: 'morning', label: 'Morning', kind: 'gradient', stops: [[0, '#cfd9e3'], [0.5, '#a9b9c9'], [1, '#7e8ea0']], hueAccent: 210 },
  forest:  { id: 'forest',  label: 'Forest',  kind: 'gradient', stops: [[0, '#46604a'], [0.5, '#324a3a'], [1, '#1f3326']], hueAccent: 130 },
  city:    { id: 'city',    label: 'City',    kind: 'gradient', stops: [[0, '#1a1d2a'], [0.4, '#3a3050'], [0.8, '#a35f6a'], [1, '#d8a070']], hueAccent: 320 },

};

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scene, setScene] = useState({ kind: 'gradient', ...SCENES.dawn });
  const [cameraOn, setCameraOn] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const videoRef = useRef(null);
  const captureRef = useRef(null);
  const hideTimer = useRef(null);

  // Auto-hide chrome after inactivity
  useEffect(() => {
    const reveal = () => {
      setChromeVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setChromeVisible(false), 3500);
    };
    reveal();
    window.addEventListener('mousemove', reveal);
    window.addEventListener('touchstart', reveal);
    return () => {
      window.removeEventListener('mousemove', reveal);
      window.removeEventListener('touchstart', reveal);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Resolve scene
  useEffect(() => {
    const sId = t.sceneId;
    if (cameraOn) return; // camera takes over
    if (sId === 'custom' && customImageUrl) {
      loadImage(customImageUrl).then(img => {
        setScene({ kind: 'image', img });
      }).catch(() => {});
      return;
    }
    const s = SCENES[sId];
    if (!s) return;
    if (s.kind === 'image') {
      loadImage(s.src).then(img => setScene({ kind: 'image', img })).catch(() => {});
    } else {
      setScene({ kind: 'gradient', ...s });
    }
  }, [t.sceneId, customImageUrl, cameraOn]);

  // Camera
  useEffect(() => {
    if (!cameraOn) {
      const v = videoRef.current;
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach(tr => tr.stop());
        v.srcObject = null;
      }
      return;
    }
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setScene({ kind: 'video', video: v, mirror: false });
      } catch (err) {
        setStatusMsg('Camera blocked. Check permissions.');
        setCameraOn(false);
        setTimeout(() => setStatusMsg(null), 3000);
      }
    })();
    return () => {
      if (stream) stream.getTracks().forEach(tr => tr.stop());
    };
  }, [cameraOn]);

  // Capture / reset
  const onCapture = () => {
    captureRef.current?.capture();
    setStatusMsg('Captured ✓');
    setTimeout(() => setStatusMsg(null), 1500);
  };
  const onReset = () => captureRef.current?.reset();

  // Share URL
  const onShare = () => {
    const params = new URLSearchParams();
    Object.entries(t).forEach(([k, v]) => {
      if (typeof v === 'object') return;
      params.set(k, String(v));
    });
    const url = `${location.origin}${location.pathname}?${params.toString()}#share`;
    navigator.clipboard?.writeText(url);
    setStatusMsg('Link copied');
    setTimeout(() => setStatusMsg(null), 1500);
  };

  // Hydrate from URL on mount
  useEffect(() => {
    if (location.hash !== '#share') return;
    const params = new URLSearchParams(location.search);
    const updates = {};
    params.forEach((val, key) => {
      if (key in TWEAK_DEFAULTS) {
        const def = TWEAK_DEFAULTS[key];
        if (typeof def === 'number') updates[key] = parseFloat(val);
        else if (typeof def === 'boolean') updates[key] = val === 'true';
        else updates[key] = val;
      }
    });
    setTweak(updates);
    // eslint-disable-next-line
  }, []);

  // File upload
  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomImageUrl(url);
    setTweak('sceneId', 'custom');
  };

  return (
    <>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      <CondensationEngine
        tweaks={t}
        scene={scene}
        registerCaptureRef={captureRef}
      />

      {/* Top bar — title + scene/camera/capture */}
      <div className={`chrome top-bar ${chromeVisible ? 'visible' : 'hidden'}`}>
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">DEW</span>
          <span className="brand-sub">condensation studio</span>
        </div>
        <div className="top-actions">
          <button className="ghost-btn" onClick={() => setPanelOpen(o => !o)} title="Tweaks">⚙</button>
          <button className="ghost-btn" onClick={() => setShowHelp(s => !s)} title="How to use">?</button>
          <button className="ghost-btn" onClick={onReset} title="Reset surface">↻</button>
          <button className="ghost-btn" onClick={onShare} title="Share state">↗</button>
          <button className="cap-btn" onClick={onCapture} title="Capture frame">
            <span className="cap-dot" />
            <span>Capture</span>
          </button>
        </div>
      </div>

      {/* Tool dock — left side */}
      <div className={`chrome tool-dock ${chromeVisible ? 'visible' : 'hidden'}`}>
        <button className={`tool ${t.tool === 'wipe' ? 'active' : ''}`} onClick={() => setTweak('tool', 'wipe')} title="Wipe (clear fog)">
          <ToolIcon name="wipe" /><span>Wipe</span>
        </button>
        <button className={`tool ${t.tool === 'drip' ? 'active' : ''}`} onClick={() => setTweak('tool', 'drip')} title="Drip line — drag to draw, drops will fall">
          <ToolIcon name="drip" /><span>Drip</span>
        </button>
        <button className={`tool ${t.tool === 'tap' ? 'active' : ''}`} onClick={() => setTweak('tool', 'tap')} title="Tap droplet">
          <ToolIcon name="tap" /><span>Drop</span>
        </button>
        <div className="tool-sep" />
        <button className={`tool ${cameraOn ? 'active' : ''}`} onClick={() => setCameraOn(c => !c)} title="Toggle camera as scene">
          <ToolIcon name="camera" /><span>Camera</span>
        </button>
        <label className="tool" title="Upload custom background">
          <ToolIcon name="upload" /><span>Upload</span>
          <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Scene picker — bottom center */}
      <div className={`chrome scene-bar ${chromeVisible ? 'visible' : 'hidden'}`}>
        {Object.values(SCENES).map(s => (
          <button
            key={s.id}
            className={`scene-chip ${t.sceneId === s.id && !cameraOn ? 'active' : ''}`}
            onClick={() => { setCameraOn(false); setTweak('sceneId', s.id); }}
            title={s.label}
          >
            <SceneSwatch scene={s} />
            <span>{s.label}</span>
          </button>
        ))}
        {customImageUrl && (
          <button
            className={`scene-chip ${t.sceneId === 'custom' ? 'active' : ''}`}
            onClick={() => { setCameraOn(false); setTweak('sceneId', 'custom'); }}
          >
            <span className="scene-swatch" style={{ backgroundImage: `url(${customImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <span>Custom</span>
          </button>
        )}
      </div>

      {/* Status toast */}
      {statusMsg && <div className="toast">{statusMsg}</div>}

      {/* Help overlay */}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks" open={panelOpen} onClose={() => setPanelOpen(false)}>
        <TweakSection label="Tool" />
        <TweakSlider label="Brush size" value={t.brushSize} min={6} max={120} step={1} unit="px"
          onChange={(v) => setTweak('brushSize', v)} />

        <TweakSection label="Fog" />
        <TweakSlider label="Density" value={t.fogDensity} min={0} max={1} step={0.01}
          onChange={(v) => setTweak('fogDensity', v)} />
        <TweakSlider label="Blur" value={t.fogBlur} min={0} max={40} step={1} unit="px"
          onChange={(v) => setTweak('fogBlur', v)} />
        <TweakSlider label="Re-fog speed" value={t.refogSpeed} min={0} max={1.5} step={0.01}
          onChange={(v) => setTweak('refogSpeed', v)} />
        <TweakSlider label="Mist variation" value={t.mistVariation} min={0} max={1.2} step={0.01}
          onChange={(v) => setTweak('mistVariation', v)} />

        <TweakSection label="Droplets" />
        <TweakSlider label="Density" value={t.density} min={0} max={30} step={0.5}
          onChange={(v) => setTweak('density', v)} />
        <TweakSlider label="Size" value={t.dropSize} min={0.5} max={3} step={0.05} unit="×"
          onChange={(v) => setTweak('dropSize', v)} />
        <TweakSlider label="Accumulation" value={t.accumulation} min={0} max={2} step={0.05}
          onChange={(v) => setTweak('accumulation', v)} />
        <TweakSlider label="Wipe buildup" value={t.wipeBuildup} min={0} max={2} step={0.05}
          onChange={(v) => setTweak('wipeBuildup', v)} />

        <TweakSection label="Physics" />
        <TweakSlider label="Gravity" value={t.gravity} min={0} max={1} step={0.01}
          onChange={(v) => setTweak('gravity', v)} />
        <TweakSlider label="Slide threshold" value={t.slideThreshold} min={2} max={20} step={0.5}
          onChange={(v) => setTweak('slideThreshold', v)} />
        <TweakSlider label="Wind" value={t.gravityX} min={-2} max={2} step={0.05}
          onChange={(v) => setTweak('gravityX', v)} />
        <TweakToggle label="Use device tilt" value={t.tiltEnabled}
          onChange={(v) => setTweak('tiltEnabled', v)} />

        <TweakSection label="Light" />
        <TweakColor label="Tint" value={t.tint}
          onChange={(v) => setTweak('tint', v)} />
        <TweakSlider label="Tint amount" value={t.tintAmount} min={0} max={0.6} step={0.01}
          onChange={(v) => setTweak('tintAmount', v)} />
      </TweaksPanel>
    </>
  );
}

function ToolIcon({ name }) {
  const c = 'rgba(245,250,255,0.92)';
  if (name === 'wipe') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 14 L10 19 L19 7" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="6" r="2" fill="none" stroke={c} strokeWidth="1.2" />
    </svg>
  );
  if (name === 'drip') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 C8 9 7 12 7 14 a5 5 0 0 0 10 0 c0 -2 -1 -5 -5 -11Z" stroke={c} strokeWidth="1.3" fill="none" />
    </svg>
  );
  if (name === 'tap') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="11" r="5" stroke={c} strokeWidth="1.3" />
      <circle cx="10.5" cy="9.5" r="1.4" fill={c} />
    </svg>
  );
  if (name === 'camera') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="7" width="18" height="12" rx="2" stroke={c} strokeWidth="1.3" />
      <circle cx="12" cy="13" r="3.2" stroke={c} strokeWidth="1.3" />
      <path d="M8 7 L9.5 5 H14.5 L16 7" stroke={c} strokeWidth="1.3" />
    </svg>
  );
  if (name === 'upload') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 16 V5 M7 10 L12 5 L17 10" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 19 H19" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
  return null;
}

function SceneSwatch({ scene }) {
  if (scene.kind === 'gradient') {
    const grad = `linear-gradient(180deg, ${scene.stops.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;
    return <span className="scene-swatch" style={{ background: grad }} />;
  }
  return <span className="scene-swatch" style={{ backgroundImage: `url(${scene.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
}

function HelpOverlay({ onClose }) {
  return (
    <div className="help-veil" onClick={onClose}>
      <div className="help-card" onClick={e => e.stopPropagation()}>
        <div className="help-hd">
          <h2>Dew</h2>
          <button className="ghost-btn" onClick={onClose}>×</button>
        </div>
        <p className="help-lead">A digital window that fogs over. Wipe through the mist, watch droplets form, slide, and re-fog.</p>
        <div className="help-grid">
          <div className="help-item">
            <strong>Wipe</strong>
            <span>Drag to clear condensation. Trails slowly re-fog.</span>
          </div>
          <div className="help-item">
            <strong>Drip</strong>
            <span>Drag to draw lines that drip — like writing on a steamy window.</span>
          </div>
          <div className="help-item">
            <strong>Drop</strong>
            <span>Tap to place droplets. Big ones slide; small ones cling.</span>
          </div>
          <div className="help-item">
            <strong>Camera</strong>
            <span>Use your camera as the view through the glass.</span>
          </div>
          <div className="help-item">
            <strong>Upload</strong>
            <span>Bring your own scene. Set it as the world behind the glass.</span>
          </div>
          <div className="help-item">
            <strong>Tilt</strong>
            <span>On phones, enable device tilt — droplets slide with gravity.</span>
          </div>
        </div>
        <p className="help-foot">Open Tweaks (toolbar) for fine control: density, blur, gravity, re-fog speed, brush, light.</p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
