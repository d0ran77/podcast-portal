import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Menu, X, Settings2, 
  RotateCcw, RotateCw, ChevronRight, 
  ArrowLeft, Volume2, Sparkles, 
  Mic2, Moon, Sun, Tv, HeartPulse, Code2,
  Plus, Trash2, Shield, Lock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

/**
 * THE DESIGN SYSTEM: EDITORIAL MINIMALISM
 * Restored: Practice Links, Developer Links, & Audio Profiles
 */

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
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

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'podcastld-portal';
const portalAppId = rawAppId.replace(/\//g, '_');

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
  const [intensity, setIntensity] = useState(0); 
  const [volume, setVolume] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activePreset, setActivePreset] = useState('none');

  // Admin States
  const [adminPass, setAdminPass] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [newSeries, setNewSeries] = useState({ title: '', description: '' });
  const [newEp, setNewEp] = useState({ title: '', duration: '', content: '', fileId: '', seriesId: '', season: '1' });

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const analyzerRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const isDarkRef = useRef(isDarkMode);

  // 1. AUTH
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth Error:", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNC
  useEffect(() => {
    if (!user) return;
    
    const seriesCol = collection(db, 'artifacts', portalAppId, 'public', 'data', 'series');
    const unsubSeries = onSnapshot(seriesCol, (snap) => {
      setSeries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const episodesCol = collection(db, 'artifacts', portalAppId, 'public', 'data', 'episodes');
    const unsubEps = onSnapshot(episodesCol, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setEpisodes(sorted);
      if (!currentTrack && sorted.length > 0) setCurrentTrack(sorted[0]);
    });

    return () => { unsubSeries(); unsubEps(); };
  }, [user, portalAppId, currentTrack]);

  useEffect(() => { isDarkRef.current = isDarkMode; }, [isDarkMode]);

  // --- ACTIONS ---
  const handleAdminGate = () => {
    if (adminPass === "portal") {
      setIsAuthorized(true);
      setAdminPass("");
    } else {
      alert("Invalid Access Code");
    }
  };

  const handleAddSeries = async () => {
    if (!newSeries.title) return;
    const col = collection(db, 'artifacts', portalAppId, 'public', 'data', 'series');
    await addDoc(col, { ...newSeries, timestamp: Date.now() });
    setNewSeries({ title: '', description: '' });
  };

  const handleAddEpisode = async () => {
    if (!newEp.title || !newEp.seriesId) return;
    const col = collection(db, 'artifacts', portalAppId, 'public', 'data', 'episodes');
    await addDoc(col, {
      ...newEp,
      content: newEp.content.split('\n').filter(l => l.trim() !== ''),
      timestamp: Date.now()
    });
    setNewEp({ title: '', duration: '', content: '', fileId: '', seriesId: newEp.seriesId, season: '1' });
  };

  const deleteItem = async (colName, id) => {
    if (!window.confirm("Permanent delete?")) return;
    const docRef = doc(db, 'artifacts', portalAppId, 'public', 'data', colName, id);
    await deleteDoc(docRef);
  };

  const playEpisode = (ep) => {
    if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audioRef.current);
        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 512;
        source.connect(analyzer);
        analyzer.connect(ctx.destination);
        audioContextRef.current = ctx; analyzerRef.current = analyzer;
    }
    audioRef.current.src = ep.fileId.startsWith('http') ? ep.fileId : `audio/${ep.fileId}`;
    setCurrentTrack(ep);
    setIsPlaying(true);
    setProgress(0);
    setMenuOpen(false);
    setDescOpen(false);
    setTimeout(() => {
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
      audioRef.current.play();
    }, 100);
  };

  const draw = () => {
    if (!canvasRef.current || !analyzerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyzer = analyzerRef.current;
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    const render = () => {
      animationRef.current = requestAnimationFrame(render);
      analyzer.getByteFrequencyData(dataArray);
      let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
      const curIntensity = sum / dataArray.length / 255;
      setIntensity(curIntensity);
      ctx.fillStyle = isDarkRef.current ? 'rgba(10, 10, 10, 0.3)' : 'rgba(232, 231, 231, 0.3)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.beginPath();
      ctx.lineWidth = 1.5 + (curIntensity * 14);
      ctx.strokeStyle = '#f28d35';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(0, mid);
      const limit = Math.floor(dataArray.length / 2.8), slices = w / limit;
      let x = 0;
      for (let i = 0; i < limit; i++) {
        const amp = dataArray[i] / 255, pin = Math.sin((i / limit) * Math.PI);
        const y = mid + (i % 2 === 0 ? 1 : -1) * (amp * h * 0.4) * pin;
        ctx.lineTo(x, y); x += slices;
      }
      ctx.lineTo(w, mid);
      ctx.stroke();
    };
    render();
  };

  useEffect(() => {
    if (isPlaying) draw();
    else {
      cancelAnimationFrame(animationRef.current);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.beginPath(); ctx.lineWidth = 1; 
        ctx.strokeStyle = isDarkMode ? '#e8e7e710' : '#1a1a1a10';
        ctx.moveTo(0, canvasRef.current.height / 2); ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
        ctx.stroke();
      }
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, isDarkMode]);

  useEffect(() => {
    const audio = audioRef.current;
    const up = () => setProgress((audio.currentTime / audio.duration) * 100 || 0);
    audio.addEventListener('timeupdate', up);
    return () => audio.removeEventListener('timeupdate', up);
  }, []);

  const currentSeries = series.find(s => s.id === selectedSeriesId);
  const seriesEpisodes = episodes.filter(ep => ep.seriesId === selectedSeriesId);

  return (
    <div className={`min-h-screen flex flex-col font-sans overflow-hidden relative transition-colors duration-700 selection:bg-[#f28d35] selection:text-white ${isDarkMode ? 'bg-[#0a0a0a] text-[#e8e7e7]' : 'bg-[#e8e7e7] text-[#1a1a1a]'}`}>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
      
      <header className="w-full p-8 flex justify-between items-center z-40">
        <button onClick={() => { setMenuOpen(true); setMenuView('series'); }} className="hover:text-[#f28d35] transition-colors p-2">
          <Menu size={28} />
        </button>
        <div className="flex items-center gap-6">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 opacity-30 hover:opacity-100 transition-all">
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button onClick={() => setFxOpen(!fxOpen)} className={`p-2 transition-colors ${fxOpen ? 'text-[#f28d35]' : 'opacity-20 hover:opacity-100'}`}>
            <Settings2 size={28} />
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-8 max-w-4xl mx-auto w-full relative z-10">
        <div className={`w-full flex flex-col items-center transition-all duration-700 ${fxOpen || menuOpen || descOpen || adminOpen ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100'}`}>
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-4 uppercase leading-none transition-all duration-75" style={{ letterSpacing: `${-0.05 + (intensity * 0.1)}em`, transform: `scale(${1 + (intensity * 0.01)})` }}>
              {currentTrack ? currentTrack.title : "Library Empty"}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-30">Talk With Liam</p>
          </div>

          <button onClick={() => setDescOpen(true)} className="group flex items-center gap-3 mb-12">
            <div className={`w-8 h-[1px] transition-all group-hover:bg-[#f28d35] ${isDarkMode ? 'bg-[#e8e7e7]/10' : 'bg-[#1a1a1a]/10'}`} />
            <span className="text-[9px] font-black uppercase tracking-[0.5em] opacity-40 group-hover:text-[#f28d35] transition-colors">Episode Description</span>
            <div className={`w-8 h-[1px] transition-all group-hover:bg-[#f28d35] ${isDarkMode ? 'bg-[#e8e7e7]/10' : 'bg-[#1a1a1a]/10'}`} />
          </button>

          <div className="w-full h-40 mb-16">
            <canvas ref={canvasRef} width="1200" height="300" className="w-full h-full" />
          </div>

          <div className="flex flex-col items-center gap-10">
            <div className="flex items-center gap-10">
              <button onClick={() => audioRef.current.currentTime -= 15} className="opacity-10 hover:opacity-100 transition-opacity"><RotateCcw size={24} /></button>
              <button onClick={() => {
                if (!currentTrack) return;
                isPlaying ? audioRef.current.pause() : audioRef.current.play();
                setIsPlaying(!isPlaying);
              }} className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-[#e8e7e7] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#e8e7e7]'}`}>
                  {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1.5" />}
              </button>
              <button onClick={() => audioRef.current.currentTime += 15} className="opacity-10 hover:opacity-100 transition-opacity"><RotateCw size={24} /></button>
            </div>
            <div className={`w-72 h-[1px] relative ${isDarkMode ? 'bg-[#e8e7e7]/10' : 'bg-[#1a1a1a]/10'}`}>
              <div className="absolute left-0 top-0 h-full bg-[#f28d35] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </main>

      {/* Description Overlay */}
      <div className={`fixed inset-0 z-[60] backdrop-blur-3xl transition-all duration-700 ${descOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-[#0a0a0a]/95' : 'bg-[#e8e7e7]/95'}`} onClick={() => setDescOpen(false)}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center" onClick={e => e.stopPropagation()}>
          <button onClick={() => setDescOpen(false)} className="absolute top-10 right-10 p-4 hover:rotate-90 transition-transform"><X size={32} /></button>
          <div className="max-w-xl w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.6em] text-[#f28d35] mb-12">Episode Description</p>
            <h2 className="text-3xl md:text-5xl font-black uppercase mb-16 leading-tight">{currentTrack?.title}</h2>
            <div className="space-y-6 text-left mb-16">
              {currentTrack?.content?.map((text, i) => <p key={i} className="text-lg opacity-70 italic leading-relaxed">{text}</p>)}
            </div>
            <div className={`pt-8 border-t flex justify-center ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}>
              <a href="https://share.google/gYraySbO0BsSwCmd4" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group opacity-40 hover:opacity-100">
                <HeartPulse size={14} className="group-hover:text-[#f28d35]" />
                <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-[#f28d35]">My Practice: Talk With Liam</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Archive Sidebar */}
      <div className={`fixed inset-0 z-[70] backdrop-blur-md transition-opacity duration-500 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-[#e8e7e7]/5' : 'bg-[#1a1a1a]/10'}`} onClick={() => setMenuOpen(false)}>
        <aside className={`absolute left-0 top-0 bottom-0 w-full max-w-sm p-10 flex flex-col transform transition-transform duration-700 ${menuOpen ? 'translate-x-0' : 'translate-x-[-100%]'} ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#e8e7e7]'}`} onClick={e => e.stopPropagation()}>
          <div className={`flex justify-between items-center mb-10 border-b pb-6 ${isDarkMode ? 'border-[#e8e7e7]/10' : 'border-[#1a1a1a]/10'}`}>
            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] opacity-40">{menuView === 'series' ? 'Library' : 'Episodes'}</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 hover:text-[#f28d35]"><X size={24} /></button>
          </div>

          <div className="flex-grow overflow-y-auto space-y-2 custom-scrollbar pr-2">
            {menuView === 'series' && series.map(s => (
              <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setMenuView('episodes'); }} className={`group py-6 border-b transition-all cursor-pointer flex items-center justify-between ${isDarkMode ? 'border-[#e8e7e7]/10 hover:border-[#e8e7e7]/30' : 'border-[#1a1a1a]/10 hover:border-[#1a1a1a]/30'}`}>
                <div>
                  <h3 className="text-xl font-black tracking-tight mb-1 group-hover:translate-x-2 transition-transform">{s.title}</h3>
                  <p className="text-[9px] uppercase tracking-widest opacity-40">{s.description}</p>
                </div>
                <ChevronRight size={18} className="opacity-20 group-hover:opacity-100 group-hover:text-[#f28d35]" />
              </div>
            ))}

            {menuView === 'episodes' && (
              <div className="space-y-6">
                <button onClick={() => setMenuView('series')} className="flex items-center gap-2 text-[9px] font-black uppercase opacity-40 hover:opacity-100 hover:text-[#f28d35] transition-colors mb-4">
                  <ArrowLeft size={14}/> Back
                </button>
                <div className="mb-8">
                  <h3 className="text-2xl font-black tracking-tight mb-2">{currentSeries?.title}</h3>
                  <p className="text-[10px] uppercase opacity-40">{currentSeries?.description}</p>
                </div>
                {seriesEpisodes.map(ep => (
                  <div key={ep.id} onClick={() => playEpisode(ep)} className={`py-5 border-b cursor-pointer flex justify-between items-center group ${currentTrack?.id === ep.id ? 'border-[#f28d35]' : (isDarkMode ? 'border-[#e8e7e7]/10' : 'border-[#1a1a1a]/10')}`}>
                    <h3 className={`text-sm font-bold group-hover:translate-x-2 transition-transform ${currentTrack?.id === ep.id ? 'text-[#f28d35]' : ''}`}>{ep.title}</h3>
                    <span className="text-[9px] font-mono opacity-40 uppercase">{ep.duration}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SIDEBAR FOOTER: Restored utility links */}
          <div className={`mt-auto pt-6 flex items-center gap-8 shrink-0 border-t ${isDarkMode ? 'border-[#e8e7e7]/10' : 'border-[#1a1a1a]/10'}`}>
            <a href="https://share.google/gYraySbO0BsSwCmd4" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group no-underline opacity-30 hover:opacity-100 transition-all">
              <HeartPulse size={12} className="group-hover:text-[#f28d35]" />
              <span className="text-[8px] font-black uppercase tracking-widest">Practice</span>
            </a>
            <a href="https://share.google/67Y6tixM6IhnO4jRU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group no-underline opacity-30 hover:opacity-100 transition-all">
              <Code2 size={12} className="group-hover:text-[#f28d35]" />
              <span className="text-[8px] font-black uppercase tracking-widest">Developer</span>
            </a>
            <button onClick={() => { setAdminOpen(true); setMenuOpen(false); }} className="flex items-center gap-2 group opacity-30 hover:opacity-100 transition-all">
              <Shield size={12} className="group-hover:text-[#f28d35]" />
              <span className="text-[8px] font-black uppercase tracking-widest">Admin Control</span>
            </button>
          </div>
        </aside>
      </div>

      {/* FX Settings Menu: Restored options */}
      <div className={`fixed inset-0 z-[60] backdrop-blur-3xl transition-all duration-700 ${fxOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-[#0a0a0a]/95' : 'bg-[#e8e7e7]/95'}`} onClick={() => setFxOpen(false)}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8" onClick={e => e.stopPropagation()}>
          <button onClick={() => setFxOpen(false)} className="absolute top-10 right-10 p-4"><X size={32} /></button>
          <div className="max-w-md w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.6em] text-[#f28d35] mb-12 text-center">Audio Profiles</p>
            <div className="space-y-2 mb-16">
              {[
                { id: 'studio', name: 'Studio', Icon: Mic2, desc: 'Professional level presence' },
                { id: 'midnight', name: 'Midnight', Icon: Moon, desc: 'Subtle, dark soundscape' },
                { id: 'vivid', name: 'Vivid', Icon: Sparkles, desc: 'High definition clarity' },
                { id: 'spatial', name: 'Spatial', Icon: Tv, desc: 'Clinical room synthesis' }
              ].map(p => (
                <div key={p.id} onClick={() => setActivePreset(p.id)} className={`py-6 border-b cursor-pointer flex items-center justify-between group ${activePreset === p.id ? 'border-[#f28d35]' : 'border-white/10'}`}>
                  <div className="flex items-center gap-6">
                    <div className={activePreset === p.id ? 'text-[#f28d35]' : 'opacity-20'}>
                      <p.Icon size={20} />
                    </div>
                    <div>
                      <h3 className={`text-xl font-black group-hover:translate-x-2 transition-transform ${activePreset === p.id ? 'text-[#f28d35]' : ''}`}>{p.name}</h3>
                      <p className="text-[9px] uppercase tracking-widest opacity-40">{p.desc}</p>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${activePreset === p.id ? 'bg-[#f28d35] shadow-[0_0_10px_#f28d35]' : 'bg-transparent'}`} />
                </div>
              ))}
            </div>
            <div className="py-6 border-b border-white/10 flex items-center gap-8 mb-16">
              <Volume2 size={20} className="opacity-20" />
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => { setVolume(e.target.value); audioRef.current.volume = e.target.value; }} className="flex-grow h-[2px] bg-white/10 appearance-none rounded-full accent-[#f28d35] cursor-pointer" />
            </div>
            <button onClick={() => setFxOpen(false)} className="mx-auto block text-[10px] font-black uppercase tracking-[0.4em] opacity-40 hover:text-[#f28d35] transition-colors">Return to stage</button>
          </div>
        </div>
      </div>

      {/* Admin Dashboard / Auth Gate */}
      <div className={`fixed inset-0 z-[80] backdrop-blur-3xl transition-all duration-700 ${adminOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDarkMode ? 'bg-[#0a0a0a]/98' : 'bg-[#e8e7e7]/98'}`}>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 relative">
          <button onClick={() => { setAdminOpen(false); setIsAuthorized(false); }} className="absolute top-10 right-10 p-4"><X size={32} /></button>
          
          {!isAuthorized ? (
            <div className="max-w-xs w-full space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#f28d35]/10 flex items-center justify-center mx-auto mb-8">
                <Lock size={24} className="text-[#f28d35]" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest">Secure Access</h2>
              <input 
                type="password" 
                placeholder="Access Code" 
                value={adminPass} 
                onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdminGate()}
                className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none text-center border border-transparent focus:border-[#f28d35]" 
              />
              <button onClick={handleAdminGate} className="w-full py-4 bg-[#f28d35] text-white font-black uppercase tracking-widest rounded-xl">Unlock</button>
            </div>
          ) : (
            <div className="max-w-2xl w-full flex flex-col md:flex-row gap-12 overflow-y-auto max-h-[80vh] custom-scrollbar p-4">
              
              {/* Left Column: Series Management */}
              <div className="flex-1 space-y-8">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-6">Manage Library Folders</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="Series Title" value={newSeries.title} onChange={e => setNewSeries({...newSeries, title: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    <input type="text" placeholder="Brief Description" value={newSeries.description} onChange={e => setNewSeries({...newSeries, description: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    <button onClick={handleAddSeries} className="w-full py-3 border border-[#f28d35] text-[#f28d35] font-black uppercase tracking-widest rounded-xl hover:bg-[#f28d35] hover:text-white transition-all">Add Folder</button>
                  </div>
                </div>
                <div className="space-y-2">
                   {series.map(s => (
                     <div key={s.id} className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-lg">
                       <span className="text-xs font-bold truncate">{s.title}</span>
                       <button onClick={() => deleteItem('series', s.id)} className="text-red-500 opacity-40 hover:opacity-100"><Trash2 size={14}/></button>
                     </div>
                   ))}
                </div>
              </div>

              {/* Right Column: Episode Management */}
              <div className="flex-1 space-y-8">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-6">Publish Episode</h3>
                  <div className="space-y-4">
                    <select value={newEp.seriesId} onChange={e => setNewEp({...newEp, seriesId: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none">
                      <option value="">Select Series Folder</option>
                      {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                    <input type="text" placeholder="Episode Title" value={newEp.title} onChange={e => setNewEp({...newEp, title: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    <div className="flex gap-4">
                       <input type="text" placeholder="Duration (45:00)" value={newEp.duration} onChange={e => setNewEp({...newEp, duration: e.target.value})} className="flex-1 bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                       <input type="text" placeholder="Season #" value={newEp.season} onChange={e => setNewEp({...newEp, season: e.target.value})} className="w-24 bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    </div>
                    <input type="text" placeholder="MP3 Link / File Name" value={newEp.fileId} onChange={e => setNewEp({...newEp, fileId: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    <textarea placeholder="Description (Bullet points)" rows={3} value={newEp.content} onChange={e => setNewEp({...newEp, content: e.target.value})} className="w-full bg-black/5 dark:bg-white/5 p-4 rounded-xl outline-none" />
                    <button onClick={handleAddEpisode} className="w-full py-4 bg-[#f28d35] text-white font-black uppercase tracking-widest rounded-xl">Publish Entry</button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
                  {episodes.map(ep => (
                    <div key={ep.id} className="flex items-center justify-between p-3 border-b border-black/5 dark:border-white/5">
                      <span className="text-[10px] font-bold uppercase truncate max-w-[150px]">{ep.title}</span>
                      <button onClick={() => deleteItem('episodes', ep.id)} className="text-red-500 opacity-40 hover:opacity-100"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
}