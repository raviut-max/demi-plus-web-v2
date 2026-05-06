// app/admin/hospitals/[id]/edit/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 2 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    2. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    3. Badge แสดงประเภทโรงพยาบาล
//    4. ✅ เพิ่มระบบ Super Admin / Hospital Admin
//    5. ✅ ตรวจสอบสิทธิ์ก่อนแก้ไขโรงพยาบาล
//    6. ✅ กรองโรงพยาบาลแม่ข่ายตามสิทธิ์การเข้าถึง
//    7. ✅ Super Admin แก้ไขได้ทั้งหมด
//    8. ✅ Hospital Admin แก้ไขได้เฉพาะที่ตัวเองเข้าถึง
//    9. UI สอดคล้องกับหน้าอื่นๆ
// =====================================================

'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  checkSession, 
  logout, 
  getUserHospitalInfo, 
  getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import { 
  ArrowLeft, 
  Building2, 
  Save, 
  Hospital, 
  UserCheck, 
  LogOut, 
  AlertCircle,
  Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 INTERFACES
// =====================================================

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
  address: string | null;
  is_active: boolean;
}

// =====================================================
// 🎯 MAIN COMPONENT
// =====================================================

export default function EditHospitalPage() {
  const router = useRouter();
  const params = useParams();
  const hospitalId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mainHospitals, setMainHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '',
    address: '',
    is_active: true,
  });

  // =====================================================
  // 🔄 INITIAL DATA LOADING
  // =====================================================

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin'].includes(userData.role)) {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขโรงพยาบาลได้');
      router.push('/admin/hospitals');
      return;
    }

    console.log('👤 [EditHospital] User:', userData);
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadHospital();
  }, [router, hospitalId]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================

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

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้ (Super Admin vs Hospital Admin)
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🔍 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      console.log('🏥 [loadAccessibleHospitals] Hospital IDs:', ids);

      // ✅ ตรวจสอบว่าเป็น Super Admin หรือไม่
      const isSuper = isSuperAdmin(user);
      console.log('👑 [loadAccessibleHospitals] Is Super Admin:', isSuper);

      // ✅ โหลดโรงพยาบาลแม่ข่ายทั้งหมด (สำหรับ dropdown)
      let query = supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .neq('id', hospitalId) // ไม่รวมโรงพยาบาลที่กำลังแก้ไข
        .order('name');

      // ✅ กรองตามสิทธิ์ (Hospital Admin เห็นเฉพาะที่ตัวเองเข้าถึงได้)
      if (ids.length > 0 && !isSuper) {
        console.log('🔒 [loadAccessibleHospitals] Hospital Admin - filtering hospitals');
        query = query.in('id', ids);
      } else {
        console.log('👑 [loadAccessibleHospitals] Super Admin - showing all hospitals');
      }

      const { data, error } = await query;

      if (error) throw error;
      setMainHospitals(data || []);
      console.log('✅ [loadAccessibleHospitals] Loaded main hospitals:', data?.length || 0);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    }
  };

  // ✅ โหลดข้อมูลโรงพยาบาลที่จะแก้ไข
  const loadHospital = async () => {
    try {
      console.log('🏥 [loadHospital] Loading hospital:', hospitalId);
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('id', hospitalId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || '',
          code: data.code || '',
          type: data.type || 'main',
          parent_id: data.parent_id || '',
          address: data.address || '',
          is_active: data.is_active ?? true,
        });

        // ✅ ตรวจสอบสิทธิ์การแก้ไขโรงพยาบาลนี้
        const isSuper = isSuperAdmin(user);
        if (isSuper) {
          // ✅ Super Admin แก้ไขได้ทั้งหมด
          setHasPermission(true);
          console.log('👑 [loadHospital] Super Admin - has permission');
        } else if (accessibleHospitalIds.length > 0) {
          // ✅ Hospital Admin แก้ไขได้เฉพาะที่ตัวเองเข้าถึง
          const hasAccess = accessibleHospitalIds.includes(hospitalId);
          setHasPermission(hasAccess);
          console.log(' [loadHospital] Hospital Admin - has permission:', hasAccess);
          
          if (!hasAccess) {
            setError('❌ คุณไม่มีสิทธิ์แก้ไขโรงพยาบาลนี้');
          }
        } else {
          setHasPermission(true);
        }
      }
    } catch (error: any) {
      console.error('❌ [loadHospital] Error:', error);
      setError('ไม่พบข้อมูลโรงพยาบาล');
      setTimeout(() => {
        router.push('/admin/hospitals');
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

  // =====================================================
  // 📝 FORM SUBMIT
  // =====================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ ตรวจสอบสิทธิ์อีกครั้งก่อนบันทึก
    if (!hasPermission) {
      setError('❌ คุณไม่มีสิทธิ์แก้ไขโรงพยาบาลนี้');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);

    console.log('📝 [handleSubmit] Form submitted:', formData);
    console.log(' [handleSubmit] Hospital ID:', hospitalId);
    console.log('👑 [handleSubmit] Is Super Admin:', isSuperAdmin(user));
    console.log('🔒 [handleSubmit] Accessible hospitals:', accessibleHospitalIds);

    // ✅ Validation
    if (!formData.name.trim()) {
      setError('กรุณากรอกชื่อโรงพยาบาล');
      setSaving(false);
      return;
    }

    if (!formData.code.trim()) {
      setError('กรุณากรอกรหัสโรงพยาบาล');
      setSaving(false);
      return;
    }

    if (formData.type === 'sub' && !formData.parent_id) {
      setError('กรุณาเลือกโรงพยาบาลแม่ข่าย');
      setSaving(false);
      return;
    }

    // ✅ ตรวจสอบสิทธิ์การแก้ไข (Hospital Admin ต้องแก้ไขใน scope ของตัวเอง)
    if (!isSuperAdmin(user) && accessibleHospitalIds.length > 0) {
      if (!accessibleHospitalIds.includes(hospitalId)) {
        setError('❌ คุณไม่มีสิทธิ์แก้ไขโรงพยาบาลนี้');
        setSaving(false);
        return;
      }
      
      // ✅ ตรวจสอบว่าเลือกแม่ข่ายใน scope ของตัวเองหรือไม่ (สำหรับลูกข่าย)
      if (formData.type === 'sub' && formData.parent_id) {
        if (!accessibleHospitalIds.includes(formData.parent_id)) {
          setError('❌ คุณไม่มีสิทธิ์เลือกโรงพยาบาลแม่ข่ายนี้');
          setSaving(false);
          return;
        }
      }
    }

    try {
      const updateData: any = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        type: formData.type,
        parent_id: formData.type === 'sub' ? formData.parent_id : null,
        address: formData.address.trim() || null,
        is_active: formData.is_active,
        // ✅ updated_at จะถูกอัปเดตโดย trigger อัตโนมัติ
      };

      console.log('💾 [handleSubmit] Updating hospital:', hospitalId, 'with data:', updateData);

      const { error } = await supabase
        .from('hospitals')
        .update(updateData)
        .eq('id', hospitalId);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          setError('รหัสโรงพยาบาลนี้มีผู้ใช้งานแล้ว กรุณาใช้รหัสอื่น');
        } else {
          throw error;
        }
        return;
      }

      console.log('✅ [handleSubmit] Hospital updated successfully');
      setSuccess('✅ แก้ไขโรงพยาบาลสำเร็จ!');
      setTimeout(() => {
        router.push('/admin/hospitals');
      }, 1500);
    } catch (error: any) {
      console.error('❌ [handleSubmit] Error:', error);
      setError('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // ⏳ LOADING STATE
  // =====================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  // =====================================================
  // 🚫 NO PERMISSION STATE
  // =====================================================

  if (!hasPermission && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            ❌ ไม่มีสิทธิ์เข้าถึง
          </h2>
          <p className="text-gray-600 mb-4">
            คุณไม่มีสิทธิ์แก้ไขโรงพยาบาลนี้
          </p>
          <button
            onClick={() => router.push('/admin/hospitals')}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
          >
            กลับหน้าจัดการโรงพยาบาล
          </button>
        </div>
      </div>
    );
  }

  // =====================================================
  // 🎨 RENDER UI
  // =====================================================

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
                🏥 แก้ไขข้อมูลโรงพยาบาล
              </h1>
              <p className="text-gray-600">ปรับปรุงข้อมูลโรงพยาบาลแม่ข่ายหรือลูกข่าย</p>
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
          
          {/* ✅ แสดงข้อมูลสิทธิ์ (เพิ่มใหม่) */}
          <div className={`rounded-lg p-4 border ${
            isSuperAdmin(user) 
              ? 'bg-purple-50 border-purple-200' 
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Lock className={`w-4 h-4 ${
                isSuperAdmin(user) ? 'text-purple-600' : 'text-blue-600'
              }`} />
              <h3 className="text-sm font-semibold text-gray-800">
                สิทธิ์การแก้ไข
              </h3>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              {isSuperAdmin(user) ? (
                <>
                  <li>👑 <strong>Super Admin:</strong> สามารถแก้ไขโรงพยาบาลได้ทั้งหมด</li>
                  <li>📊 โรงพยาบาลที่แก้ไขได้: ทั้งหมดในระบบ</li>
                </>
              ) : (
                <>
                  <li>🏥 <strong>Hospital Admin:</strong> แก้ไขได้เฉพาะโรงพยาบาลที่ตัวเองดูแล</li>
                  <li>📊 โรงพยาบาลที่แก้ไขได้: {accessibleHospitalIds.length} แห่ง</li>
                </>
              )}
            </ul>
          </div>

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
                  </option>
                ))}
              </select>
              {mainHospitals.length === 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  ⚠️ ยังไม่มีโรงพยาบาลแม่ข่ายในระบบ
                </p>
              )}
              {!isSuperAdmin(user) && accessibleHospitalIds.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  🔒 แสดงโรงพยาบาลแม่ข่ายที่คุณมีสิทธิ์เข้าถึง ({mainHospitals.length} แห่ง)
                </p>
              )}
            </div>
          )}

          {/* ที่อยู่ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ที่อยู่
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="ที่อยู่โรงพยาบาล (ถ้ามี)"
            />
          </div>

          {/* สถานะการใช้งาน */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                เปิดใช้งานโรงพยาบาลนี้
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              💡 ยกเลิกการเลือกเพื่อปิดการใช้งานชั่วคราว (จะไม่แสดงในระบบ)
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving || !hasPermission}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
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