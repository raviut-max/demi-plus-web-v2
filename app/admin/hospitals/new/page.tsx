// app/admin/hospitals/new/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 2 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    2. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    3. Badge แสดงประเภทโรงพยาบาล
//    4. ✅ กรองโรงพยาบาลแม่ข่ายตามสิทธิ์การเข้าถึง (Super Admin vs Hospital Admin)
//    5. ✅ Hospital Admin สร้างได้เฉพาะใน hierarchy ของตัวเอง
//    6. ✅ Super Admin สร้างได้ทั้งหมด
//    7. เพิ่ม Debug Logging
//    8. ✅ เพิ่ม export dynamic = 'force-dynamic' เพื่อแก้ข้อผิดพลาด build
// =====================================================
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import { ArrowLeft, Building2, Hospital, UserCheck, LogOut, AlertCircle } from 'lucide-react';
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
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [mainHospitals, setMainHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
  }, [router]);

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
      console.log('🏥 [loadAccessibleHospitals] Hospital IDs:', ids);

      // ✅ โหลดโรงพยาบาลแม่ข่ายทั้งหมด
      let query = supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .order('name');

      // ✅ กรองตามสิทธิ์ (Hospital Admin เห็นเฉพาะที่ตัวเองเข้าถึงได้)
      if (ids.length > 0 && !isSuperAdmin(user)) {
        console.log('🔒 [loadAccessibleHospitals] Hospital Admin - filtering hospitals');
        query = query.in('id', ids);
      } else {
        console.log('👑 [loadAccessibleHospitals] Super Admin - showing all hospitals');
      }

      const { data, error } = await query;

      if (error) throw error;
      
      console.log('✅ [loadAccessibleHospitals] Loaded main hospitals:', data?.length || 0);
      setMainHospitals(data || []);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    console.log('📝 [handleSubmit] Form submitted:', formData);

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

    // ✅ ตรวจสอบสิทธิ์การสร้างโรงพยาบาลลูกข่าย
    if (formData.type === 'sub' && !isSuperAdmin(user)) {
      // Hospital Admin ต้องสร้างภายใต้ hierarchy ของตัวเองเท่านั้น
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

      console.log('💾 [handleSubmit] Inserting hospital:', insertData);

      const { error } = await supabase
        .from('hospitals')
        .insert(insertData);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          setError('รหัสโรงพยาบาลนี้มีผู้ใช้งานแล้ว กรุณาใช้รหัสอื่น');
        } else {
          throw error;
        }
        return;
      }

      console.log('✅ [handleSubmit] Hospital created successfully');
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
                🏥 เพิ่มโรงพยาบาลใหม่
              </h1>
              <p className="text-gray-600">กรอกข้อมูลโรงพยาบาลแม่ข่ายหรือลูกข่าย</p>
            </div>

            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
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
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}

                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
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

          {/* ข้อมูลสิทธิ์ (เพิ่มใหม่) */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">สิทธิ์การสร้างโรงพยาบาล</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              {isSuperAdmin(user) ? (
                <>
                  <li>👑 <strong>Super Admin:</strong> สร้างโรงพยาบาลแม่ข่ายและลูกข่ายได้ทั้งหมด</li>
                  <li>🔓 สามารถเลือกแม่ข่ายใดก็ได้ในระบบ</li>
                </>
              ) : (
                <>
                  <li>🏥 <strong>Hospital Admin:</strong> สร้างโรงพยาบาลได้เฉพาะใน hierarchy ของตัวเอง</li>
                  <li>🔒 สามารถเลือกแม่ข่ายได้เฉพาะที่ตัวเองเข้าถึงได้ ({accessibleHospitalIds.length} แห่ง)</li>
                </>
              )}
            </ul>
          </div>

          {/* ประเภทโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ประเภทโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as 'main' | 'sub'})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="main">โรงพยาบาลแม่ข่าย</option>
              <option value="sub">โรงพยาบาลลูกข่าย</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 แม่ข่าย = โรงพยาบาลหลัก, ลูกข่าย = โรงพยาบาลในสังกัด
            </p>
          </div>

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
              placeholder="เช่น โรงพยาบาลเพชรบูรณ์"
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

          {/* โรงพยาบาลแม่ข่าย (สำหรับลูกข่าย) */}
          {formData.type === 'sub' && (
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
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.code})
                    {!isSuperAdmin(user) && accessibleHospitalIds.includes(h.id) ? ' ✅' : ''}
                  </option>
                ))}
              </select>
              {mainHospitals.length === 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  ⚠️ ยังไม่มีโรงพยาบาลแม่ข่ายในระบบ
                </p>
              )}
              {!isSuperAdmin(user) && (
                <p className="text-xs text-blue-600 mt-1">
                  🔒 แสดงโรงพยาบาลแม่ข่ายที่คุณมีสิทธิ์เข้าถึง ({mainHospitals.length} แห่ง)
                </p>
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
                  สร้างโรงพยาบาล
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

// ✅ เพิ่มบรรทัดนี้เพื่อปิด Static Generation และใช้ Dynamic Rendering แทน
// แก้ข้อผิดพลาด: useSearchParams() should be wrapped in a suspense boundary
export const dynamic = 'force-dynamic';