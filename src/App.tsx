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
  const [saving, setSaving] = useState(false);

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

  const currentSessions = ALL_SESSIONS.filter(s => s.day === currentDay);
  const currentSession = currentSessions[currentIdx];

  const updateSessionField = useCallback(async (sid: string, field: keyof UserSessionData, value: string | string[]) => {
    if (!user || user.uid === 'guest') {
      // Local only update for guest
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
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const copyAll = async () => {
    let out = 'QUEENS OF AI SUMMIT — SESSION GUIDE\nClarity. Foundation. Outcome.\nKaryn Buggs | AI Pro CFO | KB Training Group\n' + '='.repeat(60) + '\n\n';
    
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f3] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-[#e0e0e0] mb-6"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#0D1B3E] mb-2">Queens of AI Summit</h1>
            <p className="text-gray-600">A CFO's Framework for Better Business Decisions</p>
          </div>
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-[#0D1B3E] text-[#C9A84C] py-3 rounded-xl font-semibold hover:bg-[#162850] transition-colors mb-4"
          >
            Sign in to Save Your Notes
          </button>
          <p className="text-[10px] text-center text-gray-400">
            Sign in with Google to save your reflections and progress across devices.
          </p>
        </motion.div>
        
        <button 
          onClick={() => setUser({ uid: 'guest', email: 'guest@example.com' } as any)}
          className="text-sm text-[#0D1B3E] underline font-medium"
        >
          Continue as Guest (Notes saved only on this device)
        </button>
      </div>
    );
  }

  const s = currentSession;
  const d = userData[s.id] || { C: '', F: '', O: '', takeaways: Array(10).fill(''), reflect: '', action: '', area: '', deadline: '' };

  return (
    <div className="min-h-screen bg-[#f5f5f3] text-[#1a1a1a] p-4 font-sans">
      <div className="max-w-2xl mx-auto py-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-medium mb-1">Queens of AI Summit — Session Guide</h2>
            <p className="text-sm text-gray-500">May 1 and 2, 2026 • Clarity. Foundation. Outcome.</p>
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
              onClick={() => { setCurrentDay(day); setCurrentIdx(0); }}
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

        {/* Progress */}
        <div className="h-1 bg-gray-200 rounded-full mb-6 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${calculateProgress()}%` }}
            className="h-full bg-[#C9A84C]"
          />
        </div>

        {/* Session Nav */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {currentSessions.map((session, i) => (
            <button
              key={session.id}
              onClick={() => setCurrentIdx(i)}
              className={`text-[11px] px-2.5 py-1.5 border rounded-lg transition-colors flex items-center gap-1 ${
                currentIdx === i
                  ? 'bg-[#0D1B3E] text-[#E8C97A] border-[#0D1B3E]'
                  : isSessionDone(session.id)
                  ? 'bg-white border-[#C9A84C] text-[#C9A84C]'
                  : 'bg-white border-gray-300 text-gray-500'
              }`}
            >
              {i + 1}. {session.speaker.split(' ')[0]}
              {isSessionDone(session.id) && <CheckCircle2 className="w-3 h-3" />}
            </button>
          ))}
        </div>

        {/* Session Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-4"
          >
            <div className="bg-[#0D1B3E] rounded-2xl p-6 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#C9A84C]" />
              <button 
                onClick={() => copySection(s.id)}
                className="absolute right-4 top-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-[#C9A84C] flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm"
                title="Copy this section"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Copy Section</span>
              </button>
              <div className="text-[10px] text-[#E8C97A] uppercase tracking-widest mb-1 opacity-80">{s.cat} • Day {s.day}</div>
              <div className="text-xs text-[#E8C97A] italic mb-2">{s.speaker}</div>
              <div className="text-lg font-bold text-white leading-tight">{s.title}</div>
            </div>

            {/* CFO Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-widest mb-4">Before this session — run it through CFO</div>
              
              <CFOBlock 
                letter="C" title="Clarity" 
                question="What problem am I hoping this session helps me name or solve?"
                nudge="If you cannot name it yet, ask yourself: what is happening in my business right now that brought me to this session?"
                value={d.C}
                onBlur={(v) => updateSessionField(s.id, 'C', v)}
              />
              
              <div className="h-px bg-gray-100 my-5" />

              <CFOBlock 
                letter="F" title="Foundation" 
                question="Is my business ready to act on what I learn here?"
                nudge="If you are not sure, ask yourself: what do I need to have in place before this makes sense for me?"
                value={d.F}
                onBlur={(v) => updateSessionField(s.id, 'F', v)}
              />

              <div className="h-px bg-gray-100 my-5" />

              <CFOBlock 
                letter="O" title="Outcome" 
                question="What would success look like if I applied this to my business?"
                nudge="If you cannot answer it going in, let the session answer it for you — then write it here after."
                value={d.O}
                onBlur={(v) => updateSessionField(s.id, 'O', v)}
              />
            </div>

            {/* Takeaways Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-widest mb-4">
                My 10 takeaways <span className="text-[11px] text-gray-400 normal-case font-normal ml-1">(in your own words)</span>
              </div>
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[#C9A84C] min-w-[18px]">{i + 1}.</span>
                    <input 
                      type="text"
                      placeholder="Write your takeaway..."
                      value={d.takeaways?.[i] || ''}
                      onChange={(e) => {
                        const newT = [...(d.takeaways || Array(10).fill(''))];
                        newT[i] = e.target.value;
                        // Local update for responsiveness
                        setUserData(prev => ({
                          ...prev,
                          [s.id]: { ...(prev[s.id] || d), takeaways: newT }
                        }));
                      }}
                      onBlur={(e) => updateTakeaway(s.id, i, e.target.value)}
                      className="flex-1 bg-transparent border-b border-gray-200 py-1 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Action/Reflection Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              {/* Reflection */}
              <div className="border-l-4 border-[#C9A84C] bg-[#faf7ee] p-4 rounded-r-xl mb-4">
                <div className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-wider mb-2">Reflect</div>
                <p className="text-xs text-gray-600 italic mb-3">{s.reflect}</p>
                <textarea 
                  placeholder="Your reflection..."
                  value={d.reflect}
                  onChange={(e) => setUserData(prev => ({ ...prev, [s.id]: { ...(prev[s.id] || d), reflect: e.target.value } }))}
                  onBlur={(e) => updateSessionField(s.id, 'reflect', e.target.value)}
                  className="w-full bg-[#f9f9f7] border border-gray-200 rounded-lg p-3 text-sm min-h-[80px] focus:outline-none focus:border-[#C9A84C]"
                />
              </div>

              {/* Strategy Insight */}
              <div className="bg-[#162850] border-t-4 border-[#C9A84C] rounded-xl p-4 mb-6">
                <div className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-widest mb-1.5">CFO-level strategy</div>
                <p className="text-xs text-gray-200 leading-relaxed">{s.cfo}</p>
              </div>

              {/* Your Move */}
              <div className="border-l-4 border-[#1A3A4A] bg-[#f0f4f8] p-4 rounded-r-xl">
                <div className="text-[10px] font-semibold text-[#1A3A4A] uppercase tracking-widest mb-4">Your move</div>
                
                <div className="mb-4">
                  <label className="text-[11px] text-gray-500 block mb-1">The one thing I will do differently in my business because of this session</label>
                  <input 
                    type="text"
                    placeholder="Be specific..."
                    value={d.action}
                    onChange={(e) => setUserData(prev => ({ ...prev, [s.id]: { ...(prev[s.id] || d), action: e.target.value } }))}
                    onBlur={(e) => updateSessionField(s.id, 'action', e.target.value)}
                    className="w-full bg-[#f9f9f7] border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#C9A84C]"
                  />
                </div>

                <div className="mb-4">
                  <label className="text-[11px] text-gray-500 block mb-1.5">Which part of my business does this apply to?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {AREAS.map(area => (
                      <button
                        key={area.id}
                        onClick={() => updateSessionField(s.id, 'area', d.area === area.id ? '' : area.id)}
                        className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                          d.area === area.id
                            ? 'bg-[rgba(26,58,74,0.1)] border-[#1A3A4A] text-[#1A3A4A] font-medium'
                            : 'bg-white border-gray-300 text-gray-500'
                        }`}
                      >
                        {area.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">I will do it by</label>
                  <input 
                    type="date"
                    value={d.deadline}
                    onChange={(e) => setUserData(prev => ({ ...prev, [s.id]: { ...(prev[s.id] || d), deadline: e.target.value } }))}
                    onBlur={(e) => updateSessionField(s.id, 'deadline', e.target.value)}
                    className="bg-[#f9f9f7] border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#C9A84C]"
                  />
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex gap-2">
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(prev => prev - 1)}
                className="flex-1 py-3 px-4 bg-white border border-gray-300 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              
              {currentIdx < currentSessions.length - 1 ? (
                <button
                  onClick={() => setCurrentIdx(prev => prev + 1)}
                  className="flex-1 py-3 px-4 bg-[#0D1B3E] text-[#C9A84C] rounded-xl flex items-center justify-center gap-2 text-sm font-medium"
                >
                  Next session <ChevronRight className="w-4 h-4" />
                </button>
              ) : currentDay === 1 ? (
                <button
                  onClick={() => { setCurrentDay(2); setCurrentIdx(0); }}
                  className="flex-1 py-3 px-4 bg-[#0D1B3E] text-[#C9A84C] rounded-xl flex items-center justify-center text-sm font-medium"
                >
                  Go to Day 2
                </button>
              ) : (
                <button
                  onClick={copyAll}
                  className="flex-1 py-3 px-4 bg-[#0D1B3E] text-[#C9A84C] rounded-xl flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Clipboard className="w-4 h-4" /> Copy Guide
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Global Action */}
        <button 
          onClick={copyAll}
          className="w-full mt-8 py-4 bg-[#0D1B3E] text-[#C9A84C] rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
        >
          Copy completed guide
        </button>

        {/* Toast */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <AnimatePresence>
            {showToast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-[#0D1B3E] text-[#C9A84C] px-6 py-3 rounded-xl text-sm shadow-2xl flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5" /> Copied to clipboard
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Saving Indicator */}
        <div className="fixed top-4 right-4 z-50">
           {saving && (
             <div className="bg-white/80 backdrop-blur p-2 rounded-full shadow-sm flex items-center gap-2 text-[10px] text-gray-400">
               <Loader2 className="w-3 h-3 animate-spin" /> Saving...
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
      <div className="flex items-center gap-3 mb-1">
        <span className="w-8 h-8 rounded-lg bg-[#0D1B3E] text-[#C9A84C] flex items-center justify-center font-bold">{letter}</span>
        <span className="font-bold text-sm">{title}</span>
      </div>
      <div className="text-xs text-gray-700 font-medium">{question}</div>
      <p className="text-[11px] text-[#C9A84C] italic leading-tight">{nudge}</p>
      <textarea 
        placeholder="Name the problem..."
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onBlur(localValue)}
        className="w-full bg-[#f9f9f7] border border-gray-200 rounded-lg p-3 text-sm min-h-[64px] focus:outline-none focus:border-[#C9A84C] transition-colors"
      />
    </div>
  );
}
