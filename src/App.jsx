import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, Menu, X, Settings2, 
  RotateCcw, RotateCw, ChevronRight, 
  ArrowLeft, Volume2, Sparkles, 
  Mic2, Moon, Sun, Tv, HeartPulse, Code2,
  Plus, Trash2, Shield, Lock, FolderPlus,
  ChevronDown, ChevronUp, PlayCircle, Activity,
  Waves, Edit3
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';

/**
 * THE DESIGN SYSTEM: ARCHITECTURAL SENSORY PORTAL
 * Update: Removed all dummy data for clean live push.
 * Update: Added Promise handlers to Audio play() to fix AbortError.
 * Update: Header made absolute so the main player is perfectly centered vertically.
 */

const firebaseConfig = {
  apiKey: "AIzaSyB7A8ExfYr4wlO715hJPWixmMOZw9rjZmA",
  authDomain: "podcastld.firebaseapp.com",
  projectId: "podcastld",
  storageBucket: "podcastld.firebasestorage.app",
  messagingSenderId: "840314255466",
  appId: "1:840314255466:web:a090f7a7befbdde75db213"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const portalAppId = 'podcastld77-portal'; 

const generateWaveform = (seedRaw) => {
  const seedStr = String(seedRaw || 'default');
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
  const bars = [];
  for (let i = 0; i < 80; i++) {
    const height = Math.abs(Math.sin(i * 0.2 + seed) * 40 + Math.sin(i * 0.05 + seed * 2) * 50) + 15;
    bars.push(Math.min(100, height));
  }
  return bars;
};

const currentHour = new Date().getHours();
const isNightTime = currentHour < 7 || currentHour >= 18;

export default function App() {
  const [user, setUser] = useState(null);
  const [series, setSeries] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fxOpen, setFxOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuView, setMenuView] = useState('series'); 
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState('1'); 
  
  const [intensity, setIntensity] = useState(0); 
  const [isDarkMode, setIsDarkMode] = useState(isNightTime);
  const [activePreset, setActivePreset] = useState(isNightTime ? 'midnight' : 'studio');
  const [isFocused, setIsFocused] = useState(false); 
  
  // SENSORY DEFAULTS SET TO OFF
  const [hapticHeartbeat, setHapticHeartbeat] = useState(false); 
  const [hapticSubBass, setHapticSubBass] = useState(false); 

  const [adminPass, setAdminPass] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminTab, setAdminTab] = useState('episodes');
  
  const [editingId, setEditingId] = useState(null);
  const [newSeries, setNewSeries] = useState({ title: '', description: '' });
  const [newEp, setNewEp] = useState({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1' });

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const analyzerRef = useRef(null);
  const audioContextRef = useRef(null);
  const humGainRef = useRef(null);
  const eqRef = useRef(null);
  const spatialWetRef = useRef(null);
  const lastActive = useRef(Date.now()); 

  const brandAccent = isDarkMode ? '#ff8c00' : '#f28d35';

  const triggerHaptic = (type = 'light') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'light') navigator.vibrate(10);
      if (type === 'heartbeat') navigator.vibrate([20, 50, 15]);
      if (type === 'subbass') navigator.vibrate(12);
    }
  };

  // Sync entire document body to prevent "black down the middle" bug on desktop
  useEffect(() => {
    document.body.style.backgroundColor = isDarkMode ? '#000000' : '#e8e7e7';
  }, [isDarkMode]);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error(e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const sCol = collection(db, 'artifacts', portalAppId, 'public', 'data', 'series');
    const unsubS = onSnapshot(sCol, (snap) => {
        if (!snap.empty) setSeries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const eCol = collection(db, 'artifacts', portalAppId, 'public', 'data', 'episodes');
    const unsubE = onSnapshot(eCol, (snap) => {
      if (!snap.empty) {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sorted = data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setEpisodes(sorted);
        if (!currentTrack && sorted.length > 0) setCurrentTrack(sorted[0]);
      }
    });
    return () => { unsubS(); unsubE(); };
  }, [user]);

  // HARDENED IDLE ENGINE (MONASTIC MODE)
  useEffect(() => {
    const handleActivity = () => { 
      lastActive.current = Date.now(); 
      setIsFocused(false); 
    };
    
    const events = ['touchstart', 'touchmove', 'mousemove', 'click', 'keydown'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    
    const interval = setInterval(() => {
      if (isPlaying && !menuOpen && !descOpen && !fxOpen && !adminOpen) {
        if (Date.now() - lastActive.current >= 8000) {
          setIsFocused(true);
        }
      } else {
        setIsFocused(false);
        lastActive.current = Date.now(); 
      }
    }, 1000);
    
    return () => { 
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearInterval(interval); 
    };
  }, [isPlaying, menuOpen, descOpen, fxOpen, adminOpen]);

  const initAudioEngine = () => {
    if (audioContextRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 512;
      const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); humGainRef.current = gain;
      const eq = ctx.createBiquadFilter();
      const delay = ctx.createDelay();
      const spatialWet = ctx.createGain();
      const delayFeedback = ctx.createGain();
      delay.delayTime.value = 0.15; delayFeedback.gain.value = 0.2;
      delay.connect(delayFeedback); delayFeedback.connect(delay); delay.connect(spatialWet);
      source.connect(eq); eq.connect(analyzer); eq.connect(delay); spatialWet.connect(analyzer);
      analyzer.connect(ctx.destination);
      eqRef.current = eq; spatialWetRef.current = spatialWet;
      audioContextRef.current = ctx; analyzerRef.current = analyzer;
      applyAudioProfile(activePreset, ctx, eq, spatialWet);
    } catch (e) { console.error(e); }
  };

  const applyAudioProfile = (preset, ctx, eq, wet) => {
    if (!ctx || !eq || !wet) return;
    const now = ctx.currentTime;
    eq.frequency.cancelScheduledValues(now); eq.gain.cancelScheduledValues(now); wet.gain.cancelScheduledValues(now);
    if (preset === 'studio') { eq.type = 'peaking'; eq.frequency.setTargetAtTime(1000, now, 0.5); eq.gain.setTargetAtTime(2, now, 0.5); wet.gain.setTargetAtTime(0, now, 0.5); }
    else if (preset === 'midnight') { eq.type = 'lowpass'; eq.frequency.setTargetAtTime(1200, now, 0.5); wet.gain.setTargetAtTime(0, now, 0.5); }
    else if (preset === 'vivid') { eq.type = 'highshelf'; eq.frequency.setTargetAtTime(3000, now, 0.5); eq.gain.setTargetAtTime(4, now, 0.5); wet.gain.setTargetAtTime(0, now, 0.5); }
    else if (preset === 'spatial') { eq.type = 'lowshelf'; eq.frequency.setTargetAtTime(300, now, 0.5); eq.gain.setTargetAtTime(-2, now, 0.5); wet.gain.setTargetAtTime(0.35, now, 0.5); }
  };

  useEffect(() => {
    if (audioContextRef.current) applyAudioProfile(activePreset, audioContextRef.current, eqRef.current, spatialWetRef.current);
  }, [activePreset]);

  const togglePlay = async () => {
    triggerHaptic('light'); // Just a light tap for the button press
    if (!currentTrack) return;
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(error => {
          console.error("Playback prevented:", error);
          setIsPlaying(false);
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  const playEpisode = (ep) => {
    initAudioEngine();
    const f = String(ep.fileId || '');
    audioRef.current.src = f.startsWith('http') ? f : `/${f}`;
    setCurrentTrack(ep); setIsPlaying(true); setProgress(0); setMenuOpen(false);
    setTimeout(() => { 
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume(); 
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Playback prevented:", error);
          setIsPlaying(false);
        });
      }
    }, 100);
  };

  // MAIN RENDER LOOP (Visualizer + Haptics)
  useEffect(() => {
    let animationId;
    let silenceFrames = 0;
    const render = () => {
      animationId = requestAnimationFrame(render);
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      let curIntensity = 0;
      
      if (isPlaying && analyzerRef.current) {
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        curIntensity = (dataArray.reduce((a,b)=>a+b)/dataArray.length)/255;

        if (hapticSubBass) {
          let bass = 0; for(let i=0; i<5; i++) bass += dataArray[i];
          if ((bass/5)/255 > 0.6) triggerHaptic('subbass');
        }

        if (curIntensity < 0.03) {
          silenceFrames++; 
          if (hapticHeartbeat && silenceFrames > 210) { 
            triggerHaptic('heartbeat'); 
            silenceFrames = 0; 
          }
        } else silenceFrames = 0;
      } else if (!isPlaying && currentTrack) {
        curIntensity = 0.02 + Math.sin(Date.now() / 1000) * 0.01;
      }
      
      setIntensity(curIntensity);
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      const w = canvasRef.current.width, h = canvasRef.current.height, mid = h / 2;
      ctx.beginPath(); ctx.lineWidth = 1.5 + (curIntensity * 14); ctx.strokeStyle = brandAccent;
      ctx.moveTo(0, mid);
      for (let i = 0; i < 80; i++) {
        const y = mid + (i % 2 === 0 ? 1 : -1) * (curIntensity * h * 0.4) * Math.sin((i / 80) * Math.PI);
        ctx.lineTo((w / 80) * i, y);
      }
      ctx.lineTo(w, mid); ctx.stroke();
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, currentTrack, hapticSubBass, hapticHeartbeat, brandAccent]);

  useEffect(() => {
    const audio = audioRef.current;
    const up = () => setProgress((audio.currentTime / audio.duration) * 100 || 0);
    audio.addEventListener('timeupdate', up);
    return () => audio.removeEventListener('timeupdate', up);
  }, []);

  const handleAdminGate = () => {
    if (adminPass === "portal") { setIsAuthorized(true); setAdminPass(""); }
    else alert("Invalid Access Code");
  };

  const handleEditSeries = (s) => { setEditingId(s.id); setNewSeries({ title: s.title, description: s.description || '' }); };
  const handleEditEpisode = (ep) => {
    setEditingId(ep.id);
    setNewEp({
      title: ep.title, duration: ep.duration,
      content: Array.isArray(ep.content) ? ep.content.join('\n') : (ep.content || ''),
      fileId: ep.fileId, seriesId: ep.seriesId, season: ep.season || '1'
    });
  };

  const handleSaveSeries = async () => {
    const col = collection(db, 'artifacts', portalAppId, 'public', 'data', 'series');
    if (editingId) await updateDoc(doc(col, editingId), { ...newSeries });
    else await addDoc(col, { ...newSeries, timestamp: Date.now() });
    setNewSeries({ title: '', description: '' }); setEditingId(null);
  };

  const handleSaveEpisode = async () => {
    const col = collection(db, 'artifacts', portalAppId, 'public', 'data', 'episodes');
    const payload = { ...newEp, content: newEp.content.split('\n').filter(l => l.trim() !== '') };
    if (editingId) await updateDoc(doc(col, editingId), payload);
    else await addDoc(col, { ...payload, timestamp: Date.now() });
    setNewEp({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1' }); setEditingId(null);
  };

  const currentSeries = series.find(s => s.id === selectedSeriesId);
  const seriesEpisodes = episodes.filter(ep => ep.seriesId === selectedSeriesId);
  const episodesBySeason = seriesEpisodes.reduce((acc, ep) => {
    const s = ep.season || '1'; if (!acc[s]) acc[s] = []; acc[s].push(ep); return acc;
  }, {});

  const dynamicFontWeight = Math.min(900, Math.max(100, 100 + Math.floor(intensity * 1200)));

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans overflow-hidden relative transition-colors duration-1000 selection:bg-[var(--brand-accent)] selection:text-white ${isDarkMode ? 'bg-[#000000] text-[#e8e7e7]' : 'bg-[#e8e7e7] text-[#1a1a1a]'}`} style={{ backgroundColor: isFocused && isDarkMode ? `rgba(${15 + intensity * 40}, ${15 + intensity * 40}, ${15 + intensity * 40}, 1)` : undefined, '--brand-accent': brandAccent }}>
      
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
      
      {/* PROGRESS TRACKER */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-[100]" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M 0,0 L 100,0 L 100,100 L 0,100 Z" fill="none" stroke={brandAccent} strokeWidth="0.4" strokeDasharray="400" strokeDashoffset={400 - (progress * 4)} className="transition-all duration-300 ease-linear opacity-40" />
      </svg>

      <div className="w-full h-full flex flex-col transition-all duration-700 z-10 flex-grow" onClick={() => menuOpen && setMenuOpen(false)}>
        <header className={`w-full p-6 md:p-8 flex justify-between items-center z-40 shrink-0 transition-all duration-1000 ${isFocused ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'}`}>
          <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setMenuOpen(true); setMenuView('series'); }} className="opacity-80 hover:opacity-100 hover:text-[var(--brand-accent)] transition-all p-2 font-black uppercase tracking-widest text-[12px]">Library</button>
          <div className="flex items-center gap-4 md:gap-6">
            <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setIsDarkMode(!isDarkMode); }} className="p-2 opacity-60 hover:opacity-100 transition-all">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setFxOpen(!fxOpen); }} className={`p-2 transition-all ${fxOpen ? 'text-[var(--brand-accent)] opacity-100' : 'opacity-60 hover:opacity-100'}`}><Settings2 size={24} /></button>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 md:p-8 max-w-4xl mx-auto w-full relative z-10 pointer-events-none">
          <div className={`w-full flex flex-col items-center transition-all duration-700 pointer-events-auto ${fxOpen || menuOpen || descOpen || adminOpen ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100'}`}>
            <div className={`text-center mb-8 w-full max-w-lg transition-all duration-1000 ${isFocused ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
              <h1 className="text-4xl md:text-5xl tracking-tighter mb-4 uppercase leading-tight break-words" style={{ fontWeight: dynamicFontWeight, letterSpacing: `${-0.03 + (intensity * 0.05)}em` }}>{currentTrack ? currentTrack.title : "No Active Track"}</h1>
              <p className="text-[12px] font-bold uppercase tracking-[0.4em] opacity-70 mt-2">Psychotherapy & Reflection</p>
            </div>
            <button onClick={() => setDescOpen(true)} className={`group flex items-center gap-3 mb-10 transition-all duration-1000 ${isFocused ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}><span className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80 hover:opacity-100" style={{ color: brandAccent }}>Episode Description</span></button>
            <canvas ref={canvasRef} width="1200" height="300" className="w-full h-32 md:h-40 mb-12" />
            <div className={`w-full flex flex-col items-center gap-10 transition-all duration-1000 ${isFocused ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center gap-8">
                <button onClick={() => { audioRef.current.currentTime -= 15; }} className="opacity-40 hover:opacity-100"><RotateCcw size={22} /></button>
                <button onClick={togglePlay} className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-[#e8e7e7] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#e8e7e7]'}`}>{isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}</button>
                <button onClick={() => { audioRef.current.currentTime += 15; }} className="opacity-40 hover:opacity-100"><RotateCw size={22} /></button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* EPISODE DESCRIPTION OVERLAY */}
      <div className={`fixed inset-0 z-[120] backdrop-blur-3xl transition-all duration-700 ${descOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/95' : 'bg-white/95'}`} onClick={() => setDescOpen(false)}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center" onClick={e => e.stopPropagation()}>
          <button onClick={() => setDescOpen(false)} className="absolute top-8 right-8 p-4 opacity-70 hover:opacity-100"><X size={28} /></button>
          <div className="max-w-xl w-full">
            <p className="text-[12px] font-black uppercase tracking-[0.6em] mb-8" style={{ color: brandAccent }}>Episode Description</p>
            <h2 className="text-2xl md:text-4xl font-black uppercase mb-12 leading-tight">{currentTrack?.title || 'No record selected'}</h2>
            <div className="space-y-4 text-left mb-12 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
              {currentTrack?.content ? (
                Array.isArray(currentTrack.content) ? (
                    currentTrack.content.map((t, i) => <p key={i} className="text-[14px] opacity-80 italic leading-relaxed">{t}</p>)
                ) : (
                    <p className="text-[14px] opacity-80 italic leading-relaxed">{currentTrack.content}</p>
                )
              ) : (
                <p className="text-[14px] opacity-40 italic text-center">No structural description available for this session.</p>
              )}
            </div>
            <a href="https://share.google/gYraySbO0BsSwCmd4" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group opacity-60 hover:opacity-100 transition-all justify-center">
                <HeartPulse size={14} className="group-hover:text-[var(--brand-accent)]" />
                <span className="text-[12px] font-black uppercase tracking-widest group-hover:text-[var(--brand-accent)]">My Practice: Talk With Liam</span>
            </a>
          </div>
        </div>
      </div>

      {/* SETTINGS OVERLAY */}
      <div className={`fixed inset-0 z-[110] backdrop-blur-md transition-opacity duration-500 ${fxOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setFxOpen(false)}>
        <aside className={`absolute right-0 top-0 bottom-0 w-[85%] max-w-sm p-8 md:p-10 flex flex-col transform transition-transform duration-700 ${fxOpen ? 'translate-x-0' : 'translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className={`flex justify-between items-center mb-8 border-b pb-6 ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
            <h2 className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80">System Config</h2>
            <button onClick={() => setFxOpen(false)} className="p-2 opacity-60 hover:opacity-100"><X size={20} /></button>
          </div>

          <div className="flex-grow overflow-y-auto hide-scrollbar pr-2">
            <div className="mb-10">
              <span className="text-[12px] font-black uppercase tracking-widest opacity-40 mb-4 block">Haptics</span>
              {[
                { id: 'pulse', label: 'Sensory Pulse', active: hapticHeartbeat, toggle: () => setHapticHeartbeat(!hapticHeartbeat), Icon: Activity },
                { id: 'bass', label: 'Tactile Resonance', active: hapticSubBass, toggle: () => setHapticSubBass(!hapticSubBass), Icon: Waves }
              ].map(item => (
                <div key={item.id} onClick={() => { triggerHaptic(); item.toggle(); }} className={`group py-5 border-b border-current/5 cursor-pointer flex items-center justify-between transition-all`}>
                  <div className="flex items-center gap-4">
                    <item.Icon size={16} className={`transition-colors ${item.active ? 'text-[var(--brand-accent)]' : 'opacity-40'}`} />
                    <h3 className={`text-[13px] font-black tracking-tight transition-all ${item.active ? 'text-[var(--brand-accent)] translate-x-1' : 'opacity-80'}`}>{item.label}</h3>
                  </div>
                  <div className={`w-2 h-2 rounded-full transition-all ${item.active ? 'bg-[var(--brand-accent)] shadow-[0_0_8px_var(--brand-accent)]' : 'bg-current opacity-20'}`} />
                </div>
              ))}
            </div>

            <div className="mb-10">
              <span className="text-[12px] font-black uppercase tracking-widest opacity-40 mb-4 block">Audio Signal Processing</span>
              {[
                { id: 'studio', name: 'Studio Presence', Icon: Mic2 },
                { id: 'midnight', name: 'Midnight Warmth', Icon: Moon },
                { id: 'vivid', name: 'Vivid Clarity', Icon: Sparkles },
                { id: 'spatial', name: 'Spatial Room', Icon: Tv }
              ].map(p => (
                <div key={p.id} onClick={() => { triggerHaptic(); setActivePreset(p.id); }} className={`group py-5 border-b border-current/5 cursor-pointer flex items-center justify-between transition-all`}>
                  <div className="flex items-center gap-4">
                    <p.Icon size={16} className={`transition-colors ${activePreset === p.id ? 'text-[var(--brand-accent)]' : 'opacity-40'}`} />
                    <h3 className={`text-[13px] font-black tracking-tight transition-all ${activePreset === p.id ? 'text-[var(--brand-accent)] translate-x-1' : 'opacity-80'}`}>{p.name}</h3>
                  </div>
                  <div className={`w-2 h-2 rounded-full transition-all ${activePreset === p.id ? 'bg-[var(--brand-accent)] shadow-[0_0_8px_var(--brand-accent)]' : 'bg-transparent'}`} />
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setFxOpen(false)} className="mt-auto py-6 text-[12px] font-black uppercase tracking-[0.5em] opacity-80 hover:text-[var(--brand-accent)] border-t border-white/10">Close Specs</button>
        </aside>
      </div>

      {/* ARCHIVE MENU */}
      <div className={`fixed inset-0 z-[100] backdrop-blur-md transition-opacity duration-500 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setMenuOpen(false)}>
        <aside className={`absolute left-0 top-0 bottom-0 w-[85%] max-w-sm p-8 md:p-10 flex flex-col transform transition-transform duration-700 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className={`flex justify-between items-center mb-6 border-b pb-6 ${isDarkMode ? 'border-[#e8e7e7]/10' : 'border-[#1a1a1a]/10'}`}>
            <h2 className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80">{menuView === 'series' ? 'Library' : 'Episodes'}</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 opacity-60 hover:opacity-100"><X size={20} /></button>
          </div>
          <div className="flex-grow overflow-y-auto hide-scrollbar pr-2">
            {menuView === 'series' && series.map(s => (
              <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setMenuView('episodes'); }} className={`group py-6 border-b border-current/5 cursor-pointer flex items-center justify-between transition-all`}>
                <h3 className="text-[15px] font-black tracking-tight group-hover:translate-x-2 transition-transform uppercase">{s.title}</h3>
                <ChevronRight size={16} className="text-[var(--brand-accent)] opacity-80" />
              </div>
            ))}
            {menuView === 'episodes' && (
              <div className="space-y-6">
                <button onClick={() => setMenuView('series')} className="flex items-center gap-2 text-[12px] font-black uppercase opacity-80 hover:opacity-100 hover:text-[var(--brand-accent)]"><ArrowLeft size={12}/> Back</button>
                <h3 className="text-[18px] font-black tracking-tight uppercase">{currentSeries?.title}</h3>
                {Object.keys(episodesBySeason).sort().map(seasonNum => (
                  <div key={seasonNum} className="space-y-2">
                    <button onClick={() => setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)} className="flex items-center gap-3 py-2 opacity-80 hover:opacity-100"><span className="text-[12px] font-black uppercase tracking-widest">Section {seasonNum}</span></button>
                    <div className={`space-y-1 overflow-hidden transition-all duration-500 ${expandedSeason === seasonNum ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                      {episodesBySeason[seasonNum].map(ep => {
                        const isNew = Date.now() - (ep.timestamp || 0) < 604800000;
                        return (
                          <div key={ep.id} onClick={() => playEpisode(ep)} className={`py-5 border-b cursor-pointer flex justify-between items-center ${isDarkMode ? 'border-white/5' : 'border-black/5'}`} style={{ borderColor: currentTrack?.id === ep.id ? brandAccent : undefined }}>
                            <div className="flex items-center gap-3">
                                {isNew && <span className="text-[10px] font-black text-[var(--brand-accent)] border border-[var(--brand-accent)] px-1 rounded-sm uppercase">New</span>}
                                <h3 className={`text-[14px] font-bold ${currentTrack?.id === ep.id ? 'text-[var(--brand-accent)]' : ''}`}>{ep.title}</h3>
                            </div>
                            <span className="text-[11px] font-mono opacity-80 uppercase">{ep.duration}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`mt-auto pt-6 flex flex-wrap items-center gap-4 border-t ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
            <a href="https://share.google/gYraySbO0BsSwCmd4" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-all"><HeartPulse size={12}/><span className="text-[11px] font-black uppercase tracking-widest">Practice</span></a>
            <a href="https://share.google/67Y6tixM6IhnO4jRU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-all"><Code2 size={12}/><span className="text-[11px] font-black uppercase tracking-widest">Dev</span></a>
            <button onClick={() => { setAdminOpen(true); setMenuOpen(false); }} className="flex items-center gap-1.5 opacity-60 hover:opacity-100 ml-auto"><Shield size={12}/><span className="text-[11px] font-black uppercase tracking-widest">Admin</span></button>
          </div>
        </aside>
      </div>

      {/* ADMIN PANEL */}
      <div className={`fixed inset-0 z-[130] backdrop-blur-3xl transition-all duration-700 ${adminOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/98' : 'bg-white/98'}`}>
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
          <button onClick={() => { setAdminOpen(false); setIsAuthorized(false); setEditingId(null); }} className="absolute top-6 right-6 p-4 opacity-70 hover:opacity-100"><X size={24} /></button>
          {!isAuthorized ? (
            <div className="max-w-xs w-full space-y-6 text-center" onClick={e => e.stopPropagation()}>
              <Lock size={20} className="mx-auto mb-6" style={{ color: brandAccent }} />
              <input type="password" placeholder="****" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminGate()} autoComplete="new-password" spellCheck="false" className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none text-center border border-transparent focus:border-[var(--brand-accent)] text-[14px]" />
              <button onClick={handleAdminGate} className="w-full py-4 text-white font-black uppercase tracking-widest rounded-xl" style={{ backgroundColor: brandAccent }}>Unlock</button>
            </div>
          ) : (
            <div className="max-w-2xl w-full p-2 overflow-y-auto max-h-[85vh] hide-scrollbar" onClick={e => e.stopPropagation()}>
               <div className="flex justify-center gap-6 mb-8">
                <button onClick={() => { setAdminTab('episodes'); setEditingId(null); }} className={`text-[12px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${adminTab === 'episodes' ? '' : 'border-transparent opacity-40'}`} style={{ borderColor: adminTab === 'episodes' ? brandAccent : undefined, color: adminTab === 'episodes' ? brandAccent : undefined }}>Episodes</button>
                <button onClick={() => { setAdminTab('series'); setEditingId(null); }} className={`text-[12px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${adminTab === 'series' ? '' : 'border-transparent opacity-40'}`} style={{ borderColor: adminTab === 'series' ? brandAccent : undefined, color: adminTab === 'series' ? brandAccent : undefined }}>Categories</button>
              </div>
              
              {adminTab === 'series' ? (
                <div className="space-y-4 max-w-md mx-auto">
                  <input type="text" placeholder="Title" value={newSeries.title} onChange={e => setNewSeries({...newSeries, title: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  <input type="text" placeholder="Desc" value={newSeries.description} onChange={e => setNewSeries({...newSeries, description: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveSeries} className="flex-grow py-3 border font-black uppercase tracking-widest rounded-xl transition-all" style={{ borderColor: brandAccent, color: brandAccent }}>{editingId ? 'Update Category' : 'Add Category'}</button>
                    {editingId && <button onClick={() => { setEditingId(null); setNewSeries({title:'', description:''}); }} className="px-4 py-3 border border-red-500/20 text-red-500 font-black uppercase rounded-xl">X</button>}
                  </div>
                  <div className="pt-4 space-y-2">
                    {series.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                        <span className="text-[14px] font-bold opacity-80">{s.title}</span>
                        <div className="flex gap-3">
                            <button onClick={() => handleEditSeries(s)} className="text-blue-500 opacity-60 hover:opacity-100 p-1"><Edit3 size={16}/></button>
                            <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', portalAppId, 'public', 'data', 'series', s.id)); }} className="text-red-500 opacity-60 hover:opacity-100 p-1"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                  <select value={newEp.seriesId} onChange={e => setNewEp({...newEp, seriesId: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]">
                    <option value="">Select Category...</option>
                    {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <input type="text" placeholder="Title" value={newEp.title} onChange={e => setNewEp({...newEp, title: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  <div className="flex gap-2">
                    <input type="text" placeholder="Duration (eg 42:00)" value={newEp.duration} onChange={e => setNewEp({...newEp, duration: e.target.value})} className="flex-grow bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                    <input type="text" placeholder="Season" value={newEp.season} onChange={e => setNewEp({...newEp, season: e.target.value})} className="w-20 bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  </div>
                  <input type="text" placeholder="Audio Path (URL)" value={newEp.fileId} onChange={e => setNewEp({...newEp, fileId: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  <textarea placeholder="Description" rows={4} value={newEp.content} onChange={e => setNewEp({...newEp, content: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none text-[14px]" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEpisode} className="flex-grow py-4 text-white font-black uppercase tracking-widest rounded-xl" style={{ backgroundColor: brandAccent }}>{editingId ? 'Update Episode' : 'Publish Episode'}</button>
                    {editingId && <button onClick={() => { setEditingId(null); setNewEp({title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1'}); }} className="px-5 border border-red-500/20 text-red-500 font-black uppercase rounded-xl">X</button>}
                  </div>
                  <div className="pt-4 space-y-2 pb-10">
                    {episodes.map(ep => (
                      <div key={ep.id} className="flex justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                        <span className="text-[12px] font-bold opacity-80 truncate max-w-[200px]">{ep.title}</span>
                        <div className="flex gap-3">
                            <button onClick={() => handleEditEpisode(ep)} className="text-blue-500 opacity-60 hover:opacity-100 p-1"><Edit3 size={16}/></button>
                            <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', portalAppId, 'public', 'data', 'episodes', ep.id)); }} className="text-red-500 opacity-60 hover:opacity-100 p-1"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}