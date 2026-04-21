// app/admin/hospitals/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { Building2, Plus, Edit, Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function HospitalsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [groupedHospitals, setGroupedHospitals] = useState<any[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadHospitals();
  }, [router]);

  const loadHospitals = async () => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setHospitals(data || []);
      
      // ✅ จัดกลุ่มโรงพยาบาลแม่ข่ายกับลูกข่าย
      const grouped = groupHospitals(data || []);
      setGroupedHospitals(grouped);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันจัดกลุ่มโรงพยาบาล
  const groupHospitals = (allHospitals: any[]) => {
    const mainHospitals = allHospitals.filter(h => h.type === 'main');
    const subHospitals = allHospitals.filter(h => h.type === 'sub');

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

    return grouped;
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
      console.error('Error deleting hospital:', error);
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🏥 จัดการโรงพยาบาล
              </h1>
              <p className="text-gray-600">จัดการโรงพยาบาลแม่ข่ายและลูกข่าย</p>
            </div>
            <button
              onClick={() => router.push('/admin/hospitals/new')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              เพิ่มโรงพยาบาล
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
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
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>ยังไม่มีโรงพยาบาลลูกข่าย</p>
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
            <button
              onClick={() => router.push('/admin/hospitals/new')}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              เพิ่มโรงพยาบาลแรก
            </button>
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