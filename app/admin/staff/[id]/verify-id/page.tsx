'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  checkSession, 
  getStaffForVerification, 
  updateIdCard 
} from '@/lib/supabase/queries';
import { validateThaiIdCard } from '@/lib/utils/validateThaiId';
import { 
  ArrowLeft, Shield, CheckCircle, AlertCircle, 
  User, RefreshCw, Lock, Clock 
} from 'lucide-react';

export default function VerifyIdCardPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [staffData, setStaffData] = useState<any>(null);
  const [newIdCard, setNewIdCard] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; message: string }>({ valid: false, message: '' });
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = checkSession();
    if (!session) { router.push('/admin/login'); return; }
    if (session.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }
    setUser(session);
    loadStaffData();
  }, [router, userId]);

  const loadStaffData = async () => {
    try {
      const data = await getStaffForVerification(userId);
      if (!data.is_temporary_id) {
        setError('บัญชีนี้ยืนยันเลขบัตรจริงเรียบร้อยแล้ว');
      }
      setStaffData(data);
    } catch (err: any) {
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
  };

  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 13);
    setNewIdCard(val);
    if (val.length === 13) {
      setValidation(validateThaiIdCard(val));
    } else {
      setValidation({ valid: false, message: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid) return;
    setLoading(true);
    setError('');

    try {
      await updateIdCard(userId, newIdCard, user.id);
      setShowSuccess(true);
    } catch (err: any) {
      setError(err.message || 'อัปเดตเลขบัตรไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const formatTempId = (id: string) => `${id.slice(0, 2)} XXXXX XXX XX-X`;

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-100 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">ยืนยันเลขบัตรจริงสำเร็จ!</h2>
          <p className="text-gray-600 mb-6">ระบบได้ปลดล็อกบัญชีชั่วคราวและอัปเดตสถานะเรียบร้อยแล้ว</p>
          
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 justify-center text-green-800 font-mono text-xl font-bold">
              <Shield className="w-5 h-5" />
              {staffData?.id_card}
            </div>
          </div>

          <button
            onClick={() => router.push('/admin/staff')}
            className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-all"
          >
            กลับไปจัดการเจ้าหน้าที่
          </button>
        </div>
      </div>
    );
  }

  if (error && !staffData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => router.push('/admin/staff')} className="text-blue-600 hover:underline">กลับหน้าจัดการ</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าจัดการ
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <User className="w-6 h-6" />
              <h1 className="text-2xl font-bold">ยืนยันเลขบัตรประชาชนจริง</h1>
            </div>
            <p className="text-blue-100 text-sm">เปลี่ยนสถานะบัญชีชั่วคราว → ยืนยันตัวตนจริง</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Staff Info */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-700 mb-3">ข้อมูลปัจจุบัน</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">ชื่อ-นามสกุล</span>
                  <span className="font-medium text-gray-800">{staffData?.doctors?.full_name_th || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">บทบาท</span>
                  <span className="font-medium capitalize text-gray-800">
                    {staffData?.role === 'osm' ? '🏘️ อสม.' : staffData?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍⚕️ เจ้าหน้าที่'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">เลขบัตรชั่วคราว</span>
                  <span className="font-mono font-bold text-amber-600">{formatTempId(staffData?.id_card)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">สถานะ</span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                    <Clock className="w-3 h-3" /> รอตรวจสอบ
                  </span>
                </div>
              </div>
            </div>

            {/* Update Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" /> กรอกเลขบัตรประชาชนจริง 13 หลัก *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newIdCard}
                  onChange={handleIdCardChange}
                  className={`w-full px-4 py-3 border rounded-xl text-lg font-mono tracking-wide focus:ring-2 transition-all ${
                    validation.valid ? 'border-green-400 bg-green-50 ring-green-200' :
                    validation.message ? 'border-red-400 bg-red-50 ring-red-200' :
                    'border-gray-300 focus:ring-blue-200'
                  }`}
                  placeholder="X-XXXX-XXXXX-XX-X"
                  required
                />
                {validation.message && (
                  <p className={`mt-1 text-sm flex items-center gap-1 ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                    {validation.valid ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {validation.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">💡 ระบบจะตรวจสอบ Checksum อัตโนมัติก่อนบันทึก</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !validation.valid}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                {loading ? 'กำลังอัปเดต...' : 'ยืนยันและเปลี่ยนเป็นเลขจริง'}
              </button>
            </form>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">หมายเหตุหลังอัปเดต:</p>
                <ul className="list-disc pl-4 space-y-1 text-blue-700">
                  <li>บัญชีจะถูกปลดล็อกสิทธิ์รายงาน/เบิกจ่ายทันที</li>
                  <li>บันทึก Audit: ใครเปลี่ยน, เมื่อไหร่, เลขเก่า → เลขใหม่</li>
                  <li>ไม่สามารถแก้ไขกลับเป็นชั่วคราวได้โดยไม่ผ่าน Admin สูงสุด</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}