// app/admin/patients/[id]/dream/page.tsx
// ✅ v2: ความฝันของฉัน (Self-Discovery) — ฝั่ง Admin เท่านั้น
//    - การ์ด 6 ใบ (แบบ A ออนไลน์)
//    - อัปโหลดรูปใบกระดาษ หลายรูป + compress อัตโนมัติ (แบบ B)
//    - ดูความฝันปัจจุบัน + ประวัติ / เลือกใหม่ได้ (เก่าเป็น history)
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertCircle, Camera,
  PenLine, RefreshCw, Eye, ChevronRight, X, Image as ImageIcon, Trash2
} from 'lucide-react';

// ---------- Helpers ----------
const formatThaiDate = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear() + 543}`;
};

// ✅ compress รูปก่อนอัปโหลด (รูปกล้องมือถือ 5-8MB → ~300KB)
const compressImage = (file: File, maxDim = 1400, quality = 0.75): Promise<File> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        else resolve(file); // ล้มเหลว → ใช้ไฟล์เดิม
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

// ---------- การ์ดความฝัน 6 ใบ (ตามภาพ) ----------
const DREAM_CARDS = [
  { key: 'family',   text: 'ได้อยู่กับคนที่รัก',           emoji: '👨‍👩‍👧‍👦', color: 'from-pink-100 to-rose-100 border-pink-300' },
  { key: 'travel',   text: 'ได้เที่ยวในที่ที่ชอบ',         emoji: '🏝️', color: 'from-sky-100 to-cyan-100 border-sky-300' },
  { key: 'activity', text: 'แข็งแรง ทำกิจกรรมที่ชอบได้',   emoji: '🚴', color: 'from-green-100 to-emerald-100 border-green-300' },
  { key: 'money',    text: 'มีเงินใช้ ไม่เดือนร้อน',        emoji: '💰', color: 'from-yellow-100 to-amber-100 border-yellow-300' },
  { key: 'noburden', text: 'ไม่เป็นภาระของลูกหลาน',         emoji: '❤️', color: 'from-red-100 to-pink-100 border-red-300' },
  { key: 'cure',     text: 'หายป่วย สุขภาพแข็งแรง',         emoji: '🧘', color: 'from-violet-100 to-purple-100 border-violet-300' },
];

interface Dream {
  id: string; dream_key: string | null; dream_text: string;
  intention: string | null; reason: string | null; confidence: number | null;
  method: string; image_urls: string[]; status: string;
  selected_date: string; created_at: string;
}

export default function DreamPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<'none' | 'notfound' | 'denied'>('none');
  const [errorDetail, setErrorDetail] = useState('');

  // wizard
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [method, setMethod] = useState<'online' | 'paper'>('online');
  const [selected, setSelected] = useState<string[]>([]);
  const [customDream, setCustomDream] = useState('');
  const [intention, setIntention] = useState('');
  const [reason, setReason] = useState('');
  const [confidence, setConfidence] = useState(5);

  // ✅ รูป (หลายใบ) — file pending + preview url
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // history
  const [activeDream, setActiveDream] = useState<Dream | null>(null);
  const [historyDreams, setHistoryDreams] = useState<Dream[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
  }, [router]);

  const load = useCallback(async () => {
    if (!user || !patientId) return;
    setLoading(true);
    try {
      const { data: prof, error: e1 } = await supabase.from('profiles').select('*').eq('id', patientId).maybeSingle();
      if (e1) throw new Error('profiles: ' + e1.message);
      if (!prof) { setErrorDetail(`ไม่พบผู้ป่วย id: ${patientId}`); setErrorState('notfound'); return; }

      if (!isSuperAdmin(user)) {
        const ids = await getAccessibleHospitalIds(user.id);
        if (prof.hospital_id && !ids.includes(prof.hospital_id)) { setErrorState('denied'); return; }
      }

      const { data: dreams, error: e2 } = await supabase
        .from('patient_dreams').select('*').eq('user_id', patientId)
        .order('created_at', { ascending: false });
      if (e2) console.warn('[Dream] patient_dreams:', e2.message);

      const list: Dream[] = (dreams || []).map(d => ({ ...d, image_urls: d.image_urls || [] }));
      setActiveDream(list.find(d => d.status === 'active') || null);
      setHistoryDreams(list.filter(d => d.status === 'history'));
      setPatient(prof);
      setErrorState('none'); setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [Dream]', e);
      setErrorDetail(e?.message || String(e)); setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { load(); }, [load]);

  // ---------- จัดการรูป ----------
  const addImages = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (valid.length + pendingFiles.length > 6) { alert('แนบรูปได้สูงสุด 6 ใบ'); return; }
    setPendingFiles(prev => [
      ...prev,
      ...valid.map(f => ({ file: f, preview: URL.createObjectURL(f) })),
    ]);
  };

  const removeImage = (idx: number) => {
    setPendingFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // อัปโหลดทุกไฟล์ (compress ก่อน) → คืน array ของ publicUrl
  const uploadAllImages = async (): Promise<string[]> => {
    if (pendingFiles.length === 0) return [];
    setUploading(true);
    const urls: string[] = [];
    try {
      for (const { file } of pendingFiles) {
        const compressed = await compressImage(file);
        const ext = 'jpg';
        const path = `${patientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('dream-images').upload(path, compressed, {
          contentType: 'image/jpeg',
        });
        if (error) throw error;
        const { data } = supabase.storage.from('dream-images').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
      return urls;
    } finally {
      setUploading(false);
    }
  };

  // ---------- การ์ด ----------
  const toggleCard = (key: string) =>
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const selectedTexts = () => {
    const fromCards = DREAM_CARDS.filter(c => selected.includes(c.key)).map(c => c.text);
    if (customDream.trim()) fromCards.push(customDream.trim());
    return fromCards;
  };

  const canProceedStep1 = () => {
    if (method === 'online') return selectedTexts().length > 0;
    return pendingFiles.length > 0 || selectedTexts().length > 0; // แบบ B ต้องมีรูป หรือข้อความ
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) compress + upload รูปก่อน
      let uploadedUrls: string[] = [];
      try {
        uploadedUrls = await uploadAllImages();
      } catch (e: any) {
        console.error('[Dream] upload fail:', e);
        const go = confirm(
          `⚠️ อัปโหลดรูปไม่สำเร็จ: ${e?.message || 'ตรวจสอบ Storage bucket/policy'}\n\n` +
          `ต้องการบันทึกความฝันแบบ "ไม่มีรูป" ต่อหรือไม่?`
        );
        if (!go) return;
      }

      // 2) mark ความฝันเก่าเป็น history
      if (activeDream) {
        await supabase.from('patient_dreams')
          .update({ status: 'history', updated_at: new Date().toISOString() })
          .eq('id', activeDream.id);
      }

      // 3) insert ความฝันใหม่
      const texts = selectedTexts();
      const firstKey = DREAM_CARDS.find(c => selected.includes(c.key))?.key || null;
      const { error } = await supabase.from('patient_dreams').insert({
        user_id: patientId,
        dream_key: firstKey,
        dream_text: texts.join(' + ') || '(จากใบกระดาษ)',
        intention: intention || null,
        reason: reason || null,
        confidence,
        method,
        image_urls: uploadedUrls,
        status: 'active',
        selected_date: new Date().toISOString().slice(0, 10),
        created_by: user?.id,
      });
      if (error) throw error;

      // cleanup previews
      pendingFiles.forEach(p => URL.revokeObjectURL(p.preview));
      setPendingFiles([]);
      setStep(4);
      await load();
    } catch (e: any) {
      alert('❌ บันทึกไม่สำเร็จ: ' + (e?.message || '') + '\n💡 รัน SQL (ตาราง + bucket + policy) ครบแล้วหรือยัง?');
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setStep(1); setSelected([]); setCustomDream(''); setIntention('');
    setReason(''); setConfidence(5); setMethod('online');
    pendingFiles.forEach(p => URL.revokeObjectURL(p.preview));
    setPendingFiles([]);
  };

  // ---------- Loading / Error ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }
  if (errorState !== 'none' || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-300" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {errorState === 'denied' ? 'ไม่มีสิทธิ์เข้าถึงผู้ป่วยนี้' : 'ไม่พบข้อมูลผู้ป่วย'}
          </h2>
          {errorDetail && <p className="text-xs text-red-600 font-mono mb-4 break-all">{errorDetail}</p>}
          <button onClick={() => router.push('/admin/patients')} className="px-6 py-2 bg-blue-500 text-white rounded-lg">กลับหน้าผู้ป่วย</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-purple-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button onClick={() => router.push(`/admin/patients/${patientId}/care-pathway`)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> กลับ Care Pathway
          </button>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center"><Sparkles className="w-5 h-5 text-purple-600" /></div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">✨ ความฝันของฉัน (Self-Discovery)</h1>
                <p className="text-xs text-gray-500">{patient.first_name} {patient.last_name} | HN: {patient.hospital_number || '-'} | 🖥️ ฝั่งเจ้าหน้าที่</p>
              </div>
            </div>
            {activeDream && step !== 4 && (
              <button onClick={resetWizard} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-xs hover:bg-purple-50">
                <RefreshCw className="w-3 h-3" /> เลือกความฝันใหม่
              </button>
            )}
          </div>
          {step !== 4 && (
            <div className="flex gap-1 mt-3">
              {[0,1,2,3,4].map(p => <div key={p} className={`h-1.5 flex-1 rounded-full ${p <= step ? 'bg-purple-500' : 'bg-gray-200'}`} />)}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ===== จอ 0: แนะนำ ===== */}
        {step === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center border">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center text-5xl">🌈</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">คุณอยากสุขภาพดีไปเพื่ออะไร?</h2>
            <p className="text-gray-600 mb-6">ให้ผู้ป่วยเลือก "การ์ดความฝัน" ที่ตรงใจที่สุด<br />เพื่อสร้างแรงจูงใจในการดูแลสุขภาพอย่างยั่งยืน</p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6 text-sm text-gray-700">
              <p className="font-semibold mb-1">เลือกได้ 2 วิธี (เจ้าหน้าที่ทำให้ในหน้านี้):</p>
              <p>🅰️ ทำแบบออนไลน์ — เลือกการ์ดความฝันในหน้าจอ</p>
              <p>🅱️ ทำแบบกระดาษ — ผู้ป่วยเขียน แล้ว <b>ถ่ายรูป/แนบไฟล์</b> เข้าระบบ</p>
            </div>
            <button onClick={() => setStep(1)} className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-indigo-600 flex items-center justify-center gap-2">
              เริ่มต้นทำกิจกรรม <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ===== จอ 1: เลือกการ์ด + แนบรูป ===== */}
        {step === 1 && (
          <>
            <div className="bg-white rounded-2xl shadow-lg p-6 border">
              <h2 className="text-lg font-bold text-gray-800 mb-3">วิธีบันทึก</h2>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMethod('online')} className={`p-4 rounded-xl border-2 text-center ${method === 'online' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
                  <PenLine className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                  <p className="text-sm font-semibold">🅰️ ออนไลน์</p>
                  <p className="text-xs text-gray-500">เลือกการ์ดในจอ</p>
                </button>
                <button onClick={() => setMethod('paper')} className={`p-4 rounded-xl border-2 text-center ${method === 'paper' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <Camera className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                  <p className="text-sm font-semibold">🅱️ ถ่ายรูปใบกระดาษ</p>
                  <p className="text-xs text-gray-500">ผู้ป่วยเขียน → เจ้าหน้าที่ถ่ายรูป</p>
                </button>
              </div>
            </div>

            {/* การ์ด 6 ใบ */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border">
              <h2 className="text-lg font-bold text-gray-800 mb-1">เลือกการ์ดความฝัน</h2>
              <p className="text-sm text-gray-500 mb-4">แตะเลือกการ์ดที่ตรงกับใจ (เลือกได้หลายใบ)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {DREAM_CARDS.map(c => (
                  <button key={c.key} onClick={() => toggleCard(c.key)}
                    className={`rounded-xl border-2 p-4 text-center transition-all bg-gradient-to-br ${c.color} ${
                      selected.includes(c.key) ? 'ring-4 ring-purple-400 scale-[1.02]' : 'opacity-90 hover:opacity-100'
                    }`}>
                    <div className="text-4xl mb-2">{c.emoji}</div>
                    <p className="text-sm font-semibold text-gray-800">{c.text}</p>
                    {selected.includes(c.key) && <p className="text-xs text-purple-700 mt-1 font-bold">✓ เลือกแล้ว</p>}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">หรือพิมพ์ความฝันของคุณเอง</label>
                <input type="text" value={customDream} onChange={e => setCustomDream(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="เช่น อยากเดินเล่นกับหลานทุกวัน..." />
              </div>
            </div>

            {/* ✅ อัปโหลดรูป (หลายใบ) */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                {method === 'paper' ? 'แนบรูปถ่ายใบความฝัน *' : 'แนบรูปถ่าย (ถ้ามี — ไม่บังคับ)'}
              </h2>
              <p className="text-sm text-gray-500 mb-4">รองรับหลายใบ (สูงสุด 6) · ระบบย่อขนาดรูปอัตโนมัติก่อนอัปโหลด</p>

              <label className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                method === 'paper' && pendingFiles.length === 0 ? 'border-blue-300 bg-blue-50/50' : 'border-gray-300 hover:bg-gray-50'
              }`}>
                <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">แตะเพื่อเลือกไฟล์รูป หรือถ่ายรูปจากกล้อง</p>
                <input type="file" accept="image/*" multiple capture="environment"
                  onChange={e => { addImages(e.target.files); e.target.value = ''; }}
                  className="hidden" />
              </label>

              {/* preview grid */}
              {pendingFiles.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                  {pendingFiles.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.preview} alt={`รูป ${i + 1}`} className="w-full h-24 object-cover rounded-lg border" />
                      <button onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <p className="text-[10px] text-gray-400 text-center mt-1">{(p.file.size / 1024 / 1024).toFixed(1)}MB</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setStep(2)} disabled={!canProceedStep1()}
              className="w-full py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 disabled:opacity-40 flex items-center justify-center gap-2">
              ถัดไป <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* ===== จอ 2: สรุป ===== */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border">
            <h2 className="text-lg font-bold text-gray-800 mb-1">การ์ดความฝันที่เลือก</h2>
            <p className="text-sm text-gray-500 mb-4">คุณตั้งใจที่จะรักษา/ปรับปรุงเรื่อง...</p>
            <div className="space-y-2 mb-4">
              {selectedTexts().map((t, i) => (
                <div key={i} className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
                  <p className="text-sm font-medium text-gray-800">{t}</p>
                </div>
              ))}
              {selectedTexts().length === 0 && <p className="text-sm text-gray-400 italic">(ไม่มีการ์ด — บันทึกจากใบกระดาษ)</p>}
            </div>
            {/* thumbnail รูปที่จะอัปโหลด */}
            {pendingFiles.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">รูป {pendingFiles.length} ใบที่จะแนบ:</p>
                <div className="grid grid-cols-4 gap-2">
                  {pendingFiles.map((p, i) => <img key={i} src={p.preview} alt="" className="h-16 w-full object-cover rounded border" />)}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(1)} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">← แก้ไข</button>
              <button onClick={() => setStep(3)} className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600">ถัดไป →</button>
            </div>
          </div>
        )}

        {/* ===== จอ 3: ยืนยัน ===== */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">ความตั้งใจ 1 ข้อสั้นๆ</label>
              <input type="text" value={intention} onChange={e => setIntention(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="เช่น จะเดินหลังอาหารเย็นวันละ 15 นาที" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">เหตุผลที่เรื่องนี้สำคัญกับฉัน</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="เช่น อยากแข็งแรงไปรับหลานที่โรงเรียน..." />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">ระดับความมั่นใจว่าจะทำได้ (0-10)</label>
              <div className="flex justify-between gap-1 flex-wrap">
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => setConfidence(n)}
                    className={`w-8 h-8 rounded-full text-xs font-bold ${confidence === n ? 'bg-purple-500 text-white scale-125' : 'bg-white border border-gray-300 text-gray-600'}`}>{n}</button>
                ))}
              </div>
              <p className="text-center text-sm text-purple-700 font-bold mt-2">ความมั่นใจ: {confidence}/10</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(2)} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">← แก้ไข</button>
              <button onClick={handleSave} disabled={saving || uploading}
                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50">
                {uploading ? '📤 กำลังอัปโหลดรูป...' : saving ? '⏳ กำลังบันทึก...' : '✓ บันทึกความฝัน'}
              </button>
            </div>
          </div>
        )}

        {/* ===== จอ 4: สำเร็จ ===== */}
        {step === 4 && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center border">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-green-600" /></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">บันทึกความฝันสำเร็จ! 🎉</h2>
            <p className="text-gray-600 mb-6">ความฝันของ {patient.first_name} ถูกเก็บไว้ในเส้นทางสุขภาพแล้ว</p>
            <div className="flex gap-3">
              <button onClick={() => router.push(`/admin/patients/${patientId}/care-pathway`)} className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600">กลับ Care Pathway</button>
              <button onClick={resetWizard} className="px-6 py-3 bg-white border border-purple-300 text-purple-700 rounded-xl hover:bg-purple-50">เลือกใหม่</button>
            </div>
          </div>
        )}

        {/* ===== ความฝันของฉัน (ดูได้ตลอด) ===== */}
        {step !== 4 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border">
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><Eye className="w-5 h-5 text-purple-600" /> ความฝันของฉัน</h2>
            <p className="text-sm text-gray-500 mb-4">ความฝันปัจจุบัน + ประวัติ (เลือกใหม่ได้เสมอ)</p>

            {activeDream ? (
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-bold">ปัจจุบัน</span>
                  <span className="text-xs text-gray-500">{formatThaiDate(activeDream.selected_date)}</span>
                </div>
                <p className="text-lg font-bold text-gray-800 mb-2">“{activeDream.dream_text}”</p>
                {activeDream.intention && <p className="text-sm text-gray-700">🎯 {activeDream.intention}</p>}
                {activeDream.reason && <p className="text-sm text-gray-600 mt-1">💬 {activeDream.reason}</p>}
                {activeDream.confidence != null && <p className="text-sm text-purple-700 mt-1">ความมั่นใจ {activeDream.confidence}/10 · {activeDream.method === 'paper' ? '📷 แบบกระดาษ' : '🅰️ ออนไลน์'}</p>}
                {/* ✅ รูปที่บันทึกไว้ */}
                {activeDream.image_urls?.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {activeDream.image_urls.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                        <img src={u} alt={`ใบความฝัน ${i + 1}`} className="w-full h-24 object-cover rounded-lg border hover:opacity-80" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed mb-4">
                <p className="text-gray-500 text-sm">ยังไม่มีความฝัน — กด "เริ่มต้นทำกิจกรรม" ด้านบน</p>
              </div>
            )}

            {historyDreams.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">ประวัติความฝัน ({historyDreams.length})</p>
                <div className="space-y-2">
                  {historyDreams.map(d => (
                    <div key={d.id} className="bg-gray-50 border rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-[10px] font-bold shrink-0 mt-0.5">เดิม</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700">“{d.dream_text}”</p>
                          <p className="text-xs text-gray-400">{formatThaiDate(d.selected_date)} · {d.method === 'paper' ? '📷' : '🅰️'}{d.image_urls?.length ? ` · ${d.image_urls.length} รูป` : ''}</p>
                        </div>
                        {d.image_urls?.[0] && <img src={d.image_urls[0]} alt="" className="w-10 h-10 object-cover rounded border shrink-0" />}
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
  );
}