import { useState, useEffect, useCallback } from 'react';
import { onSnapshot, collection, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clipboard, ChevronLeft, ChevronRight, LogOut, Loader2 } from 'lucide-react';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { ALL_SESSIONS, AREAS } from './constants';
import { UserSessionData, SessionInfo } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentDay, setCurrentDay] = useState(1);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userData, setUserData] = useState<Record<string, UserSessionData>>(() => {
    const saved = localStorage.getItem('guest_user_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('Copied to clipboard');
  const [saving, setSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Login Error:', err);
      if (err?.code === 'auth/popup-blocked') {
        setAuthError('Popup blocked! Please allow popups for this site.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setAuthError('Google Login is not yet enabled. Try again in a minute.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setAuthError(`This domain (${window.location.hostname}) is not authorized in Firebase. Please add it to your Authorized Domains in the Firebase Console.`);
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in window closed. Please try again.');
      } else {
        setAuthError(`Sign in failed: ${err.message || 'Please try again.'}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Persistence for Guest
  useEffect(() => {
    if (user?.uid === 'guest') {
      localStorage.setItem('guest_user_data', JSON.stringify(userData));
    }
  }, [userData, user]);

  // Auth observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data observer
  useEffect(() => {
    if (!user) {
      setUserData({});
      return;
    }

    const path = `users/${user.uid}/sessions`;
    const unsubscribe = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const newData: Record<string, UserSessionData> = {};
        snapshot.forEach((doc) => {
          newData[doc.id] = doc.data() as UserSessionData;
        });
        setUserData(newData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return unsubscribe;
  }, [user]);

  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const currentSessions = ALL_SESSIONS.filter(s => s.day === currentDay);

  const updateSessionField = useCallback(async (sid: string, field: keyof UserSessionData, value: string | string[]) => {
    if (!user || user.uid === 'guest') {
      setUserData(prev => ({
        ...prev,
        [sid]: { ...(prev[sid] || { C: '', F: '', O: '', takeaways: Array(10).fill(''), reflect: '', action: '', area: '', deadline: '' }), [field]: value } as any
      }));
      return;
    }
    setSaving(true);
    const path = `users/${user.uid}/sessions/${sid}`;
    const existing = userData[sid] || {
      C: '', F: '', O: '', takeaways: Array(10).fill(''), reflect: '', action: '', area: '', deadline: ''
    };

    try {
      await setDoc(doc(db, path), {
        ...existing,
        [field]: value,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  }, [user, userData]);

  const updateTakeaway = (sid: string, idx: number, value: string) => {
    const currentTakeaways = [...(userData[sid]?.takeaways || Array(10).fill(''))];
    currentTakeaways[idx] = value;
    updateSessionField(sid, 'takeaways', currentTakeaways);
  };

  const calculateProgress = () => {
    let filledCount = 0;
    const totalPotential = ALL_SESSIONS.length * 10;

    ALL_SESSIONS.forEach(s => {
      const d = userData[s.id];
      if (!d) return;

      if (d.C?.trim()) filledCount++;
      if (d.F?.trim()) filledCount++;
      if (d.O?.trim()) filledCount++;
      filledCount += Math.min((d.takeaways || []).filter(t => t?.trim()).length, 4);
      if (d.reflect?.trim()) filledCount += 2;
      if (d.action?.trim()) filledCount++;
    });

    return Math.min(Math.round((filledCount / totalPotential) * 100), 100);
  };

  const isSessionDone = (sid: string) => {
    const d = userData[sid];
    if (!d) return false;
    return d.C?.trim() || d.F?.trim() || d.O?.trim() || (d.takeaways || []).some(t => t?.trim()) || d.reflect?.trim();
  };

  const copySection = async (sid: string) => {
    const s = ALL_SESSIONS.find(session => session.id === sid);
    if (!s) return;
    
    // Get fresh data from state
    const d = userData[sid] || { C: '', F: '', O: '', takeaways: [], reflect: '', action: '', area: '', deadline: '' };
    
    let out = `QUEENS OF AI SUMMIT — SESSION NOTES\n`;
    out += `Session: ${s.title}\n`;
    out += `Speaker: ${s.speaker}\n`;
    out += `Category: ${s.cat}\n`;
    out += `${'='.repeat(40)}\n\n`;
    
    out += `[CFO FILTER]\n`;
    out += `C (Clarity): ${d.C?.trim() || '(None entered)'}\n`;
    out += `F (Foundation): ${d.F?.trim() || '(None entered)'}\n`;
    out += `O (Outcome): ${d.O?.trim() || '(None entered)'}\n\n`;
    
    out += `[MY TOP 10 TAKEAWAYS]\n`;
    const takeaways = d.takeaways || Array(10).fill('');
    const typedTakeaways = takeaways.filter(t => t?.trim());
    if (typedTakeaways.length > 0) {
      typedTakeaways.forEach((t, j) => {
        out += `${j + 1}. ${t.trim()}\n`;
      });
    } else {
      out += `(No takeaways entered yet)\n`;
    }
    out += '\n';
    
    if (d.reflect?.trim()) {
      out += `[REFLECTION]\n${d.reflect.trim()}\n\n`;
    }
    
    out += `[CFO-LEVEL STRATEGY]\n${s.cfo}\n\n`;
    
    if (d.action?.trim()) {
      out += `[MY MOVE]\nAction: ${d.action.trim()}\n`;
      const areaObj = AREAS.find(a => a.id === d.area);
      if (areaObj) out += `Focus Area: ${areaObj.label}\n`;
      if (d.deadline) out += `Target Date: ${d.deadline}\n`;
    }
    
    try {
      await navigator.clipboard.writeText(out);
      setToastMsg('Copied session notes');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const copyDayGuide = async (day: number) => {
    let out = `QUEENS OF AI SUMMIT — DAY ${day} GUIDE\nClarity. Foundation. Outcome.\nKB Training Group\n` + '='.repeat(60) + '\n\n';
    
    ALL_SESSIONS.filter(s => s.day === day).forEach((s, i) => {
      const d = userData[s.id] || { C: '', F: '', O: '', takeaways: [], reflect: '', action: '', area: '', deadline: '' };
      out += `Session ${i + 1}: ${s.title}\nSpeaker: ${s.speaker} | ${s.cat}\n${'-'.repeat(50)}\n\n`;
      out += `CFO FILTER\nC — Clarity: ${d.C?.trim() || '(not filled)'}\nF — Foundation: ${d.F?.trim() || '(not filled)'}\nO — Outcome: ${d.O?.trim() || '(not filled)'}\n\n`;
      out += `MY 10 TAKEAWAYS\n`;
      const takeaways = d.takeaways || Array(10).fill('');
      takeaways.forEach((t, j) => out += `  ${j + 1}. ${t?.trim() || '(not filled)'}\n`);
      out += '\n';
      if (d.reflect?.trim()) out += `REFLECTION\n${d.reflect.trim()}\n\n`;
      out += `CFO STRATEGY\n${s.cfo}\n\n`;
      if (d.action?.trim()) {
        out += `MY MOVE\n${d.action.trim()}\n`;
        const areaObj = AREAS.find(a => a.id === d.area);
        if (areaObj) out += `Area: ${areaObj.label}\n`;
        if (d.deadline) out += `Deadline: ${d.deadline}\n`;
        out += '\n';
      }
      out += '='.repeat(60) + '\n\n';
    });
    
    try {
      await navigator.clipboard.writeText(out);
      setToastMsg(`Day ${day} guide copied`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const copyAll = async () => {
    let out = 'QUEENS OF AI SUMMIT — FULL SESSION GUIDE\nClarity. Foundation. Outcome.\nKaryn Buggs | AI Pro CFO | KB Training Group\n' + '='.repeat(60) + '\n\n';
    
    [1, 2].forEach(day => {
      out += `DAY ${day} — MAY ${day === 1 ? '1' : '2'}, 2026\n` + '='.repeat(60) + '\n\n';
      ALL_SESSIONS.filter(s => s.day === day).forEach((s, i) => {
        const d = userData[s.id] || { C: '', F: '', O: '', takeaways: [], reflect: '', action: '', area: '', deadline: '' };
        out += `Session ${i + 1}: ${s.title}\nSpeaker: ${s.speaker} | ${s.cat}\n${'-'.repeat(50)}\n\n`;
        out += `CFO FILTER\nC — Clarity: ${d.C?.trim() || '(not filled)'}\nF — Foundation: ${d.F?.trim() || '(not filled)'}\nO — Outcome: ${d.O?.trim() || '(not filled)'}\n\n`;
        out += `MY 10 TAKEAWAYS\n`;
        const takeaways = d.takeaways || Array(10).fill('');
        takeaways.forEach((t, j) => out += `  ${j + 1}. ${t?.trim() || '(not filled)'}\n`);
        out += '\n';
        if (d.reflect?.trim()) out += `REFLECTION\n${d.reflect.trim()}\n\n`;
        out += `CFO STRATEGY\n${s.cfo}\n\n`;
        if (d.action?.trim()) {
          out += `MY MOVE\n${d.action.trim()}\n`;
          const areaObj = AREAS.find(a => a.id === d.area);
          if (areaObj) out += `Area: ${areaObj.label}\n`;
          if (d.deadline) out += `Deadline: ${d.deadline}\n`;
          out += '\n';
        }
        out += '='.repeat(60) + '\n\n';
      });
    });
    
    out += 'AI Pro CFO Cohort waitlist: linkedin.com/in/karynjeneen\n';

    try {
      await navigator.clipboard.writeText(out);
      setToastMsg('Full guide copied');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f3]">
        <Loader2 className="w-8 h-8 text-[#0D1B3E] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        className="min-h-screen flex flex-col items-center justify-center p-6 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: 'linear-gradient(135deg, #E0C3FC 0%, #8EC5FC 100%), url("/background.png")',
          backgroundColor: '#E0C3FC' 
        }}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20 mb-6"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#0D1B3E] mb-2">Queens of AI Summit</h1>
            <p className="text-gray-600 font-medium">AI ROI & Readiness</p>
          </div>
          <button
            onClick={handleLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#0D1B3E] text-[#C9A84C] py-4 rounded-xl font-bold text-lg hover:bg-[#162850] active:scale-95 transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {authLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center p-1 shadow-sm">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
                </div>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
          
          {authError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center leading-relaxed font-medium">
              <p className="mb-2">⚠️ {authError}</p>
            </div>
          )}

          <p className="text-[11px] text-center text-gray-400 mb-2">
            Sign in to save your reflections across all devices.
          </p>
          <div className="pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">May 1 & 2, 2026</p>
          </div>
        </motion.div>
        
        <button 
          onClick={() => setUser({ uid: 'guest', email: 'guest@example.com' } as any)}
          className="text-sm text-white underline font-medium drop-shadow-md"
        >
          Continue as Guest (Local Save Only)
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f3] text-[#1a1a1a] p-4 font-sans">
      <div className="max-w-2xl mx-auto py-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-medium mb-1">Queens of AI Summit — Session Guide</h2>
            <p className="text-sm text-gray-500">May 1 and 2, 2026 • AI ROI & Readiness</p>
          </div>
          <button 
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Day Tabs */}
        <div className="flex gap-2 mb-4">
          {[1, 2].map(day => (
            <button
              key={day}
              onClick={() => { setCurrentDay(day); setOpenSessionId(null); }}
              className={`flex-1 py-2 px-4 border rounded-xl text-sm font-medium transition-colors ${
                currentDay === day 
                  ? 'bg-[#0D1B3E] text-[#C9A84C] border-[#0D1B3E]' 
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
            >
              Day {day} • May {day}
            </button>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
           <div className="flex justify-between items-center mb-1.5">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Guide Progress</span>
             <span className="text-[10px] font-bold text-[#C9A84C]">{calculateProgress()}%</span>
           </div>
           <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${calculateProgress()}%` }}
              className="h-full bg-[#C9A84C]"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="space-y-3">
          {currentSessions.map((session, i) => {
            const sid = session.id;
            const isOpen = openSessionId === sid;
            const d = userData[sid] || { C: '', F: '', O: '', takeaways: Array(10).fill(''), reflect: '', action: '', area: '', deadline: '' };
            const isDone = isSessionDone(sid);

            return (
              <div 
                key={sid} 
                className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${isOpen ? 'ring-1 ring-[#0D1B3E] border-transparent' : 'border-gray-200 hover:border-gray-300'}`}
              >
                {/* Header/Trigger */}
                <button 
                  onClick={() => setOpenSessionId(isOpen ? null : sid)}
                  className="w-full text-left p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${isDone ? 'bg-[#C9A84C] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-[9px] text-[#C9A84C] font-extrabold uppercase tracking-widest">{session.cat}</div>
                      <div className="text-sm font-bold text-[#1A2A4E] leading-tight flex items-center gap-2">
                        {session.title}
                        {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-[#C9A84C]" />}
                      </div>
                      <div className="text-[11px] text-gray-500">{session.speaker}</div>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Content */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-6 space-y-6 pt-2">
                        {/* CFO Block */}
                        <div className="space-y-5 bg-[#f9f9fb] p-4 rounded-xl border border-gray-100">
                           <CFOBlock 
                              letter="C" title="Clarity" 
                              question="What problem am I hoping this session helps me name or solve?"
                              nudge="What is happening in my business right now that brought me to this session?"
                              value={d.C}
                              onBlur={(v) => updateSessionField(sid, 'C', v)}
                            />
                            <div className="h-px bg-gray-200" />
                            <CFOBlock 
                              letter="F" title="Foundation" 
                              question="Is my business ready to act on what I learn here?"
                              nudge="What do I need to have in place before this makes sense for me?"
                              value={d.F}
                              onBlur={(v) => updateSessionField(sid, 'F', v)}
                            />
                            <div className="h-px bg-gray-200" />
                            <CFOBlock 
                              letter="O" title="Outcome" 
                              question="What would success look like if I applied this to my business?"
                              nudge="Let the session answer this for you — then write it here after."
                              value={d.O}
                              onBlur={(v) => updateSessionField(sid, 'O', v)}
                            />
                        </div>

                        {/* Takeaways */}
                        <div className="bg-white rounded-xl border border-gray-100 p-4">
                          <div className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-widest mb-4">My 10 takeaways</div>
                          <div className="space-y-2.5">
                            {Array.from({ length: 10 }).map((_, idx) => (
                              <div key={idx} className="flex items-center gap-3">
                                <span className="text-[11px] font-bold text-gray-300 w-4">{idx + 1}.</span>
                                <input 
                                  type="text"
                                  placeholder="Write a key takeaway..."
                                  value={d.takeaways?.[idx] || ''}
                                  onChange={(e) => {
                                    const newT = [...(d.takeaways || Array(10).fill(''))];
                                    newT[idx] = e.target.value;
                                    setUserData(prev => ({ ...prev, [sid]: { ...(prev[sid] || d), takeaways: newT } }));
                                  }}
                                  onBlur={(e) => updateTakeaway(sid, idx, e.target.value)}
                                  className="flex-1 border-b border-gray-100 py-1 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors bg-transparent"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Reflection & Strategy */}
                        <div className="space-y-4">
                           <div className="bg-[#faf7ee] p-4 rounded-xl border border-[#C9A84C]/20">
                             <div className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-wider mb-2">Reflect</div>
                             <p className="text-[11px] text-gray-600 italic mb-3">{session.reflect}</p>
                             <textarea 
                                placeholder="Your reflection..."
                                value={d.reflect}
                                onChange={(e) => setUserData(prev => ({ ...prev, [sid]: { ...(prev[sid] || d), reflect: e.target.value } }))}
                                onBlur={(e) => updateSessionField(sid, 'reflect', e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-lg p-3 text-sm min-h-[80px] focus:outline-none focus:border-[#C9A84C]"
                              />
                           </div>

                           <div className="bg-[#0D1B3E] rounded-xl p-4">
                              <div className="text-[9px] font-bold text-[#C9A84C] uppercase tracking-widest mb-1.5 opacity-80">CFO strategy insight</div>
                              <p className="text-[11px] text-gray-200 leading-relaxed font-medium">{session.cfo}</p>
                           </div>

                           <div className="bg-[#f0f4f8] p-4 rounded-xl border border-[#1A3A4A]/10">
                              <div className="text-[9px] font-bold text-[#1A3A4A] uppercase tracking-widest mb-3">Your Move (Action Plan)</div>
                              <div className="space-y-4">
                                <input 
                                  type="text"
                                  placeholder="The one thing I will do differently..."
                                  value={d.action}
                                  onChange={(e) => setUserData(prev => ({ ...prev, [sid]: { ...(prev[sid] || d), action: e.target.value } }))}
                                  onBlur={(e) => updateSessionField(sid, 'action', e.target.value)}
                                  className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#1A3A4A]"
                                />
                                <div className="flex flex-wrap gap-1.5">
                                  {AREAS.map(area => (
                                    <button
                                      key={area.id}
                                      onClick={() => updateSessionField(sid, 'area', d.area === area.id ? '' : area.id)}
                                      className={`text-[10px] px-3 py-1.5 rounded-full border transition-all ${
                                        d.area === area.id
                                          ? 'bg-[#1A3A4A] border-[#1A3A4A] text-white'
                                          : 'bg-white border-gray-300 text-gray-500'
                                      }`}
                                    >
                                      {area.label}
                                    </button>
                                  ))}
                                </div>
                                <input 
                                  type="date"
                                  value={d.deadline}
                                  onChange={(e) => setUserData(prev => ({ ...prev, [sid]: { ...(prev[sid] || d), deadline: e.target.value } }))}
                                  onBlur={(e) => updateSessionField(sid, 'deadline', e.target.value)}
                                  className="bg-white border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-[#1A3A4A]"
                                />
                              </div>
                           </div>
                        </div>

                        {/* Copy Section Button at the bottom */}
                        <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                          <button 
                            onClick={() => copySection(sid)}
                            className="w-full py-3 bg-white border border-[#C9A84C] text-[#C9A84C] rounded-xl flex items-center justify-center gap-2 text-sm font-bold hover:bg-[#C9A84C]/5 transition-colors"
                          >
                            <Clipboard className="w-4 h-4" />
                            Copy Session Notes
                          </button>

                          {i === currentSessions.length - 1 && (
                            <button 
                              onClick={() => copyDayGuide(currentDay)}
                              className="w-full py-4 bg-[#0D1B3E] text-white rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg hover:bg-[#162850] transition-all mt-2"
                            >
                              <Clipboard className="w-4 h-4 text-[#C9A84C]" />
                              Copy Complete Guide for Day {currentDay}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {currentDay === 2 && (
          <button 
            onClick={copyAll}
            className="w-full mt-8 py-4 bg-[#C9A84C] text-white rounded-xl font-bold shadow-xl hover:shadow-2xl transition-all"
          >
            Copy Full 2-Day Guide
          </button>
        )}

        {/* Info Text */}
        <div className="mt-8 text-center pb-12">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2">Powered by AI Pro CFO</p>
          <p className="text-xs text-gray-500 px-6">Your notes are saved {user?.uid === 'guest' ? 'on this device' : 'securely to your account'}.</p>
        </div>

        {/* Global UI Elements */}
        <div className="fixed bottom-8 left-1/2 -track-x-1/2 z-50 pointer-events-none">
          <AnimatePresence>
            {showToast && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-[#0D1B3E] text-[#C9A84C] px-6 py-3 rounded-xl text-sm shadow-2xl flex items-center gap-3 border border-[#C9A84C]/20 pointer-events-auto min-w-[200px] justify-center"
              >
                <CheckCircle2 className="w-4 h-4" /> {toastMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="fixed top-4 right-4 z-50">
           {saving && (
             <div className="bg-white/80 backdrop-blur px-3 py-1.5 rounded-full shadow-sm flex items-center gap-2 text-[10px] font-bold text-gray-400 border border-gray-100">
               <Loader2 className="w-3 h-3 animate-spin" /> Saving
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

function CFOBlock({ letter, title, question, nudge, value, onBlur }: { 
  letter: string, title: string, question: string, nudge: string, value: string, onBlur: (v: string) => void 
}) {
  const [localValue, setLocalValue] = useState(value);
  
  useEffect(() => setLocalValue(value), [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-7 h-7 rounded bg-[#1A2A4E] text-[#C9A84C] flex items-center justify-center font-bold text-xs">{letter}</span>
        <span className="font-extrabold text-xs text-[#1A2A4E] uppercase tracking-wider">{title}</span>
      </div>
      <div className="text-[11px] text-gray-700 font-bold leading-tight">{question}</div>
      <p className="text-[10px] text-[#C9A84C] italic leading-tight mb-2 font-medium">"{nudge}"</p>
      <textarea 
        placeholder="Enter your notes..."
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onBlur(localValue)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-sm min-h-[70px] focus:outline-none focus:border-[#C9A84C] transition-colors shadow-inner"
      />
    </div>
  );
}
