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
    } catch (error) {
      console.error('Error loading hospitals:', error);
    } finally {
      setLoading(false);
    }
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

  const mainHospitals = hospitals.filter(h => h.type === 'main');
  const subHospitals = hospitals.filter(h => h.type === 'sub');

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
            {/* ✅ แก้ไขตรงนี้ - เปลี่ยนจาก Modal เป็น Navigate ไปหน้าใหม่ */}
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
        {/* โรงพยาบาลแม่ข่าย */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            🏥 โรงพยาบาลแม่ข่าย ({mainHospitals.length})
          </h2>
          {mainHospitals.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">ยังไม่มีโรงพยาบาลแม่ข่าย</p>
              <button
                onClick={() => router.push('/admin/hospitals/new')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                เพิ่มโรงพยาบาลแรก
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mainHospitals.map(hospital => (
                <div key={hospital.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-8 h-8 text-blue-600" />
                      <div>
                        <h3 className="font-bold text-gray-800">{hospital.name}</h3>
                        <p className="text-sm text-gray-500">{hospital.code}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/admin/hospitals/${hospital.id}/edit`)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(hospital.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>📍 {hospital.province} {hospital.district}</p>
                    <p>📞 {hospital.phone || '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* โรงพยาบาลลูกข่าย */}
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            🏥 โรงพยาบาลลูกข่าย ({subHospitals.length})
          </h2>
          {subHospitals.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">ยังไม่มีโรงพยาบาลลูกข่าย</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subHospitals.map(hospital => {
                const parent = hospitals.find(h => h.id === hospital.parent_id);
                return (
                  <div key={hospital.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-green-600" />
                        <div>
                          <h3 className="font-bold text-gray-800">{hospital.name}</h3>
                          <p className="text-sm text-gray-500">{hospital.code}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/admin/hospitals/${hospital.id}/edit`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(hospital.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p>🏢 แม่ข่าย: {parent?.name || '-'}</p>
                      <p>📍 {hospital.province} {hospital.district}</p>
                      <p>📞 {hospital.phone || '-'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}