// app/admin/villages/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { Home, Plus, Edit, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function VillagesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [villages, setVillages] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingVillage, setEditingVillage] = useState<any>(null);
  const [formData, setFormData] = useState({
    village_no: '',
    village_name: '',
    subdistrict: '',
    district: '',
    province: '',
    postal_code: '',
    hospital_id: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      // โหลดหมู่บ้าน
      const { data: villagesData, error: villagesError } = await supabase
        .from('villages')
        .select(`
          *,
          hospitals (
            name,
            type
          )
        `)
        .eq('is_active', true)
        .order('province', { ascending: true })
        .order('district', { ascending: true })
        .order('subdistrict', { ascending: true })
        .order('village_no', { ascending: true });

      if (villagesError) throw villagesError;
      setVillages(villagesData || []);

      // โหลดโรงพยาบาล
      const { data: hospitalsData, error: hospitalsError } = await supabase
        .from('hospitals')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (hospitalsError) throw hospitalsError;
      setHospitals(hospitalsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingVillage) {
        // แก้ไข
        const { error } = await supabase
          .from('villages')
          .update({
            village_no: formData.village_no,
            village_name: formData.village_name,
            subdistrict: formData.subdistrict,
            district: formData.district,
            province: formData.province,
            postal_code: formData.postal_code,
            hospital_id: formData.hospital_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingVillage.id);

        if (error) throw error;
        alert('✅ แก้ไขหมู่บ้านสำเร็จ!');
      } else {
        // เพิ่มใหม่
        const { error } = await supabase
          .from('villages')
          .insert({
            village_no: formData.village_no,
            village_name: formData.village_name,
            subdistrict: formData.subdistrict,
            district: formData.district,
            province: formData.province,
            postal_code: formData.postal_code,
            hospital_id: formData.hospital_id || null,
            is_active: true,
          });

        if (error) throw error;
        alert('✅ เพิ่มหมู่บ้านสำเร็จ!');
      }

      setShowModal(false);
      setEditingVillage(null);
      setFormData({
        village_no: '',
        village_name: '',
        subdistrict: '',
        district: '',
        province: '',
        postal_code: '',
        hospital_id: '',
      });
      loadData();
    } catch (error: any) {
      console.error('Error saving village:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleEdit = (village: any) => {
    setEditingVillage(village);
    setFormData({
      village_no: village.village_no,
      village_name: village.village_name || '',
      subdistrict: village.subdistrict,
      district: village.district,
      province: village.province,
      postal_code: village.postal_code || '',
      hospital_id: village.hospital_id || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('คุณต้องการลบหมู่บ้านนี้หรือไม่?')) return;

    try {
      const { error } = await supabase
        .from('villages')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      alert('✅ ลบหมู่บ้านสำเร็จ!');
      loadData();
    } catch (error: any) {
      console.error('Error deleting village:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVillage(null);
    setFormData({
      village_no: '',
      village_name: '',
      subdistrict: '',
      district: '',
      province: '',
      postal_code: '',
      hospital_id: '',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // จัดกลุ่มหมู่บ้านตามจังหวัด/อำเภอ/ตำบล
  const groupedVillages = villages.reduce((acc, village) => {
    const key = `${village.province}-${village.district}-${village.subdistrict}`;
    if (!acc[key]) {
      acc[key] = {
        province: village.province,
        district: village.district,
        subdistrict: village.subdistrict,
        villages: [],
      };
    }
    acc[key].villages.push(village);
    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            ← กลับ
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🏘️ จัดการหมู่บ้าน
              </h1>
              <p className="text-gray-600">จัดการหมู่บ้านและกำหนดโรงพยาบาลที่ดูแล</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              เพิ่มหมู่บ้าน
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* แสดงหมู่บ้านตามกลุ่ม */}
        <div className="space-y-6">
          {Object.values(groupedVillages).map((group: any, index) => (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                📍 {group.province} > {group.district} > {group.subdistrict}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.villages.map((village: any) => {
                  const hospital = hospitals.find(h => h.id === village.hospital_id);
                  return (
                    <div key={village.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Home className="w-5 h-5 text-blue-600" />
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              หมู่ {village.village_no} {village.village_name}
                            </h3>
                            {village.postal_code && (
                              <p className="text-sm text-gray-500">{village.postal_code}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(village)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(village.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {hospital && (
                        <div className="text-sm text-gray-600">
                          <p className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {hospital.name}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {villages.length === 0 && (
          <div className="text-center py-12">
            <Home className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">ยังไม่มีข้อมูลหมู่บ้าน</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              เพิ่มหมู่บ้านแรก
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingVillage ? 'แก้ไขหมู่บ้าน' : 'เพิ่มหมู่บ้านใหม่'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมู่ที่ *
                  </label>
                  <input
                    type="text"
                    value={formData.village_no}
                    onChange={(e) => setFormData({...formData, village_no: e.target.value})}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อหมู่บ้าน
                  </label>
                  <input
                    type="text"
                    value={formData.village_name}
                    onChange={(e) => setFormData({...formData, village_name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="บ้านคลองศาลา"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ตำบล *
                  </label>
                  <input
                    type="text"
                    value={formData.subdistrict}
                    onChange={(e) => setFormData({...formData, subdistrict: e.target.value})}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อำเภอ *
                  </label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({...formData, district: e.target.value})}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จังหวัด *
                  </label>
                  <input
                    type="text"
                    value={formData.province}
                    onChange={(e) => setFormData({...formData, province: e.target.value})}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสไปรษณีย์
                  </label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="67000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  โรงพยาบาลที่ดูแล
                </label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => setFormData({...formData, hospital_id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- ไม่กำหนด --</option>
                  {hospitals.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600">
                  {editingVillage ? 'บันทึกการแก้ไข' : 'สร้างหมู่บ้าน'}
                </button>
                <button type="button" onClick={handleCloseModal} className="flex-1 bg-gray-500 text-white py-3 rounded-lg">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ต้อง import Building2
import { Building2 } from 'lucide-react';