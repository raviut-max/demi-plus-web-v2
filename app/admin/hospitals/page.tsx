// app/admin/hospitals/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, getHospitals, createHospital } from '@/lib/supabase/queries';
import { Building2, Plus, Edit, Trash2 } from 'lucide-react';

export default function HospitalsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '',
    province: '',
    district: '',
  });

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
    const data = await getHospitals();
    setHospitals(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createHospital(formData);
    if (result.success) {
      alert('✅ สร้างโรงพยาบาลสำเร็จ!');
      setShowModal(false);
      loadHospitals();
    } else {
      alert('❌ ' + result.error);
    }
  };

  if (loading) return <div>กำลังโหลด...</div>;

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
            🏥 โรงพยาบาลแม่ข่าย ({hospitals.filter(h => h.type === 'main').length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hospitals.filter(h => h.type === 'main').map(hospital => (
              <div key={hospital.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <div>
                    <h3 className="font-bold text-gray-800">{hospital.name}</h3>
                    <p className="text-sm text-gray-500">{hospital.code}</p>
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
            🏥 โรงพยาบาลลูกข่าย ({hospitals.filter(h => h.type === 'sub').length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hospitals.filter(h => h.type === 'sub').map(hospital => (
              <div key={hospital.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <Building2 className="w-8 h-8 text-green-600" />
                  <div>
                    <h3 className="font-bold text-gray-800">{hospital.name}</h3>
                    <p className="text-sm text-gray-500">{hospital.code}</p>
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
      </div>

      {/* Modal เพิ่มโรงพยาบาล */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">เพิ่มโรงพยาบาลใหม่</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทโรงพยาบาล
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as 'main' | 'sub'})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                    โรงพยาบาลแม่ข่าย
                  </label>
                  <select
                    value={formData.parent_id}
                    onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- เลือกแม่ข่าย --</option>
                    {hospitals.filter(h => h.type === 'main').map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จังหวัด
                  </label>
                  <input
                    type="text"
                    value={formData.province}
                    onChange={(e) => setFormData({...formData, province: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อำเภอ
                  </label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({...formData, district: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600">
                  บันทึก
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-500 text-white py-3 rounded-lg">
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