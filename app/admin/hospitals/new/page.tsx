// app/admin/hospitals/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getHospitals, createHospital } from '@/lib/supabase/queries';
import { ArrowLeft, Save, Building2, Hospital, MapPin, Phone, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
}

function NewHospitalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [parentHospital, setParentHospital] = useState<Hospital | null>(null);
  
  // อ่าน query params
  const hospitalType = searchParams.get('type') || 'main';
  const parentId = searchParams.get('parent') || '';
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: hospitalType as 'main' | 'sub',
    parent_id: parentId || null,
    address: '',
    phone: '',
    province: '',
    district: '',
    subdistrict: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (userData.role !== 'admin') {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/dashboard');
      return;
    }
    setUser(userData);
    
    // ถ้าเป็นลูกข่าย โหลดข้อมูลแม่ข่าย
    if (hospitalType === 'sub' && parentId) {
      loadParentHospital(parentId);
    }
  }, [router, hospitalType, parentId]);

  const loadParentHospital = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('id, name, code')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setParentHospital(data);
    } catch (error) {
      console.error('Error loading parent hospital:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.code) {
      alert('กรุณากรอกชื่อและรหัสโรงพยาบาล');
      return;
    }

    setLoading(true);
    try {
      const result = await createHospital({
        name: formData.name,
        code: formData.code,
        type: formData.type,
        parent_id: formData.parent_id,
        address: formData.address,
        phone: formData.phone,
        province: formData.province,
        district: formData.district,
        subdistrict: formData.subdistrict,
      });

      if (result.success) {
        alert('✅ สร้างโรงพยาบาลสำเร็จ!');
        router.push('/admin/hospitals');
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating hospital:', error);
      alert('เกิดข้อผิดพลาดในการสร้างโรงพยาบาล');
    } finally {
      setLoading(false);
    }
  };

  const isSubHospital = hospitalType === 'sub';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/hospitals')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {isSubHospital ? '🏥 เพิ่มโรงพยาบาลลูกข่าย' : '🏥 เพิ่มโรงพยาบาลแม่ข่าย'}
            </h1>
            <p className="text-gray-600">
              {isSubHospital 
                ? 'กรอกข้อมูลโรงพยาบาลลูกข่ายภายใต้ ' + (parentHospital?.name || '')
                : 'กรอกข้อมูลโรงพยาบาลแม่ข่ายใหม่'}
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      {isSubHospital && parentHospital && (
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Hospital className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">โรงพยาบาลแม่ข่าย</p>
              <p>
                <strong>{parentHospital.name}</strong> ({parentHospital.code})
              </p>
              <p className="text-xs text-blue-600 mt-1">
                โรงพยาบาลลูกข่ายที่จะเพิ่มจะอยู่ภายใต้โรงพยาบาลนี้
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* ข้อมูลพื้นฐาน */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            ข้อมูลพื้นฐาน
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ประเภทโรงพยาบาล
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                disabled={isSubHospital}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="main">แม่ข่าย</option>
                <option value="sub">ลูกข่าย</option>
              </select>
              {isSubHospital && (
                <p className="text-xs text-gray-500 mt-1">
                  ประเภทถูกกำหนดเป็น "ลูกข่าย" โดยอัตโนมัติ
                </p>
              )}
            </div>

            {/* แสดงเฉพาะกรณีแม่ข่าย */}
            {!isSubHospital && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  โรงพยาบาลแม่ (ถ้ามี)
                </label>
                <select
                  name="parent_id"
                  value={formData.parent_id || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- ไม่มี --</option>
                  {/* สามารถเพิ่ม dropdown เลือกแม่ข่ายได้ที่นี่ถ้าต้องการ */}
                </select>
              </div>
            )}

            {/* แสดงเฉพาะกรณีลูกข่าย - ซ่อน parent_id แต่แสดงข้อมูลแม่ข่าย */}
            {isSubHospital && parentId && (
              <input
                type="hidden"
                name="parent_id"
                value={parentId}
              />
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อโรงพยาบาล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น โรงพยาบาลเพชรบูรณ์"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสโรงพยาบาล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น PHC001"
              />
            </div>
          </div>
        </div>

        {/* ที่อยู่ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            ที่อยู่
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ที่อยู่
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เลขที่ ถนน หมู่บ้าน"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ตำบล/แขวง
                </label>
                <input
                  type="text"
                  name="subdistrict"
                  value={formData.subdistrict}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อำเภอ/เขต
                </label>
                <input
                  type="text"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จังหวัด
                </label>
                <input
                  type="text"
                  name="province"
                  value={formData.province}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ข้อมูลติดต่อ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            ข้อมูลติดต่อ
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เบอร์โทรศัพท์
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0-xxxx-xxxx"
            />
          </div>
        </div>

        {/* ปุ่มดำเนินการ */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {isSubHospital ? 'เพิ่มโรงพยาบาลลูกข่าย' : 'เพิ่มโรงพยาบาลแม่ข่าย'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewHospitalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <NewHospitalForm />
    </Suspense>
  );
}