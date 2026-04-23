import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, Menu, X, Settings2, 
  RotateCcw, RotateCw, ChevronRight, 
  ArrowLeft, Volume2, Sparkles, 
  Mic2, Moon, Sun, Tv, HeartPulse, Code2,
  Plus, Trash2, Shield, Lock, FolderPlus,
  Activity, Waves, Edit3
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
  const [fxOpen, setFxOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuView, setMenuView] = useState('series'); 
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState('1'); 
  const [sortOrder, setSortOrder] = useState('asc'); 
  
  const [intensity, setIntensity] = useState(0); 
  const [isDarkMode, setIsDarkMode] = useState(isNightTime);
  const [activePreset, setActivePreset] = useState(isNightTime ? 'midnight' : 'studio');
  const [isFocused, setIsFocused] = useState(false); 
  
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
  const lastActive = useRef(Date.now()); 

  const brandAccent = isDarkMode ? '#ff8c00' : '#f28d35';

  const triggerHaptic = (type = 'light') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'light') navigator.vibrate(10);
      if (type === 'heartbeat') navigator.vibrate([20, 50, 15]);
      if (type === 'subbass') navigator.vibrate(12);
    }
  };

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
    const sCol = collection(db, 'artifacts', appId, 'public', 'data', 'series');
    const unsubS = onSnapshot(sCol, (snap) => {
        if (!snap.empty) setSeries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const eCol = collection(db, 'artifacts', appId, 'public', 'data', 'episodes');
    const unsubE = onSnapshot(eCol, (snap) => {
      if (!snap.empty) {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sorted = data.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setEpisodes(sorted);
        // Removed the auto-setting of currentTrack here so the Welcome screen shows properly
      }
    });
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
      source.connect(analyzer);
      analyzer.connect(ctx.destination);
      audioContextRef.current = ctx; analyzerRef.current = analyzer;
    } catch (e) { console.error(e); }
  };

  const togglePlay = async () => {
    triggerHaptic('light');
    if (!currentTrack) return;
    initAudioEngine();
    
    // Safety check to ensure source is valid before playing
    if (!audioRef.current.src || audioRef.current.src.endsWith('/')) {
      const f = String(currentTrack.fileId || '').trim();
      if (!f) {
        console.warn("No valid audio source found for this track.");
        return;
      }
      audioRef.current.src = f.startsWith('http') ? f : (f.startsWith('/') ? f : `/${f}`);
      audioRef.current.load();
    }

    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setIsPlaying(true)).catch(error => {
          console.error("Playback prevented:", error); setIsPlaying(false);
        });
      } else setIsPlaying(true);
    }
  };

  const playEpisode = (ep) => {
    initAudioEngine();
    const f = String(ep?.fileId || '').trim();
    
    // Prevent execution if no fileId was provided, avoiding the 'no supported sources' error
    if (!f) {
      console.warn("Playback prevented: Episode has no audio file path attached.");
      setIsPlaying(false);
      return;
    }

    audioRef.current.src = f.startsWith('http') ? f : (f.startsWith('/') ? f : `/${f}`);
    audioRef.current.load(); // Explicitly force the element to load the new source
    
    setCurrentTrack(ep); 
    setIsPlaying(true); 
    setProgress(0); 
    setMenuOpen(false);
    
    setTimeout(() => { 
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume(); 
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Playback prevented:", error); setIsPlaying(false);
        });
      }
    }, 100);
  };

  const handleTrackEnd = () => {
    if (!currentTrack) {
      setIsPlaying(false);
      return;
    }
    const currentSeriesEps = episodes.filter(e => e.seriesId === currentTrack.seriesId);
    const sortedEps = currentSeriesEps.sort((a, b) => sortOrder === 'asc' ? (a.timestamp || 0) - (b.timestamp || 0) : (b.timestamp || 0) - (a.timestamp || 0));
    const currentSeasonEps = sortedEps.filter(e => (e.season || '1') === (currentTrack.season || '1'));
    
    const idx = currentSeasonEps.findIndex(e => e.id === currentTrack.id);
    if (idx >= 0 && idx < currentSeasonEps.length - 1) {
      playEpisode(currentSeasonEps[idx + 1]);
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    let animationId;
    let silenceFrames = 0;
    const render = () => {
      animationId = requestAnimationFrame(render);
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height, mid = h / 2;
      let curIntensity = 0;
      
      // FIX 1: Make the canvas background match the pure #000000 dark mode body
      ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(232, 231, 231, 0.3)';
      ctx.fillRect(0, 0, w, h);
      
      if (isPlaying && analyzerRef.current) {
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        curIntensity = (sum / dataArray.length) / 255;

        if (hapticSubBass) {
          let bass = 0; for(let i=0; i<5; i++) bass += dataArray[i];
          if ((bass/5)/255 > 0.6) triggerHaptic('subbass');
        }

        if (curIntensity < 0.03) {
          silenceFrames++; 
          if (hapticHeartbeat && silenceFrames > 210) { 
            triggerHaptic('heartbeat'); silenceFrames = 0; 
          }
        } else silenceFrames = 0;
        
        ctx.beginPath();
        ctx.lineWidth = 1.5 + (curIntensity * 12);
        ctx.strokeStyle = brandAccent;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(0, mid);
        
        const limit = Math.floor(dataArray.length / 2.5); 
        const slices = w / limit;
        let x = 0;
        for (let i = 0; i < limit; i++) {
          const amp = dataArray[i] / 255;
          const pin = Math.sin((i / limit) * Math.PI);
          const y = mid + (i % 2 === 0 ? 1 : -1) * (amp * h * 0.45) * pin;
          ctx.lineTo(x, y); x += slices;
        }
        ctx.lineTo(w, mid);
        ctx.stroke();
      } else {
        if (currentTrack) curIntensity = 0.02 + Math.sin(Date.now() / 1000) * 0.01;
        ctx.beginPath(); ctx.lineWidth = 1.5 + (curIntensity * 10); ctx.strokeStyle = brandAccent;
        ctx.moveTo(0, mid);
        for (let i = 0; i < 80; i++) {
          const y = mid + (i % 2 === 0 ? 1 : -1) * (curIntensity * h * 0.4) * Math.sin((i / 80) * Math.PI);
          ctx.lineTo((w / 80) * i, y);
        }
        ctx.lineTo(w, mid); ctx.stroke();
      }
      setIntensity(curIntensity);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, currentTrack, hapticSubBass, hapticHeartbeat, brandAccent, isDarkMode]);

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

  const handleEditSeries = (s) => { 
    setEditingId(s.id); 
    setNewSeries({ title: s.title, description: s.description || '' }); 
  };
  const handleEditEpisode = (ep) => {
    setEditingId(ep.id);
    setNewEp({
      title: ep.title, duration: ep.duration,
      content: Array.isArray(ep.content) ? ep.content.join('\n') : (ep.content || ''),
      fileId: ep.fileId, seriesId: ep.seriesId, season: ep.season || '1'
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewSeries({ title: '', description: '' });
    setNewEp({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1' });
  };

  const handleSaveSeries = async () => {
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'series');
    if (editingId) await updateDoc(doc(col, editingId), { ...newSeries });
    else await addDoc(col, { ...newSeries, timestamp: Date.now() });
    setNewSeries({ title: '', description: '' }); setEditingId(null);
  };

  const handleSaveEpisode = async () => {
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'episodes');
    const payload = { ...newEp, content: newEp.content.split('\n').filter(l => l.trim() !== '') };
    if (editingId) await updateDoc(doc(col, editingId), payload);
    else await addDoc(col, { ...payload, timestamp: Date.now() });
    setNewEp({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1' }); setEditingId(null);
  };

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

  // Filter episodes dynamically for the admin panel based on the selected category
  const adminDisplayedEpisodes = episodes.filter(ep => newEp.seriesId ? ep.seriesId === newEp.seriesId : true);

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans overflow-hidden relative transition-colors duration-1000 selection:bg-[var(--brand-accent)] selection:text-white ${isDarkMode ? 'bg-[#000000] text-[#e8e7e7]' : 'bg-[#e8e7e7] text-[#1a1a1a]'}`} style={{ '--brand-accent': brandAccent }}>
      
      <audio 
        ref={audioRef} 
        onEnded={handleTrackEnd} 
        onError={(e) => {
          console.error("Audio Load Error: The element has no supported sources or file could not be found.", e);
          setIsPlaying(false);
        }}
      />
      
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-[100]" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M 0,0 L 100,0 L 100,100 L 0,100 Z" fill="none" stroke={brandAccent} strokeWidth="0.4" strokeDasharray="400" strokeDashoffset={400 - (progress * 4)} className="transition-all duration-300 ease-linear opacity-40" />
      </svg>

      <div className="w-full h-full flex flex-col z-10 flex-grow" onClick={() => menuOpen && setMenuOpen(false)}>
        <header className={`absolute top-0 left-0 w-full p-6 md:p-8 flex justify-between items-center z-40 transition-all duration-1000 ${isFocused ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'}`}>
          <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setMenuOpen(true); setMenuView('series'); }} className="opacity-80 hover:opacity-100 hover:text-[var(--brand-accent)] transition-all p-2 font-black uppercase tracking-widest text-[12px]">Library</button>
          <div className="flex items-center gap-4 md:gap-6">
            <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setIsDarkMode(!isDarkMode); }} className="p-2 opacity-60 hover:opacity-100 transition-all">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setFxOpen(!fxOpen); }} className={`p-2 transition-all ${fxOpen ? 'text-[var(--brand-accent)] opacity-100' : 'opacity-60 hover:opacity-100'}`}><Settings2 size={24} /></button>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 md:p-8 max-w-4xl mx-auto w-full relative z-10 pointer-events-none md:-mt-16">
          <div className={`w-full flex flex-col items-center transition-all duration-700 pointer-events-auto ${fxOpen || menuOpen || descOpen || adminOpen ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100'}`}>
            <div className={`text-center mb-8 w-full max-w-lg transition-all duration-1000 ${isFocused ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 uppercase leading-tight break-words">
                {currentTrack ? currentTrack.title : "Talk With Liam"}
              </h1>
              <p className="text-[12px] font-bold uppercase tracking-[0.4em] opacity-70 mt-2">
                {currentTrack ? "Talk With Liam: Sessions" : "Select a session from the library to begin"}
              </p>
            </div>
            
            {currentTrack && (
              <button onClick={() => setDescOpen(true)} className={`group flex items-center gap-3 mb-10 transition-all duration-1000 ${isFocused ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <span className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80 hover:opacity-100" style={{ color: brandAccent }}>Episode Description</span>
              </button>
            )}
            
            <canvas ref={canvasRef} width="1200" height="500" className={`w-full transition-all duration-1000 ease-in-out ${isFocused ? 'h-48 md:h-[45vh] opacity-100' : 'h-32 md:h-56 opacity-90'} ${currentTrack ? 'mb-12' : 'mb-16'}`} />
            
            <div className={`w-full flex flex-col items-center gap-10 transition-all duration-1000 ${isFocused ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center gap-8">
                {currentTrack ? (
                  <>
                    <button onClick={() => { audioRef.current.currentTime -= 15; }} className="opacity-40 hover:opacity-100"><RotateCcw size={22} /></button>
                    <button onClick={togglePlay} className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-[#e8e7e7] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#e8e7e7]'}`}>{isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}</button>
                    <button onClick={() => { audioRef.current.currentTime += 15; }} className="opacity-40 hover:opacity-100"><RotateCw size={22} /></button>
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setMenuOpen(true); setMenuView('series'); }} className={`px-8 py-4 rounded-full font-black uppercase tracking-widest text-[12px] shadow-xl transition-transform hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-[#e8e7e7] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#e8e7e7]'}`}>
                    Open Library
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <div className={`fixed inset-0 z-[120] backdrop-blur-3xl transition-all duration-700 ${descOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/95' : 'bg-white/95'}`} onClick={() => setDescOpen(false)}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center" onClick={e => e.stopPropagation()}>
          <button onClick={() => setDescOpen(false)} className="absolute top-8 right-8 p-4 opacity-70 hover:opacity-100"><X size={28} /></button>
          <div className="max-w-xl w-full">
            <p className="text-[12px] font-black uppercase tracking-[0.6em] mb-8" style={{ color: brandAccent }}>Episode Description</p>
            <h2 className="text-2xl md:text-4xl font-black uppercase mb-12 leading-tight">{currentTrack?.title}</h2>
            <div className="space-y-4 text-left mb-12 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
              {currentTrack?.content?.map((t, i) => <p key={i} className="text-[14px] opacity-80 italic leading-relaxed">{t}</p>)}
            </div>
            <a href="https://talkwithliam.co.uk/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group opacity-60 hover:opacity-100 transition-all justify-center">
                <HeartPulse size={14} className="group-hover:text-[var(--brand-accent)]" />
                <span className="text-[12px] font-black uppercase tracking-widest group-hover:text-[var(--brand-accent)]">My Practice: Talk With Liam</span>
            </a>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-[110] backdrop-blur-md transition-opacity duration-500 ${fxOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setFxOpen(false)}>
        <aside className={`absolute right-0 top-0 bottom-0 w-[85%] max-w-sm p-8 md:p-10 flex flex-col transform transition-transform duration-700 ${fxOpen ? 'translate-x-0' : 'translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className={`flex justify-between items-center mb-8 border-b pb-6 ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
            <h2 className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80">System Config</h2>
            <button onClick={() => setFxOpen(false)} className="p-2 opacity-60 hover:opacity-100"><X size={20} /></button>
          </div>
          <div className="flex-grow overflow-y-auto hide-scrollbar">
            <div className="mb-10">
              <span className="text-[12px] font-black uppercase tracking-widest opacity-40 mb-4 block">Haptics</span>
              <div onClick={() => setHapticHeartbeat(!hapticHeartbeat)} className="py-4 border-b border-current/5 cursor-pointer flex justify-between items-center">
                <div className="flex items-center gap-3"><Activity size={16}/><span className="text-[13px] font-bold">Sensory Pulse</span></div>
                <div className={`w-2 h-2 rounded-full ${hapticHeartbeat ? 'bg-[var(--brand-accent)]' : 'bg-current opacity-20'}`}/>
              </div>
              <div onClick={() => setHapticSubBass(!hapticSubBass)} className="py-4 border-b border-current/5 cursor-pointer flex justify-between items-center">
                <div className="flex items-center gap-3"><Waves size={16}/><span className="text-[13px] font-bold">Tactile Resonance</span></div>
                <div className={`w-2 h-2 rounded-full ${hapticSubBass ? 'bg-[var(--brand-accent)]' : 'bg-current opacity-20'}`}/>
              </div>
            </div>
            {/* FIX 2: Restored the missing Audio Profiles section */}
            <div>
              <span className="text-[12px] font-black uppercase tracking-widest opacity-40 mb-4 block">Audio Profiles</span>
              {['studio', 'midnight', 'vivid', 'spatial'].map(p => (
                <div key={p} onClick={() => setActivePreset(p)} className="py-4 border-b border-current/5 cursor-pointer flex justify-between items-center capitalize">
                  <span className={`text-[13px] font-bold ${activePreset === p ? 'text-[var(--brand-accent)]' : ''}`}>{p}</span>
                  {activePreset === p && <div className="w-2 h-2 rounded-full bg-[var(--brand-accent)]"/>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setFxOpen(false)} className="mt-auto py-6 text-[12px] font-black uppercase tracking-[0.5em] opacity-80 hover:text-[var(--brand-accent)] border-t border-white/10">Close Specs</button>
        </aside>
      </div>

      <div className={`fixed inset-0 z-[100] backdrop-blur-md transition-opacity duration-500 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/80' : 'bg-black/10'}`} onClick={() => setMenuOpen(false)}>
        <aside className={`absolute left-0 top-0 bottom-0 w-[85%] max-w-sm p-8 md:p-10 flex flex-col transform transition-transform duration-700 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className={`flex justify-between items-center mb-6 border-b pb-6 ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
            <h2 className="text-[12px] font-black uppercase tracking-[0.5em] opacity-80">{menuView === 'series' ? 'Library' : 'Episodes'}</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 opacity-60 hover:opacity-100"><X size={20} /></button>
          </div>
          <div className="flex-grow overflow-y-auto hide-scrollbar">
            {menuView === 'series' && series.map(s => (
              <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setMenuView('episodes'); }} className="py-6 border-b border-current/5 cursor-pointer flex items-center justify-between group">
                <h3 className="text-[15px] font-black tracking-tight group-hover:translate-x-2 transition-transform uppercase">{s.title}</h3>
                <ChevronRight size={16} className="text-[var(--brand-accent)] opacity-80" />
              </div>
            ))}
            {menuView === 'episodes' && (
              <div className="space-y-6">
                <button onClick={() => setMenuView('series')} className="flex items-center gap-2 text-[12px] font-black uppercase opacity-80 hover:text-[var(--brand-accent)]"><ArrowLeft size={12}/> Back</button>
                <div className="mb-6 flex flex-col items-start gap-2">
                  <h3 className="text-[18px] font-black tracking-tight uppercase leading-tight">{currentSeries?.title}</h3>
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
                        <div key={ep.id} onClick={() => playEpisode(ep)} className={`py-4 border-b cursor-pointer flex justify-between items-center ${isDarkMode ? 'border-white/5' : 'border-black/5'} ${currentTrack?.id === ep.id ? 'text-[var(--brand-accent)] border-[var(--brand-accent)]' : ''}`}>
                          <h3 className="text-[13px] font-bold">{ep.title}</h3>
                          <span className="text-[10px] font-mono opacity-40">{ep.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`mt-auto pt-6 flex items-center justify-between border-t ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
            <a href="https://talkwithliam.co.uk/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 opacity-60 hover:text-[var(--brand-accent)]"><HeartPulse size={12}/><span className="text-[11px] font-black uppercase tracking-widest">Practice</span></a>
            <button onClick={() => setAdminOpen(true)} className="flex items-center gap-1.5 opacity-60 hover:text-[var(--brand-accent)]"><Shield size={12}/><span className="text-[11px] font-black uppercase tracking-widest">Admin</span></button>
          </div>
        </aside>
      </div>

      <div className={`fixed inset-0 z-[130] backdrop-blur-3xl transition-all duration-700 ${adminOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-black/98' : 'bg-white/98'}`}>
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
          <button onClick={() => { setAdminOpen(false); setIsAuthorized(false); handleCancelEdit(); }} className="absolute top-6 right-6 p-4 opacity-70 hover:opacity-100"><X size={24} /></button>
          {!isAuthorized ? (
            <div className="max-w-xs w-full space-y-6 text-center">
              <Lock size={20} className="mx-auto" style={{ color: brandAccent }} />
              <input type="password" placeholder="****" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminGate()} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none text-center border focus:border-[var(--brand-accent)]" />
              <button onClick={handleAdminGate} className="w-full py-4 text-white font-black uppercase tracking-widest rounded-xl" style={{ backgroundColor: brandAccent }}>Unlock</button>
            </div>
          ) : (
            <div className="max-w-2xl w-full p-2 overflow-y-auto max-h-[85vh] hide-scrollbar">
               <div className="flex justify-center gap-6 mb-8">
                <button onClick={() => { setAdminTab('episodes'); handleCancelEdit(); }} className={`text-[12px] font-black uppercase pb-1 border-b-2 transition-all ${adminTab === 'episodes' ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]' : 'border-transparent opacity-40'}`}>Episodes</button>
                <button onClick={() => { setAdminTab('series'); handleCancelEdit(); }} className={`text-[12px] font-black uppercase pb-1 border-b-2 transition-all ${adminTab === 'series' ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]' : 'border-transparent opacity-40'}`}>Categories</button>
              </div>
              {adminTab === 'series' ? (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold uppercase opacity-50">{editingId ? 'Editing Category' : 'New Category'}</span>
                     {editingId && <button onClick={handleCancelEdit} className="text-[10px] text-red-500 uppercase font-bold">Cancel Edit</button>}
                  </div>
                  <input type="text" placeholder="Title" value={newSeries.title} onChange={e => setNewSeries({...newSeries, title: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  <input type="text" placeholder="Desc" value={newSeries.description} onChange={e => setNewSeries({...newSeries, description: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  <button onClick={handleSaveSeries} className="w-full py-3 border font-black uppercase tracking-widest rounded-xl" style={{ borderColor: brandAccent, color: brandAccent }}>
                    {editingId ? 'Update Category' : 'Save Category'}
                  </button>
                  <div className="pt-4 space-y-2">
                    {series.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                        <span className="text-[14px] font-bold">{s.title}</span>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handleEditSeries(s)} className="text-blue-500 opacity-60 hover:opacity-100 p-1"><Edit3 size={16}/></button>
                          <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'series', s.id)); }} className="text-red-500 opacity-60 hover:opacity-100 p-1"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold uppercase opacity-50">{editingId ? 'Editing Episode' : 'New Episode'}</span>
                     {editingId && <button onClick={handleCancelEdit} className="text-[10px] text-red-500 uppercase font-bold">Cancel Edit</button>}
                  </div>
                  <select value={newEp.seriesId} onChange={e => setNewEp({...newEp, seriesId: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none">
                    <option value="">All Categories (Select to filter below)...</option>
                    {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <input type="text" placeholder="Title" value={newEp.title} onChange={e => setNewEp({...newEp, title: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  <div className="flex gap-2">
                    <input type="text" placeholder="Duration (eg 42:00)" value={newEp.duration} onChange={e => setNewEp({...newEp, duration: e.target.value})} className="flex-grow bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                    <input type="text" placeholder="Season" value={newEp.season} onChange={e => setNewEp({...newEp, season: e.target.value})} className="w-20 bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  </div>
                  <input type="text" placeholder="Audio Path (audio/filename.mp3)" value={newEp.fileId} onChange={e => setNewEp({...newEp, fileId: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  <textarea placeholder="Description" rows={4} value={newEp.content} onChange={e => setNewEp({...newEp, content: e.target.value})} className="w-full bg-black/10 dark:bg-white/10 p-4 rounded-xl outline-none" />
                  <button onClick={handleSaveEpisode} className="w-full py-4 text-white font-black uppercase tracking-widest rounded-xl" style={{ backgroundColor: brandAccent }}>
                    {editingId ? 'Update Episode' : 'Publish Episode'}
                  </button>
                  <div className="pt-4 space-y-2 pb-10">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <span className="text-[10px] font-bold uppercase opacity-50">{newEp.seriesId ? 'Episodes in Selected Category' : 'All Episodes'}</span>
                    </div>
                    {adminDisplayedEpisodes.map(ep => (
                      <div key={ep.id} className="flex justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                        <span className="text-[12px] font-bold truncate max-w-[200px]">{ep.title}</span>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handleEditEpisode(ep)} className="text-blue-500 opacity-60 hover:opacity-100 p-1"><Edit3 size={16}/></button>
                          <button onClick={async () => { if(window.confirm('Delete?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'episodes', ep.id)); }} className="text-red-500 opacity-60 hover:opacity-100 p-1"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                    {adminDisplayedEpisodes.length === 0 && (
                      <p className="text-center text-[12px] opacity-40 py-4">No episodes found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}