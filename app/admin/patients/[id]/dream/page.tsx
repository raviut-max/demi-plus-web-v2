// app/admin/patients/[id]/dream/page.tsx
// ✅ แก้ไขล่าสุด: รองรับทั้ง "ดูประวัติ" และ "เลือกความฝันใหม่" อย่างสมบูรณ์
//    - ค่าเริ่มต้น: แสดงประวัติความฝัน
//    - หาก URL มี ?mode=new หรือกดปุ่ม "เลือกความฝันใหม่": จะแสดงฟอร์มสร้างความฝัน
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getUserHospitalInfo,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle, AlertCircle, 
  Plus, X, UserCheck, Hospital, Building2, LogOut
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ============================================================
// 🧩 Types & Constants
// ============================================================
interface DreamRecord {
  id: string;
  dream_key: string | null;
  dream_text: string;
  intention: string | null;
  reason: string | null;
  confidence: number | null;
  method: string;
  status: string;
  created_at: string;
}

const DREAM_CARDS = [
  { key: 'family', text: 'ได้อยู่กับคนที่รัก', emoji: '👨‍👩‍👧‍👦', color: 'from-pink-100 to-rose-100 border-pink-300' },
  { key: 'travel', text: 'ได้เที่ยวในที่ที่ชอบ', emoji: '🏝️', color: 'from-sky-100 to-cyan-100 border-sky-300' },
  { key: 'activity', text: 'แข็งแรง ทำกิจกรรมที่ชอบได้', emoji: '🚴', color: 'from-green-100 to-emerald-100 border-green-300' },
  { key: 'money', text: 'มีเงินใช้ ไม่เดือดร้อน', emoji: '💰', color: 'from-yellow-100 to-amber-100 border-yellow-300' },
  { key: 'noburden', text: 'ไม่เป็นภาระของลูกหลาน', emoji: '❤️', color: 'from-red-100 to-pink-100 border-red-300' },
  { key: 'cure', text: 'หายป่วย สุขภาพแข็งแรง', emoji: '🧘', color: 'from-violet-100 to-purple-100 border-violet-300' },
];

export default function DreamPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;

  // ✅ ตรวจสอบ mode จาก URL (ถ้ามากจากปุ่ม "เลือกความฝันใหม่" ใน Care Pathway)
  const urlMode = searchParams.get('mode');
  const [viewMode, setViewMode] = useState<'history' | 'create'>(urlMode === 'new' ? 'create' : 'history');

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [dreams, setDreams] = useState<DreamRecord[]>([]);

  // State สำหรับฟอร์มสร้างความฝัน
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [customDream, setCustomDream] = useState('');
  const [intention, setIntention] = useState('');
  const [reason, setReason] = useState('');
  const [confidence, setConfidence] = useState(5);
  const [method, setMethod] = useState<'online' | 'paper'>('online');
  const [saving, setSaving] = useState(false);

  // ============================================================
  // 🔐 Session & Data Loading
  // ============================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadData();
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const info = await getUserHospitalInfo(userId);
      setUserHospital(info);
    } catch (e) {
      console.error('❌ [loadUserHospital]', e);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      const { data: dreamsData, error } = await supabase
        .from('patient_dreams')
        .select('*')
        .eq('user_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDreams(dreamsData || []);
    } catch (error) {
      console.error('❌ [loadData] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ============================================================
  // 🎯 Dream Creation Logic
  // ============================================================
  const toggleCard = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSaveDream = async () => {
    const finalDreamText = [
      ...selectedKeys.map(key => DREAM_CARDS.find(c => c.key === key)?.text),
      customDream.trim()
    ].filter(Boolean).join(' + ');

    if (!finalDreamText) {
      alert('กรุณาเลือกการ์ดความฝันอย่างน้อย 1 ใบ หรือพิมพ์ความฝันของคุณ');
      return;
    }

    setSaving(true);
    try {
      // 1. Archive ความฝันเก่าที่เป็น active (ถ้าต้องการให้เหลือ active แค่ 1 อัน)
      await supabase
        .from('patient_dreams')
        .update({ status: 'history' })
        .eq('user_id', patientId)
        .eq('status', 'active');

      // 2. Insert ความฝันใหม่
      const { error } = await supabase.from('patient_dreams').insert({
        user_id: patientId,
        dream_key: selectedKeys[0] || null,
        dream_text: finalDreamText,
        intention: intention || null,
        reason: reason || null,
        confidence: confidence,
        method: method,
        status: 'active',
        created_by: user?.id,
      });

      if (error) throw error;

      alert('✅ บันทึกความฝันสำเร็จ!');
      
      // Reset form และกลับไปหน้าประวัติ
      setSelectedKeys([]);
      setCustomDream('');
      setIntention('');
      setReason('');
      setConfidence(5);
      setMethod('online');
      setViewMode('history');
      
      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('❌ [handleSaveDream] Error:', error);
      alert('เกิดข้อผิดพลาด: ' + (error.message || 'ไม่สามารถบันทึกได้'));
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // 🖥️ Render
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/care-pathway`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> กลับ Care Pathway
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-purple-600" />
                ความฝันของฉัน (Self-Discovery)
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number}
              </p>
            </div>

            {/* User Info Card */}
            <div className="flex items-center gap-3">
              {user && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>
                  {patient?.hospitals && (
                    <div className="border-t border-blue-200 pt-2 mt-2">
                      <div className="flex items-center gap-1">
                        <Hospital className="w-3 h-3 text-blue-600" />
                        <span className="text-xs text-gray-600 font-medium">{patient.hospitals.name}</span>
                        {patient.hospitals.type === 'main' ? (
                          <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">🏥 แม่ข่าย</span>
                        ) : (
                          <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">🏥 ลูกข่าย</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* ✅ Toggle View Mode (ถ้าต้องการสลับด้วยตัวเอง) */}
        <div className="flex justify-end mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-1 flex">
            <button
              onClick={() => setViewMode('history')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'history' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📋 ดูประวัติความฝัน
            </button>
            <button
              onClick={() => setViewMode('create')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'create' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              ➕ เลือกความฝันใหม่
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 📜 VIEW: ประวัติความฝัน */}
        {/* ============================================================ */}
        {viewMode === 'history' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">ประวัติความฝันที่บันทึกไว้</h2>
              <button
                onClick={() => setViewMode('create')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" /> เลือกความฝันใหม่
              </button>
            </div>
            
            <div className="p-6">
              {dreams.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 mb-4">ยังไม่มีบันทึกความฝัน</p>
                  <button
                    onClick={() => setViewMode('create')}
                    className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
                  >
                    เริ่มเลือกความฝันครั้งแรก
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {dreams.map((dream, index) => (
                    <div 
                      key={dream.id} 
                      className={`border rounded-lg p-5 transition-all ${
                        dream.status === 'active' 
                          ? 'bg-purple-50 border-purple-300 shadow-sm' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {DREAM_CARDS.find(c => c.key === dream.dream_key)?.emoji || '💭'}
                          </span>
                          <div>
                            <h3 className="font-bold text-gray-800 text-lg">{dream.dream_text}</h3>
                            <p className="text-xs text-gray-500">
                              บันทึกเมื่อ: {new Date(dream.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                              {dream.status === 'active' && (
                                <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full text-[10px] font-bold">ปัจจุบัน</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">ความมั่นใจ</p>
                          <p className="text-2xl font-bold text-purple-600">{dream.confidence ?? 0}<span className="text-sm text-gray-400">/10</span></p>
                        </div>
                      </div>
                      
                      {(dream.intention || dream.reason) && (
                        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {dream.intention && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1">🎯 ความตั้งใจ</p>
                              <p className="text-sm text-gray-800">{dream.intention}</p>
                            </div>
                          )}
                          {dream.reason && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1">💬 เหตุผลที่สำคัญ</p>
                              <p className="text-sm text-gray-800">{dream.reason}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ✨ VIEW: เลือกความฝันใหม่ (Form) */}
        {/* ============================================================ */}
        {viewMode === 'create' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">เลือกความฝันใหม่</h2>
              <button
                onClick={() => setViewMode('history')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
              >
                <X className="w-4 h-4" /> ยกเลิก / ดูประวัติ
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* 1. เลือกการ์ด */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">1. เลือกการ์ดความฝัน (เลือกได้หลายใบ)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {DREAM_CARDS.map((card) => (
                    <button
                      key={card.key}
                      onClick={() => toggleCard(card.key)}
                      className={`rounded-xl border-2 p-4 text-center transition-all bg-gradient-to-br ${card.color} ${
                        selectedKeys.includes(card.key) ? 'ring-4 ring-purple-400 scale-[1.02]' : 'opacity-90 hover:opacity-100'
                      }`}
                    >
                      <div className="text-4xl mb-2">{card.emoji}</div>
                      <p className="text-sm font-semibold text-gray-800">{card.text}</p>
                      {selectedKeys.includes(card.key) && (
                        <p className="text-xs text-purple-700 mt-1 font-bold flex items-center justify-center gap-1">
                          <CheckCircle className="w-3 h-3" /> เลือกแล้ว
                        </p>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">หรือพิมพ์ความฝันของคุณเอง (ถ้ามี)</label>
                  <input
                    type="text"
                    value={customDream}
                    onChange={(e) => setCustomDream(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="เช่น อยากเดินเล่นกับหลานทุกวัน..."
                  />
                </div>
              </div>

              {/* 2. ความตั้งใจและเหตุผล */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">2. ความตั้งใจ 1 ข้อสั้นๆ</label>
                  <input
                    type="text"
                    value={intention}
                    onChange={(e) => setIntention(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="เช่น จะเดินหลังอาหารเย็นวันละ 15 นาที"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">3. เหตุผลที่เรื่องนี้สำคัญกับฉัน</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="เช่น อยากแข็งแรงไปรับหลานที่โรงเรียน..."
                  />
                </div>
              </div>

              {/* 3. ความมั่นใจ */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">4. ระดับความมั่นใจว่าจะทำได้ (0-10)</label>
                <div className="flex justify-between gap-1 flex-wrap">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setConfidence(n)}
                      className={`w-10 h-10 rounded-full text-sm font-bold transition-all ${
                        confidence === n
                          ? 'bg-purple-500 text-white scale-125 shadow-lg'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-purple-700 font-bold mt-3">
                  ความมั่นใจปัจจุบัน: {confidence} / 10
                </p>
              </div>

              {/* 4. วิธีการ */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">5. วิธีการบันทึก</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setMethod('online')}
                    className={`flex-1 p-4 rounded-xl border-2 text-center transition-all ${
                      method === 'online'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-bold">🅰️ ออนไลน์</p>
                    <p className="text-xs text-gray-500 mt-1">เลือกการ์ดและบันทึกในระบบ</p>
                  </button>
                  <button
                    onClick={() => setMethod('paper')}
                    className={`flex-1 p-4 rounded-xl border-2 text-center transition-all ${
                      method === 'paper'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-bold">🅱️ กระดาษ</p>
                    <p className="text-xs text-gray-500 mt-1">ผู้ป่วยเขียนลงกระดาษ (เจ้าหน้าที่บันทึกสรุป)</p>
                  </button>
                </div>
              </div>

              {/* ปุ่มบันทึก */}
              <div className="pt-6 border-t border-gray-200">
                <button
                  onClick={handleSaveDream}
                  disabled={saving}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg shadow-lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" /> บันทึกความฝันนี้
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}