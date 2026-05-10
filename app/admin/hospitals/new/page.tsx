// app/admin/hospitals/new/page.tsx
// ✅ แก้ไขล่าสุด: 10 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แยกฟอร์มเพิ่มแม่ข่าย/ลูกข่าย ชัดเจนตามพารามิเตอร์ URL (?type=main|sub&parent=xxx)
//    2. ✅ ถ้าเข้ามาแบบเพิ่มลูกข่าย → แสดงแม่ข่ายที่เลือกให้อัตโนมัติ ไม่ต้องเลือกใหม่
//    3. ✅ ถ้าเข้ามาแบบเพิ่มแม่ข่าย → แสดงฟอร์มเพิ่มแม่ข่ายโดยตรง
//    4. ✅ แสดงข้อมูลแม่ข่ายแบบอ่านอย่างเดียวเมื่อเพิ่มลูกข่าย

'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import { ArrowLeft, Building2, Hospital, UserCheck, LogOut, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

export default function NewHospitalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [mainHospitals, setMainHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [parentHospital, setParentHospital] = useState<Hospital | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // ✅ โหมดการเพิ่ม: 'main' หรือ 'sub'
  const [formMode, setFormMode] = useState<'main' | 'sub'>('main');
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin'].includes(userData.role)) {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างโรงพยาบาลได้');
      router.push('/admin/hospitals');
      return;
    }

    console.log('👤 [NewHospital] User:', userData);
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    
    // ✅ อ่านพารามิเตอร์จาก URL เพื่อตั้งค่าโหมดฟอร์ม
    const type = searchParams?.get('type');
    const parentId = searchParams?.get('parent');
    
    if (type === 'sub' && parentId) {
      setFormMode('sub');
      setFormData(prev => ({ ...prev, type: 'sub', parent_id: parentId }));
      loadParentHospital(parentId);
    } else if (type === 'main') {
      setFormMode('main');
      setFormData(prev => ({ ...prev, type: 'main' }));
    }
  }, [router, searchParams]);

  // ✅ โหลดข้อมูลแม่ข่ายเมื่อเพิ่มลูกข่าย
  const loadParentHospital = async (parentId: string) => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('id', parentId)
        .single();
      
      if (error) throw error;
      setParentHospital(data);
      console.log('✅ [loadParentHospital] Parent hospital:', data);
    } catch (error) {
      console.error('❌ [loadParentHospital] Error:', error);
      setError('ไม่สามารถโหลดข้อมูลโรงพยาบาลแม่ข่ายได้');
    }
  };

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      console.log('🏥 [loadUserHospital] Loading for user:', userId);
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ [loadUserHospital] User hospital:', hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🔍 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      
      // ✅ โหลดเฉพาะแม่ข่าย (สำหรับกรณีเพิ่มลูกข่ายแบบเลือกเอง)
      let query = supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .order('name');

      if (ids.length > 0 && !isSuperAdmin(user)) {
        query = query.in('id', ids);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setMainHospitals(data || []);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // ✅ Validation
    if (!formData.name.trim()) {
      setError('กรุณากรอกชื่อโรงพยาบาล');
      setLoading(false);
      return;
    }

    if (!formData.code.trim()) {
      setError('กรุณากรอกรหัสโรงพยาบาล');
      setLoading(false);
      return;
    }

    if (formData.type === 'sub' && !formData.parent_id) {
      setError('กรุณาเลือกโรงพยาบาลแม่ข่าย');
      setLoading(false);
      return;
    }

    // ✅ ตรวจสอบสิทธิ์
    if (formData.type === 'sub' && !isSuperAdmin(user)) {
      if (!accessibleHospitalIds.includes(formData.parent_id)) {
        setError('❌ คุณไม่มีสิทธิ์สร้างโรงพยาบาลลูกข่ายภายใต้แม่ข่ายนี้');
        setLoading(false);
        return;
      }
    }

    try {
      const insertData: any = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        type: formData.type,
        parent_id: formData.type === 'sub' ? formData.parent_id : null,
        is_active: true,
      };

      const { error } = await supabase
        .from('hospitals')
        .insert(insertData);

      if (error) {
        if (error.code === '23505') {
          setError('รหัสโรงพยาบาลนี้มีผู้ใช้งานแล้ว กรุณาใช้รหัสอื่น');
        } else {
          throw error;
        }
        return;
      }

      setSuccess('✅ เพิ่มโรงพยาบาลสำเร็จ!');
      
      setTimeout(() => {
        router.push('/admin/hospitals');
      }, 1500);
    } catch (error: any) {
      console.error('❌ [handleSubmit] Error:', error);
      setError('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/hospitals')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าจัดการโรงพยาบาล
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🏥 {formMode === 'main' ? 'เพิ่มโรงพยาบาลแม่ข่ายใหม่' : 'เพิ่มโรงพยาบาลลูกข่ายใหม่'}
              </h1>
              <p className="text-gray-600">
                {formMode === 'main' 
                  ? 'กรอกข้อมูลโรงพยาบาลแม่ข่าย (โรงพยาบาลหลัก)' 
                  : 'กรอกข้อมูลโรงพยาบาลลูกข่ายภายใต้แม่ข่ายที่เลือก'}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? (
                          isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'
                        ) : user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 space-y-6">
          
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span className="text-green-700 text-sm">{success}</span>
            </div>
          )}

          {/* ✅ แสดงโหมดที่เลือก */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-800 font-medium">
                {formMode === 'main' 
                  ? '🏥 โหมด: เพิ่มโรงพยาบาลแม่ข่าย (โรงพยาบาลหลัก)' 
                  : '🏥 โหมด: เพิ่มโรงพยาบาลลูกข่าย (ภายใต้แม่ข่าย)'}
              </span>
            </div>
          </div>

          {/* ✅ กรณีเพิ่มลูกข่าย: แสดงข้อมูลแม่ข่ายที่เลือก */}
          {formMode === 'sub' && parentHospital && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-800 mb-2">
                🏥 โรงพยาบาลแม่ข่ายที่เลือก
              </h3>
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-bold text-green-900">{parentHospital.name}</p>
                  <p className="text-sm text-green-700">รหัส: {parentHospital.code}</p>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">
                ✅ โรงพยาบาลลูกข่ายที่คุณเพิ่มจะอยู่ภายใต้แม่ข่ายนี้
              </p>
            </div>
          )}

          {/* ชื่อโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder={formMode === 'main' ? 'เช่น โรงพยาบาลเพชรบูรณ์' : 'เช่น โรงพยาบาลสาขาเมือง'}
            />
          </div>

          {/* รหัสโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              รหัสโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
              required
              maxLength={50}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
              placeholder="เช่น PHETCHABUN"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 ต้องไม่ซ้ำกับรหัสอื่นในระบบ
            </p>
          </div>

          {/* ✅ เฉพาะกรณีเพิ่มลูกข่ายแบบเลือกแม่ข่ายเอง (ไม่ใช่จาก URL) */}
          {formMode === 'sub' && !parentHospital && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                โรงพยาบาลแม่ข่าย <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.parent_id}
                onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- เลือกแม่ข่าย --</option>
                {mainHospitals.map(h => (
                  <option key={h.id} value={h.id} disabled={!isSuperAdmin(user) && !accessibleHospitalIds.includes(h.id)}>
                    {h.name} ({h.code}){!isSuperAdmin(user) && accessibleHospitalIds.includes(h.id) ? ' ✅' : ''}
                  </option>
                ))}
              </select>
              {mainHospitals.length === 0 && (
                <p className="text-xs text-orange-500 mt-1">⚠️ ยังไม่มีโรงพยาบาลแม่ข่ายในระบบ</p>
              )}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Building2 className="w-5 h-5" />
                  {formMode === 'main' ? 'สร้างโรงพยาบาลแม่ข่าย' : 'สร้างโรงพยาบาลลูกข่าย'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/hospitals')}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export const dynamic = 'force-dynamic';