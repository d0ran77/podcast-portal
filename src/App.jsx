import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, X, Settings2, 
  RotateCcw, RotateCw, ChevronRight, 
  ArrowLeft, HeartPulse, Trash2, Shield, Lock, 
  Activity, Edit3, Sun, Moon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBofPAKTdKGViqfBoCgO38Cl1ljigjpuUI",
  authDomain: "podcastld77.firebaseapp.com",
  projectId: "podcastld77",
  storageBucket: "podcastld77.firebasestorage.app",
  messagingSenderId: "705191404419",
  appId: "1:705191404419:web:372cf334def7d0b913ccb6",
  measurementId: "G-CR6R2ZV96P"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const appId = 'podcastld77-portal'; 

const currentHour = new Date().getHours();
const isNightTime = currentHour < 7 || currentHour >= 18;

export default function App() {
  const [user, setUser] = useState(null);
  const [series, setSeries] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fxOpen, setFxOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuView, setMenuView] = useState('series'); 
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState('1'); 
  const [sortOrder, setSortOrder] = useState('asc'); 
  const [isDarkMode, setIsDarkMode] = useState(isNightTime);
  const [activePreset, setActivePreset] = useState('studio');
  const [isFocused, setIsFocused] = useState(false); 
  const [hapticHeartbeat, setHapticHeartbeat] = useState(false); 

  const [adminPass, setAdminPass] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminTab, setAdminTab] = useState('episodes');
  const [editingId, setEditingId] = useState(null);
  const [newSeries, setNewSeries] = useState({ title: '', description: '' });
  const [newEp, setNewEp] = useState({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1', transcript: '' });

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const analyzerRef = useRef(null);
  const audioContextRef = useRef(null);
  const filterRef = useRef(null);
  const lastActive = useRef(Date.now()); 
  const wakeLockRef = useRef(null);
  const ghostFrames = useRef([]); 
  const lastHapticInterval = useRef(-1);
  
  const episodesRef = useRef([]);
  const currentTrackRef = useRef(null);
  useEffect(() => { episodesRef.current = episodes; }, [episodes]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  const brandAccent = isDarkMode ? '#ff8c00' : '#f28d35';

  useEffect(() => {
    document.body.style.backgroundColor = isDarkMode ? '#000000' : '#e8e7e7';
  }, [isDarkMode]);

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying) {
        try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } 
        catch (err) {}
      }
    };
    if (isPlaying) requestWakeLock();
    return () => { if (wakeLockRef.current) wakeLockRef.current.release(); };
  }, [isPlaying]);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error("Auth failed", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubS = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'series'), (snap) => {
      setSeries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Series error", err));
    
    const unsubE = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'episodes'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEpisodes(data.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
    }, (err) => console.error("Episode error", err));
    
    return () => { unsubS(); unsubE(); };
  }, [user]);

  useEffect(() => {
    const handleActivity = () => { 
      lastActive.current = Date.now(); 
      setIsFocused(false); 
    };
    const events = ['touchstart', 'touchmove', 'mousemove', 'click', 'keydown'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActive.current >= 8000 && !menuOpen && !descOpen && !fxOpen && !adminOpen) {
        setIsFocused(true);
      }
    }, 1000);
    return () => { 
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearInterval(interval); 
    };
  }, [menuOpen, descOpen, fxOpen, adminOpen]);

  const initAudioEngine = () => {
    if (audioContextRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyzer = ctx.createAnalyser(); analyzer.fftSize = 512;
      const filter = ctx.createBiquadFilter(); filter.type = 'peaking';
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      source.connect(filter); filter.connect(compressor); compressor.connect(analyzer); analyzer.connect(ctx.destination);
      audioContextRef.current = ctx; analyzerRef.current = analyzer; filterRef.current = filter;
    } catch (e) { console.error("Audio Engine Init Failed", e); }
  };

  useEffect(() => {
    if (!filterRef.current || !audioContextRef.current) return;
    const ctx = audioContextRef.current; const f = filterRef.current;
    switch(activePreset) {
      case 'midnight': f.type = 'highshelf'; f.frequency.setTargetAtTime(2500, ctx.currentTime, 0.1); f.gain.setTargetAtTime(-8, ctx.currentTime, 0.1); break;
      case 'vivid': f.type = 'peaking'; f.frequency.setTargetAtTime(3200, ctx.currentTime, 0.1); f.gain.setTargetAtTime(5, ctx.currentTime, 0.1); f.Q.setTargetAtTime(1, ctx.currentTime, 0.1); break;
      case 'spatial': f.type = 'allpass'; f.frequency.setTargetAtTime(800, ctx.currentTime, 0.1); break;
      default: f.type = 'peaking'; f.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  }, [activePreset]);

  const togglePlay = async () => {
    if (hapticHeartbeat && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    if (!currentTrack) return;
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const playEpisode = (ep) => {
    if (!ep) return;
    initAudioEngine();
    const f = String(ep.fileId || '').trim();
    if (!f) return;
    const finalSrc = f.startsWith('http') ? f : (f.startsWith('/') ? f : `/${f}`);
    
    audioRef.current.pause();
    audioRef.current.src = finalSrc;
    audioRef.current.load();
    
    setCurrentTrack(ep); 
    setIsPlaying(true); 
    setProgress(0); 
    setMenuOpen(false);
    lastHapticInterval.current = -1;
    
    setTimeout(() => { 
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume(); 
      audioRef.current.play().catch(() => setIsPlaying(false));
    }, 150);
  };

  const handleTrackEnd = () => {
    const track = currentTrackRef.current;
    if (!track) { setIsPlaying(false); return; }
    const sorted = episodesRef.current.filter(e => e.seriesId === track.seriesId);
    const idx = sorted.findIndex(e => e.id === track.id);
    if (idx >= 0 && idx < sorted.length - 1) playEpisode(sorted[idx + 1]);
    else setIsPlaying(false);
  };

  useEffect(() => {
    const audio = audioRef.current;
    const up = () => {
      const dur = audio.duration;
      if (dur && isFinite(dur)) {
        setProgress((audio.currentTime / dur) * 100 || 0);
        setCurrentTime(audio.currentTime);
        setDuration(dur);
      }
    };
    audio.addEventListener('timeupdate', up);
    return () => audio.removeEventListener('timeupdate', up);
  }, []);

  useEffect(() => {
    let animationId;
    const render = () => {
      animationId = requestAnimationFrame(render);
      if (!canvasRef.current) return;
      const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.25)' : 'rgba(232, 231, 231, 0.25)';
      ctx.fillRect(0, 0, w, h);
      
      if (isPlaying && analyzerRef.current) {
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        
        ghostFrames.current.push(new Uint8Array(dataArray));
        if (ghostFrames.current.length > 8) ghostFrames.current.shift();

        const ghostCount = ghostFrames.current.length;
        ghostFrames.current.forEach((frame, idx) => {
          const alpha = ghostCount > 0 ? (idx / ghostCount) * 0.25 : 0;
          ctx.beginPath();
          ctx.strokeStyle = isDarkMode ? `rgba(255, 140, 0, ${alpha})` : `rgba(242, 141, 53, ${alpha})`;
          ctx.lineWidth = 1; ctx.moveTo(0, mid);
          const limit = Math.floor(frame.length / 2.5); const slices = w / (limit || 1);
          for (let i = 0; i < limit; i++) {
            const y = mid + (i % 2 === 0 ? 1 : -1) * (frame[i] / 255 * h * 0.4) * Math.sin((i / limit) * Math.PI);
            ctx.lineTo(i * slices, y);
          }
          ctx.stroke();
        });

        let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        const inst = (sum / dataArray.length) / 255;
        document.documentElement.style.setProperty('--rms-intensity', inst);

        ctx.beginPath(); ctx.lineWidth = 2.5; ctx.strokeStyle = brandAccent; ctx.moveTo(0, mid);
        const limit = Math.floor(dataArray.length / 2.5); const slices = w / (limit || 1);
        for (let i = 0; i < limit; i++) {
          const y = mid + (i % 2 === 0 ? 1 : -1) * (dataArray[i] / 255 * h * 0.45) * Math.sin((i / limit) * Math.PI);
          ctx.lineTo(i * slices, y);
        }
        ctx.lineTo(w, mid); ctx.stroke();
      } else {
        document.documentElement.style.setProperty('--rms-intensity', '0');
        ctx.beginPath(); ctx.lineWidth = 1.5; ctx.strokeStyle = brandAccent; ctx.moveTo(0, mid);
        const breathe = currentTrack ? 0.02 + Math.sin(Date.now() / 1000) * 0.01 : 0;
        for (let i = 0; i < 80; i++) { ctx.lineTo((w / 80) * i, mid + (i % 2 === 0 ? 1 : -1) * (breathe * h * 0.4) * Math.sin((i / 80) * Math.PI)); }
        ctx.lineTo(w, mid); ctx.stroke();
      }
    };
    render(); return () => cancelAnimationFrame(animationId);
  }, [isPlaying, currentTrack, brandAccent, isDarkMode]);

  const handleAdminGate = () => { if (adminPass === "portal") { setIsAuthorized(true); setAdminPass(""); } else alert("Invalid Code"); };

  const currentSeries = series.find(s => s.id === selectedSeriesId);
  const seriesEpisodes = episodes.filter(ep => ep.seriesId === selectedSeriesId).sort((a, b) => {
    return sortOrder === 'asc' ? (a.timestamp || 0) - (b.timestamp || 0) : (b.timestamp || 0) - (a.timestamp || 0);
  });
  const episodesBySeason = seriesEpisodes.reduce((acc, ep) => {
    const s = ep.season || '1'; if (!acc[s]) acc[s] = []; acc[s].push(ep); return acc;
  }, {});

  const handlePlaySection = (seasonNum) => {
    const eps = episodesBySeason[seasonNum];
    if (eps && eps.length > 0) playEpisode(eps[0]);
  };

  const formatDisplayTime = (time) => {
    if (!time || isNaN(time) || !isFinite(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans overflow-hidden relative transition-colors duration-1000 ${isDarkMode ? 'bg-[#000000] text-[#e8e7e7]' : 'bg-[#e8e7e7] text-[#1a1a1a]'}`} style={{ '--brand-accent': brandAccent }}>
      <audio ref={audioRef} onEnded={handleTrackEnd} />
      
      <div className="w-full h-full flex flex-col z-10 flex-grow" onClick={() => isFocused && setIsFocused(false)}>
        <header className={`absolute top-0 left-0 w-full p-6 md:p-8 flex justify-between items-center z-40 transition-all duration-1000 ${isFocused ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'}`}>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(true); setMenuView('series'); }} className="opacity-80 p-2 font-black uppercase tracking-widest text-[12px]">Library</button>
          <div className="flex items-center gap-6">
            <button onClick={(e) => { e.stopPropagation(); setIsDarkMode(!isDarkMode); }} className="p-2 opacity-60">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button onClick={(e) => { e.stopPropagation(); setFxOpen(!fxOpen); }} className={`p-2 transition-all ${fxOpen ? 'text-[var(--brand-accent)]' : 'opacity-60'}`}><Settings2 size={24} /></button>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full relative z-10">
          <div className={`w-full flex flex-col items-center transition-all duration-700 pointer-events-auto ${fxOpen || menuOpen || descOpen || adminOpen ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100'}`}>
            <div className={`text-center mb-8 w-full max-w-lg transition-all duration-1000 ${isFocused ? 'opacity-30 scale-90 translate-y-4' : 'opacity-100'}`}>
              {/* Reactive Font Title Restored */}
              <h1 
                className="text-4xl md:text-5xl font-black tracking-tighter mb-4 uppercase leading-tight break-words"
                style={{ letterSpacing: 'calc(var(--rms-intensity) * 0.25em)' }}
              >
                {currentTrack ? currentTrack.title : "Talk With Liam"}
              </h1>
              
              <div className="mt-6 flex flex-col items-center gap-1">
                {currentTrack && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-50">Talk With Liam</span>
                )}
                <span className="text-[13px] font-black uppercase tracking-[0.6em]" style={{ color: brandAccent }}>
                  Sessions
                </span>
              </div>
            </div>
            
            {currentTrack && (
              <button onClick={() => setDescOpen(true)} className={`group flex items-center justify-center gap-3 mb-8 transition-all duration-1000 ${isFocused ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <span className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-40 group-hover:opacity-100 transition-opacity">Session Notes</span>
              </button>
            )}
            
            <canvas ref={canvasRef} width="1200" height="500" className={`w-full transition-all duration-1000 ${isFocused ? 'h-64 md:h-[50vh] opacity-100' : 'h-32 md:h-56 opacity-80'}`} />
            
            {currentTrack && (
              <div className={`w-full max-w-sm mb-12 transition-all duration-1000 ${isFocused ? 'opacity-0' : 'opacity-100'}`}>
                <div className="relative py-2">
                  <input 
                    type="range" min="0" max="100" step="0.01" value={progress} 
                    className="studio-scrubber w-full appearance-none bg-transparent cursor-pointer relative z-10"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value); 
                      const dur = audioRef.current?.duration;
                      if (dur && isFinite(dur)) {
                        const newTime = (val / 100) * dur;
                        if (isFinite(newTime)) {
                          const current5MinInterval = Math.floor(newTime / 300);
                          if (current5MinInterval !== lastHapticInterval.current) {
                            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
                            lastHapticInterval.current = current5MinInterval;
                          }
                          audioRef.current.currentTime = newTime;
                          setProgress(val);
                        }
                      }
                    }} 
                  />
                  <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-current opacity-10 rounded-full pointer-events-none" />
                </div>
                <div className="flex justify-between text-[9px] font-bold opacity-40 uppercase tracking-widest mt-3">
                  <span>{formatDisplayTime(currentTime)}</span>
                  <span>{formatDisplayTime(duration)}</span>
                </div>
              </div>
            )}

            <div className={`flex items-center gap-10 transition-all duration-1000 ${isFocused ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {currentTrack && (
                <>
                  <button onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 15; }} className="opacity-40 hover:opacity-100 transition-opacity"><RotateCcw size={20} /></button>
                  
                  <button 
                    onClick={togglePlay} 
                    className={`relative w-28 h-16 rounded-xl flex items-center justify-center transition-all duration-300
                      ${isDarkMode ? 'bg-[#151515]' : 'bg-[#e0e0e0]'}
                      ${isPlaying ? 'scale-[0.98]' : ''}
                    `}
                    style={{
                      boxShadow: isPlaying
                        ? `inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.05), 0 0 20px ${brandAccent}40`
                        : (isDarkMode ? '4px 4px 10px rgba(0,0,0,0.5), -2px -2px 10px rgba(255,255,255,0.05)' : '4px 4px 10px rgba(0,0,0,0.15), -4px -4px 10px rgba(255,255,255,0.7)'),
                      border: `1px solid ${isDarkMode ? '#222' : '#d1d1d1'}`
                    }}
                  >
                    <div className={`absolute top-2.5 left-3 w-1.5 h-1.5 rounded-full transition-all duration-300 ${isPlaying ? `bg-[var(--brand-accent)] shadow-[0_0_6px_var(--brand-accent)]` : 'bg-current opacity-20'}`} />
                    {isPlaying ? <Pause size={22} className={isDarkMode ? 'text-white' : 'text-black'} /> : <Play size={22} className={`ml-1 ${isDarkMode ? 'text-white' : 'text-black'}`} />}
                  </button>
                  
                  <button onClick={() => { if (audioRef.current) audioRef.current.currentTime += 15; }} className="opacity-40 hover:opacity-100 transition-opacity"><RotateCw size={20} /></button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <div className={`fixed inset-0 z-[120] backdrop-blur-3xl transition-all duration-700 ${descOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/95' : 'bg-white/95'}`} onClick={() => setDescOpen(false)}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center" onClick={e => e.stopPropagation()}>
          <button onClick={() => setDescOpen(false)} className="absolute top-8 right-8 p-4 opacity-70"><X size={28} /></button>
          <div className="max-w-xl w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.6em] mb-8 opacity-40">Session Notes</p>
            <h2 className="text-2xl font-black uppercase mb-8">{currentTrack?.title}</h2>
            <div className="space-y-4 text-center mb-12 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
              {currentTrack?.content?.map((t, i) => <p key={i} className="text-[14px] opacity-80 italic leading-relaxed text-center">{t}</p>)}
            </div>
            <div className="pt-8 border-t border-current/10">
              <a href="https://talkwithliam.co.uk/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 opacity-60 hover:opacity-100 justify-center">
                  <HeartPulse size={16} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">talkwithliam.co.uk</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-[100] backdrop-blur-md transition-opacity duration-500 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setMenuOpen(false)}>
        <aside className={`absolute left-0 top-0 bottom-0 w-[85%] max-w-sm p-8 flex flex-col transform transition-transform duration-700 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6 border-b pb-6 border-current/10"><h2 className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40">Archive</h2><button onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
          <div className="flex-grow overflow-y-auto hide-scrollbar">
            {menuView === 'series' && series.map(s => (
              <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setMenuView('episodes'); }} className="py-6 border-b border-current/5 cursor-pointer flex items-center justify-between group">
                <h3 className="text-[15px] font-black tracking-tight group-hover:translate-x-2 transition-transform uppercase">{s.title}</h3><ChevronRight size={16} className="opacity-40" />
              </div>
            ))}
            {menuView === 'episodes' && (
              <div className="space-y-6"><button onClick={() => setMenuView('series')} className="flex items-center gap-2 text-[10px] font-black uppercase opacity-40"><ArrowLeft size={12}/> Back</button>
                <div className="mb-6 flex flex-col items-start gap-2">
                  <h3 className="text-[18px] font-black uppercase tracking-tight leading-tight">{currentSeries?.title}</h3>
                  <button onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')} className="text-[9px] font-black uppercase tracking-widest opacity-60 hover:text-[var(--brand-accent)]">
                    {sortOrder === 'asc' ? 'Order: 1 to 10' : 'Order: Newest'}
                  </button>
                </div>
                {Object.keys(episodesBySeason).sort().map(seasonNum => (
                  <div key={seasonNum} className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                      <button onClick={() => setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)} className="text-[12px] font-black uppercase tracking-widest opacity-80">Season {seasonNum}</button>
                      <button onClick={() => handlePlaySection(seasonNum)} className="text-[9px] font-black uppercase tracking-widest opacity-60 hover:text-[var(--brand-accent)]">Play All</button>
                    </div>
                    <div className={`space-y-1 overflow-hidden transition-all duration-500 ${expandedSeason === seasonNum ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                      {episodesBySeason[seasonNum].map(ep => (
                        <div key={ep.id} onClick={() => playEpisode(ep)} className={`py-4 border-b border-current/5 cursor-pointer flex justify-between items-center ${currentTrack?.id === ep.id ? 'text-[var(--brand-accent)]' : ''}`}>
                          <h3 className="text-[13px] font-bold">{ep.title}</h3><span className="text-[10px] opacity-40">{ep.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-auto pt-6 border-t border-current/10 flex justify-between items-center">
            <a href="https://talkwithliam.co.uk/" target="_blank" rel="noopener noreferrer" className="opacity-40 text-[10px] font-black uppercase tracking-widest">Practice</a>
            <button onClick={() => setAdminOpen(true)} className="opacity-40 text-[10px] font-black uppercase tracking-widest">Admin</button>
          </div>
        </aside>
      </div>

      <div className={`fixed inset-0 z-[110] backdrop-blur-md transition-opacity duration-500 ${fxOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setFxOpen(false)}>
        <aside className={`absolute right-0 top-0 bottom-0 w-[85%] max-w-sm p-8 flex flex-col transform transition-transform duration-700 ${fxOpen ? 'translate-x-0' : 'translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <h2 className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40 mb-10 border-b border-current/10 pb-4">Configuration</h2>
          <div className="space-y-12 flex-grow">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Sensory</span>
              <div onClick={() => setHapticHeartbeat(!hapticHeartbeat)} className="py-4 border-b border-current/5 cursor-pointer flex justify-between items-center">
                <span className="text-[13px] font-bold">Sensory Pulse</span><div className={`w-2 h-2 rounded-full ${hapticHeartbeat ? 'bg-[var(--brand-accent)]' : 'bg-current opacity-20'}`}/>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Audio Engine</span>
              {['studio', 'midnight', 'vivid', 'spatial'].map(p => (
                <div key={p} onClick={() => setActivePreset(p)} className="py-4 border-b border-current/5 cursor-pointer flex justify-between items-center capitalize">
                  <span className={`text-[13px] font-bold ${activePreset === p ? 'text-[var(--brand-accent)]' : ''}`}>{p}</span>{activePreset === p && <div className="w-2 h-2 rounded-full bg-[var(--brand-accent)]"/>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setFxOpen(false)} className="mt-auto py-6 border-t border-current/10 text-[10px] font-black uppercase tracking-widest opacity-40">Close</button>
        </aside>
      </div>

      {/* Admin Panel */}
      <div className={`fixed inset-0 z-[130] backdrop-blur-3xl transition-all duration-700 ${adminOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/98' : 'bg-white/98'}`}>
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
          <button onClick={() => { setAdminOpen(false); setIsAuthorized(false); }} className="absolute top-6 right-6 p-4 opacity-70"><X size={24} /></button>
          {!isAuthorized ? (
            <div className="max-w-xs w-full space-y-6 text-center">
              <Lock size={20} className="mx-auto" style={{ color: brandAccent }} />
              <input type="password" placeholder="****" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminGate()} className="w-full bg-black/10 p-4 rounded-xl text-center" />
              <button onClick={handleAdminGate} className="w-full py-4 text-white font-black uppercase tracking-widest rounded-xl" style={{ backgroundColor: brandAccent }}>Unlock</button>
            </div>
          ) : (
            <div className="max-w-2xl w-full space-y-4 overflow-y-auto max-h-[85vh] p-4 hide-scrollbar">
               <div className="flex justify-center gap-6 mb-8">
                <button onClick={() => setAdminTab('episodes')} className={`text-[10px] font-black uppercase pb-1 border-b-2 transition-all ${adminTab === 'episodes' ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]' : 'border-transparent opacity-40'}`}>Episodes</button>
                <button onClick={() => setAdminTab('series')} className={`text-[10px] font-black uppercase pb-1 border-b-2 transition-all ${adminTab === 'series' ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]' : 'border-transparent opacity-40'}`}>Categories</button>
              </div>
              {adminTab === 'episodes' ? (
                <div className="space-y-4 max-w-md mx-auto">
                  <select value={newEp.seriesId} onChange={e => setNewEp({...newEp, seriesId: e.target.value})} className="w-full bg-black/5 p-4 rounded-xl outline-none">
                    <option value="">Select Category...</option>
                    {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <input type="text" placeholder="Title" value={newEp.title} onChange={e => setNewEp({...newEp, title: e.target.value})} className="w-full bg-black/5 p-4 rounded-xl outline-none" />
                  <div className="flex gap-2">
                    <input type="text" placeholder="Duration (eg 42:00)" value={newEp.duration} onChange={e => setNewEp({...newEp, duration: e.target.value})} className="flex-grow bg-black/5 p-4 rounded-xl outline-none" />
                    <input type="text" placeholder="S" value={newEp.season} onChange={e => setNewEp({...newEp, season: e.target.value})} className="w-20 bg-black/5 p-4 rounded-xl outline-none" />
                  </div>
                  <input type="text" placeholder="Audio Path" value={newEp.fileId} onChange={e => setNewEp({...newEp, fileId: e.target.value})} className="w-full bg-black/5 p-4 rounded-xl outline-none" />
                  <textarea placeholder="Description" rows={4} value={newEp.content} onChange={e => setNewEp({...newEp, content: e.target.value})} className="w-full bg-black/5 p-4 rounded-xl outline-none" />
                  <button onClick={async () => {
                    const col = collection(db, 'artifacts', appId, 'public', 'data', 'episodes');
                    const payload = { ...newEp, content: newEp.content.split('\n').filter(l => l.trim() !== ''), timestamp: Date.now() };
                    if (editingId) await updateDoc(doc(col, editingId), payload); else await addDoc(col, payload);
                    setNewEp({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1', transcript: '' }); setEditingId(null);
                  }} className="w-full py-4 text-white font-black uppercase rounded-xl" style={{ backgroundColor: brandAccent }}>Publish Session</button>
                  <div className="pt-4 space-y-2 pb-10">
                    {episodes.map(ep => (
                      <div key={ep.id} className="flex justify-between items-center p-4 bg-black/5 rounded-lg">
                        <span className="text-[12px] font-bold truncate max-w-[200px]">{ep.title}</span>
                        <div className="flex gap-4">
                          <button onClick={() => { setEditingId(ep.id); setNewEp({ ...ep, content: Array.isArray(ep.content) ? ep.content.join('\n') : ep.content }); }} className="text-blue-500"><Edit3 size={16}/></button>
                          <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'episodes', ep.id)); }} className="text-red-500"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                   <input type="text" placeholder="Category Title" value={newSeries.title} onChange={e => setNewSeries({...newSeries, title: e.target.value})} className="w-full bg-black/5 p-4 rounded-xl outline-none" />
                   <button onClick={async () => {
                    const col = collection(db, 'artifacts', appId, 'public', 'data', 'series');
                    await addDoc(col, { ...newSeries, timestamp: Date.now() });
                    setNewSeries({ title: '', description: '' });
                  }} className="w-full py-3 border font-black uppercase tracking-widest rounded-xl" style={{ borderColor: brandAccent, color: brandAccent }}>Add Category</button>
                  <div className="pt-4 space-y-2">
                    {series.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-4 bg-black/5 rounded-lg">
                        <span className="text-[14px] font-bold">{s.title}</span>
                        <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'series', s.id)); }} className="text-red-500"><Trash2 size={16}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hardware CSS Modifications */}
      <style>{`
        /* The Dieter Rams Scrubber Fader */
        input[type='range'].studio-scrubber::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 24px; 
          width: 10px; 
          border-radius: 2px; 
          background: #2a2a2a; 
          border: 1px solid #111;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.5);
          background-image: linear-gradient(to bottom, transparent 45%, var(--brand-accent) 45%, var(--brand-accent) 55%, transparent 55%);
          cursor: pointer; 
          position: relative;
          z-index: 20;
        }
        
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        :root { --rms-intensity: 0; }
      `}</style>
    </div>
  );
}