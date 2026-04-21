// app/admin/hospitals/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { Building2, Plus, Edit, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getProvinces, getDistricts } from '@/lib/supabase/queries';

export default function HospitalsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingHospital, setEditingHospital] = useState<any>(null);
  
  // ✅ State สำหรับจังหวัดและอำเภอ
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '',
    province: '',
    district: '',
    subdistrict: '',
    phone: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadHospitals();
    loadProvinces();
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

  // ✅ โหลดรายการจังหวัด
  const loadProvinces = async () => {
    try {
      setLoadingLocations(true);
      const provincesList = await getProvinces();
      setProvinces(provincesList);
    } catch (error) {
      console.error('Error loading provinces:', error);
    } finally {
      setLoadingLocations(false);
    }
  };

  // ✅ เมื่อเลือกจังหวัด ให้โหลดอำเภอ
  const handleProvinceChange = async (province: string) => {
    setFormData({ ...formData, province, district: '', subdistrict: '' });
    
    if (province) {
      try {
        const districtsList = await getDistricts(province);
        setDistricts(districtsList);
      } catch (error) {
        console.error('Error loading districts:', error);
      }
    } else {
      setDistricts([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingHospital) {
        // แก้ไข
        const { error } = await supabase
          .from('hospitals')
          .update({
            name: formData.name,
            code: formData.code,
            type: formData.type,
            parent_id: formData.type === 'sub' ? formData.parent_id : null,
            province: formData.province,
            district: formData.district,
            subdistrict: formData.subdistrict,
            phone: formData.phone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingHospital.id);

        if (error) throw error;
        alert('✅ แก้ไขโรงพยาบาลสำเร็จ!');
      } else {
        // เพิ่มใหม่
        const { error } = await supabase
          .from('hospitals')
          .insert({
            name: formData.name,
            code: formData.code,
            type: formData.type,
            parent_id: formData.type === 'sub' ? formData.parent_id : null,
            province: formData.province,
            district: formData.district,
            subdistrict: formData.subdistrict,
            phone: formData.phone,
            is_active: true,
          });

        if (error) throw error;
        alert('✅ เพิ่มโรงพยาบาลสำเร็จ!');
      }

      setShowModal(false);
      setEditingHospital(null);
      setFormData({
        name: '',
        code: '',
        type: 'main',
        parent_id: '',
        province: '',
        district: '',
        subdistrict: '',
        phone: '',
      });
      setDistricts([]);
      loadHospitals();
    } catch (error: any) {
      console.error('Error saving hospital:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleEdit = (hospital: any) => {
    setEditingHospital(hospital);
    setFormData({
      name: hospital.name,
      code: hospital.code,
      type: hospital.type,
      parent_id: hospital.parent_id || '',
      province: hospital.province || '',
      district: hospital.district || '',
      subdistrict: hospital.subdistrict || '',
      phone: hospital.phone || '',
    });
    
    // ✅ โหลดอำเภอของจังหวัดนี้
    if (hospital.province) {
      getDistricts(hospital.province).then(setDistricts);
    }
    
    setShowModal(true);
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

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingHospital(null);
    setFormData({
      name: '',
      code: '',
      type: 'main',
      parent_id: '',
      province: '',
      district: '',
      subdistrict: '',
      phone: '',
    });
    setDistricts([]);
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
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            ← กลับ
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🏥 จัดการโรงพยาบาล
              </h1>
              <p className="text-gray-600">จัดการโรงพยาบาลแม่ข่ายและลูกข่าย</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
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
                      onClick={() => handleEdit(hospital)}
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
        </div>

        {/* โรงพยาบาลลูกข่าย */}
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            🏥 โรงพยาบาลลูกข่าย ({subHospitals.length})
          </h2>
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
                        onClick={() => handleEdit(hospital)}
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
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingHospital ? 'แก้ไขโรงพยาบาล' : 'เพิ่มโรงพยาบาลใหม่'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทโรงพยาบาล *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as 'main' | 'sub'})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="main">โรงพยาบาลแม่ข่าย</option>
                  <option value="sub">โรงพยาบาลลูกข่าย</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อโรงพยาบาล *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น โรงพยาบาลเพชรบูรณ์"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รหัสโรงพยาบาล *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น PHETCHABUN"
                />
              </div>

              {formData.type === 'sub' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    โรงพยาบาลแม่ข่าย *
                  </label>
                  <select
                    value={formData.parent_id}
                    onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">-- เลือกแม่ข่าย --</option>
                    {mainHospitals.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ✅ จังหวัด - Dropdown จากฐานข้อมูล */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จังหวัด *
                </label>
                <select
                  value={formData.province}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">-- เลือกจังหวัด --</option>
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
                {loadingLocations && (
                  <p className="text-xs text-gray-500 mt-1">กำลังโหลดข้อมูล...</p>
                )}
              </div>

              {/* ✅ อำเภอ - Dropdown จากฐานข้อมูล */}
              {formData.province && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อำเภอ *
                  </label>
                  <select
                    value={formData.district}
                    onChange={(e) => setFormData({...formData, district: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">-- เลือกอำเภอ --</option>
                    {districts.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ตำบล
                </label>
                <input
                  type="text"
                  value={formData.subdistrict}
                  onChange={(e) => setFormData({...formData, subdistrict: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="056-123456"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600">
                  {editingHospital ? 'บันทึกการแก้ไข' : 'สร้างโรงพยาบาล'}
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