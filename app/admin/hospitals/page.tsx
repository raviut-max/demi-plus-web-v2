// app/admin/hospitals/page.tsx
// ✅ แก้ไขล่าสุด: 10 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ ปุ่มด้านบน "เพิ่มโรงพยาบาล" สำหรับเพิ่มแม่ข่ายเท่านั้น (Super Admin เท่านั้น)
//    2. ✅ Hospital Admin ไม่มีปุ่มเพิ่มแม่ข่าย
//    3. ✅ ปุ่ม "เพิ่มลูกข่าย" อยู่ภายในแต่ละโรงพยาบาลแม่ข่าย
//    4. ✅ แสดงเฉพาะโรงพยาบาลที่ผู้ใช้มีสิทธิ์เข้าถึง
//    5. ✅ ส่ง parent_id เมื่อเพิ่มลูกข่าย

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getUserHospitalInfo, getAccessibleHospitalIds, isSuperAdmin } from '@/lib/supabase/queries';
import { Building2, Plus, Edit, Trash2, ArrowLeft, Hospital, Activity, UserCheck, LogOut, Shield } from 'lucide-react';
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

export default function HospitalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [groupedHospitals, setGroupedHospitals] = useState<any[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadHospitals();
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

  const loadHospitals = async () => {
    try {
      console.log('🏥 [loadHospitals] Fetching hospitals...');
      // ✅ ดึงโรงพยาบาลที่เข้าถึงได้
      const ids = await getAccessibleHospitalIds(user?.id);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadHospitals] Accessible hospitals:', ids.length, 'hospitals');
      
      let query = supabase
        .from('hospitals')
        .select('*')
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true });
      
      // ✅ กรองตามโรงพยาบาลที่เข้าถึงได้ (ถ้าไม่ใช่ Super Admin)
      if (ids.length > 0) {
        query = query.in('id', ids);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      console.log('✅ [loadHospitals] Loaded:', data?.length || 0, 'hospitals');
      setHospitals(data || []);
      
      // ✅ จัดกลุ่มโรงพยาบาลแม่ข่ายกับลูกข่าย
      const grouped = groupHospitals(data || []);
      setGroupedHospitals(grouped);
    } catch (error) {
      console.error('❌ [loadHospitals] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันจัดกลุ่มโรงพยาบาล
  const groupHospitals = (allHospitals: any[]) => {
    console.log('📊 [groupHospitals] Grouping', allHospitals.length, 'hospitals...');
    const mainHospitals = allHospitals.filter(h => h.type === 'main');
    const subHospitals = allHospitals.filter(h => h.type === 'sub');

    console.log('📊 [groupHospitals] Main:', mainHospitals.length, 'Sub:', subHospitals.length);

    // ✅ จัดกลุ่มโดยให้ลูกข่ายอยู่ใต้แม่ข่าย
    const grouped = mainHospitals.map(main => {
      const children = subHospitals.filter(sub => sub.parent_id === main.id);
      return {
        ...main,
        children: children,
        childrenCount: children.length,
      };
    });

    // ✅ เพิ่มแม่ข่ายที่ไม่มีลูกข่าย (แสดงเดี่ยว)
    const orphanSubs = subHospitals.filter(sub => {
      const hasParent = mainHospitals.some(main => main.id === sub.parent_id);
      return !hasParent;
    });

    // ✅ เพิ่มลูกข่ายที่ไม่มีแม่ข่าย (ถ้ามี)
    if (orphanSubs.length > 0) {
      grouped.push({
        id: 'orphan',
        name: 'โรงพยาบาลลูกข่าย (ไม่มีแม่ข่าย)',
        type: 'orphan',
        children: orphanSubs,
        childrenCount: orphanSubs.length,
      });
    }

    console.log('✅ [groupHospitals] Grouped into', grouped.length, 'groups');
    return grouped;
  };

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('คุณต้องการลบโรงพยาบาลนี้หรือไม่?')) return;
    try {
      const { error } = await supabase
        .from('hospitals')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
      alert('✅ ลบโรงพยาบาลสำเร็จ!');
      loadHospitals();
    } catch (error: any) {
      console.error('❌ [handleDelete] Error:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // ✅ คำนวณจำนวนโรงพยาบาล
  const totalHospitals = hospitals.length;
  const mainHospitalsCount = hospitals.filter(h => h.type === 'main').length;
  const subHospitalsCount = hospitals.filter(h => h.type === 'sub').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/settings')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🏥 จัดการโรงพยาบาล
              </h1>
              <p className="text-gray-600">จัดการโรงพยาบาลแม่ข่ายและลูกข่าย</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล พร้อมระดับแอดมิน */}
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
                          isSuperAdmin(user) ? (
                            <span className="flex items-center gap-1">
                              <Shield className="w-3 h-3 text-purple-600" />
                              👑 Super Admin
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Hospital className="w-3 h-3 text-blue-600" />
                              🏥 Hospital Admin
                            </span>
                          )
                        ) : user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
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

              {/* ✅ ปุ่มเพิ่มโรงพยาบาลแม่ข่าย - แสดงเฉพาะ Super Admin */}
              {isSuperAdmin(user) && (
                <button
                  onClick={() => router.push('/admin/hospitals/new?type=main')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มโรงพยาบาลแม่ข่าย
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ✅ สรุปจำนวนโรงพยาบาล */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* ทั้งหมด */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm mb-1">โรงพยาบาลทั้งหมด</p>
                <p className="text-4xl font-bold">{totalHospitals}</p>
                {accessibleHospitalIds.length > 0 && accessibleHospitalIds.length < 100 && (
                  <p className="text-xs text-blue-200 mt-1">
                    🔒 จาก {accessibleHospitalIds.length} รพ. ที่เข้าถึงได้
                  </p>
                )}
              </div>
              <Hospital className="w-12 h-12 text-blue-200 opacity-50" />
            </div>
          </div>

          {/* แม่ข่าย */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm mb-1">โรงพยาบาลแม่ข่าย</p>
                <p className="text-4xl font-bold">{mainHospitalsCount}</p>
              </div>
              <Building2 className="w-12 h-12 text-green-200 opacity-50" />
            </div>
          </div>

          {/* ลูกข่าย */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm mb-1">โรงพยาบาลลูกข่าย</p>
                <p className="text-4xl font-bold">{subHospitalsCount}</p>
              </div>
              <Activity className="w-12 h-12 text-purple-200 opacity-50" />
            </div>
          </div>
        </div>

        {/* ✅ แสดงเป็นกลุ่ม แม่ข่าย + ลูกข่าย */}
        <div className="space-y-8">
          {groupedHospitals.map((group) => (
            <div key={group.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {/* ✅ Header ของกลุ่ม (แม่ข่าย) */}
              {group.type !== 'orphan' && (
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Building2 className="w-8 h-8" />
                      <div>
                        <h2 className="text-xl font-bold">{group.name}</h2>
                        <p className="text-blue-100 text-sm">{group.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                        {group.childrenCount} ลูกข่าย
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/admin/hospitals/${group.id}/edit`)}
                          className="p-2 hover:bg-white/20 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="p-2 hover:bg-white/20 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ รายการลูกข่าย */}
              <div className="p-6">
                {group.type === 'orphan' ? (
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-orange-500" />
                      {group.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.children.map((sub: any) => (
                        <HospitalCard 
                          key={sub.id} 
                          hospital={sub} 
                          onEdit={() => router.push(`/admin/hospitals/${sub.id}/edit`)}
                          onDelete={() => handleDelete(sub.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : group.children.length > 0 ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.children.map((sub: any) => (
                        <HospitalCard 
                          key={sub.id} 
                          hospital={sub} 
                          onEdit={() => router.push(`/admin/hospitals/${sub.id}/edit`)}
                          onDelete={() => handleDelete(sub.id)}
                        />
                      ))}
                    </div>
                    {/* ✅ ปุ่มเพิ่มลูกข่าย - แสดงภายในแม่ข่าย */}
                    <div className="mt-6 text-center">
                      <button
                        onClick={() => router.push(`/admin/hospitals/new?type=sub&parent=${group.id}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        เพิ่มลูกข่าย
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>ยังไม่มีโรงพยาบาลลูกข่าย</p>
                    {/* ✅ ปุ่มเพิ่มลูกข่าย - แสดงแม้จะยังไม่มี */}
                    <button
                      onClick={() => router.push(`/admin/hospitals/new?type=sub&parent=${group.id}`)}
                      className="mt-2 text-blue-500 hover:text-blue-600 font-medium"
                    >
                      + เพิ่มลูกข่าย
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {groupedHospitals.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">ยังไม่มีโรงพยาบาล</p>
            {isSuperAdmin(user) && (
              <button
                onClick={() => router.push('/admin/hospitals/new?type=main')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                เพิ่มโรงพยาบาลแรก
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ Component สำหรับแสดงการ์ดโรงพยาบาลลูกข่าย
function HospitalCard({ hospital, onEdit, onDelete }: {
  hospital: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="font-semibold text-gray-800">{hospital.name}</h3>
            <p className="text-sm text-gray-500">{hospital.code}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-all"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {hospital.phone && (
        <div className="text-sm text-gray-600 flex items-center gap-2">
          <span>📞</span>
          <span>{hospital.phone}</span>
        </div>
      )}
    </div>
  );
}