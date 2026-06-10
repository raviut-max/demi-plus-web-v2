'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  getTemporaryOSMCards,
  updateTemporaryOSMIdCard,
  getAccessibleHospitalIds,
  isSuperAdmin,
  updateStaff // ใช้สำหรับอัปเดตวันเกิด
} from '@/lib/supabase/queries';
import {
  ArrowLeft, Shield, UserCheck, Calendar, Key, Save, AlertCircle, CheckCircle, Search, RefreshCw
} from 'lucide-react';

// Helper สำหรับแปลงปี พ.ศ. เป็น ค.ศ. และกลับกัน
const toThaiYear = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${parseInt(y) + 543}`;
};

const toISODate = (day: string, month: string, year: string) => {
  const adYear = parseInt(year) - 543;
  return `${adYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export default function VerifyTemporaryStaffPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  
  // State สำหรับฟอร์มแก้ไข
  const [realIdCard, setRealIdCard] = useState('');
  const [birthDay, setBirthDay] = useState('01');
  const [birthMonth, setBirthMonth] = useState('01');
  const [birthYear, setBirthYear] = useState('2501');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }
    setUser(userData);
    loadTemporaryStaff();
  }, [router]);

  const loadTemporaryStaff = async () => {
    setLoading(true);
    try {
      const ids = await getAccessibleHospitalIds(user?.id);
      const data = await getTemporaryOSMCards(isSuperAdmin(user) ? [] : ids);
      setStaffList(data);
    } catch (error) {
      console.error('Error loading staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStaff = (staff: any) => {
    setSelectedStaff(staff);
    setRealIdCard('');
    setConfirmNotes('');
    
    // แยกวันเกิดเดิมเพื่อเตรียมใส่ในฟอร์ม
    if (staff.users?.birth_date) {
      const [y, m, d] = staff.users.birth_date.split('-');
      setBirthDay(d);
      setBirthMonth(m);
      setBirthYear((parseInt(y) + 543).toString());
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    if (!realIdCard || realIdCard.length !== 13) {
      alert('กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง');
      return;
    }

    setIsUpdating(true);
    try {
      // 1. อัปเดตเลขบัตรและสถานะเป็น "จริง"
      const updateResult = await updateTemporaryOSMIdCard(
        selectedStaff.id,
        realIdCard,
        user.id,
        confirmNotes || 'ยืนยันตัวตนด้วยบัตรประชาชนจริง'
      );

      if (!updateResult.success) {
        throw new Error(updateResult.error);
      }

      // 2. อัปเดตวันเกิดถ้ามีการเปลี่ยนแปลง (Optional ตามโจทย์)
      const newBirthDate = toISODate(birthDay, birthMonth, birthYear);
      if (newBirthDate !== selectedStaff.users?.birth_date) {
        await updateStaff(selectedStaff.id, { birth_date: newBirthDate });
      }

      alert('✅ อัปเดตข้อมูลสำเร็จ! บัญชีนี้现在是อสม.เต็มรูปแบบแล้ว');
      setSelectedStaff(null);
      loadTemporaryStaff(); // โหลดรายการใหม่
      
    } catch (error: any) {
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin/settings')} className="p-2 hover:bg-white rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Shield className="w-7 h-7 text-blue-600" />
              ยืนยันอสม./บุคลากรชั่วคราว
            </h1>
            <p className="text-gray-500">เลือกเจ้าหน้าที่จากรายการเพื่อแก้ไขเลขบัตรประชาชนให้เป็นของจริง</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: List of Temporary Staff */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Search className="w-4 h-4" /> รายการรอตรวจสอบ ({staffList.length})
              </h2>
              
              {loading ? (
                <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
              ) : staffList.length === 0 ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg">
                  ไม่พบเจ้าหน้าที่ชั่วคราว
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                  {staffList.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() => handleSelectStaff(staff)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedStaff?.id === staff.id 
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-semibold text-gray-800">{staff.doctors?.full_name_th}</div>
                      <div className="text-xs text-gray-500 mt-1 flex justify-between">
                        <span>{staff.hospitals?.name}</span>
                        <span className="font-mono text-blue-600">{staff.id_card}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Edit Form */}
          <div className="lg:col-span-2">
            {selectedStaff ? (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <UserCheck className="w-6 h-6" />
                        กำลังแก้ไข: {selectedStaff.doctors?.full_name_th}
                      </h2>
                      <p className="text-blue-100 text-sm mt-1">
                        บทบาท: {selectedStaff.role === 'osm' ? 'อาสาสมัครสาธารณสุข' : selectedStaff.role}
                      </p>
                    </div>
                    <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-mono backdrop-blur-sm">
                      ID: {selectedStaff.id.slice(0, 8)}...
                    </div>
                  </div>
                </div>

                <form onSubmit={handleUpdate} className="p-6 space-y-6">
                  {/* Current Info Display */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold">ข้อมูลปัจจุบัน (ชั่วคราว):</p>
                      <p>เลขบัตร: <span className="font-mono font-bold">{selectedStaff.id_card}</span></p>
                      <p>หมายเหตุ: {selectedStaff.temp_id_notes || '-'}</p>
                    </div>
                  </div>

                  {/* Real ID Card Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      เลขบัตรประชาชนจริง (13 หลัก) *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={13}
                        value={realIdCard}
                        onChange={(e) => setRealIdCard(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-lg tracking-wider"
                        placeholder="กรอกเลขบัตรประชาชนจริง"
                        required
                      />
                      <div className="absolute right-3 top-3.5 text-xs text-gray-400">
                        {realIdCard.length}/13
                      </div>
                    </div>
                  </div>

                  {/* Birth Date Update */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> วันเดือนปีเกิด (แก้ไขได้)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <select value={birthDay} onChange={(e) => setBirthDay(e.target.value)} className="px-3 py-2 border rounded-lg">
                        {Array.from({ length: 31 }, (_, i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{i+1}</option>)}
                      </select>
                      <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} className="px-3 py-2 border rounded-lg">
                        {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{i+1}</option>)}
                      </select>
                      <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="px-3 py-2 border rounded-lg">
                        {Array.from({ length: 80 }, (_, i) => <option key={2567-i} value={2567-i}>{2567-i}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">* ระบบจะอัปเดตรหัสผ่านอัตโนมัติหากมีการเปลี่ยนวันเกิด</p>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุการยืนยัน</label>
                    <textarea
                      value={confirmNotes}
                      onChange={(e) => setConfirmNotes(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="เช่น ตรวจสอบกับบัตรประชาชนเรียบร้อยแล้ว"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      บันทึกและยืนยันเป็นอสม.จริง
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStaff(null)}
                      className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium text-gray-700"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300 p-12">
                <UserCheck className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">เลือกเจ้าหน้าที่จากรายการด้านซ้ายเพื่อเริ่มแก้ไข</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}