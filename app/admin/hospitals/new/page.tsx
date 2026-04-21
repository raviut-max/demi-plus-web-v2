// app/admin/hospitals/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { ArrowLeft, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function NewHospitalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  // State สำหรับจังหวัด/อำเภอ/ตำบล
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [subdistricts, setSubdistricts] = useState<string[]>([]);
  const [mainHospitals, setMainHospitals] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '',
    province: '',
    district: '',
    subdistrict: '',
    postal_code: '',
    phone: '',
  });

  // 🔍 DEBUG: ตรวจสอบเมื่อ component mount
  useEffect(() => {
    console.log('🔍 [DEBUG] Component mounted');
    console.log('🔍 [DEBUG] Supabase client:', supabase ? 'Connected' : 'Not connected');
    
    const userData = checkSession();
    console.log('🔍 [DEBUG] User session:', userData);
    
    if (!userData || !['admin'].includes(userData.role)) {
      console.log('🔍 [DEBUG] No valid session, redirecting to login');
      router.push('/admin/login');
      return;
    }
    
    setUser(userData);
    console.log('🔍 [DEBUG] Loading provinces and main hospitals...');
    loadProvinces();
    loadMainHospitals();
  }, [router]);

  // 🔍 DEBUG: โหลดจังหวัด
  const loadProvinces = async () => {
    console.log('🔍 [DEBUG] loadProvinces() called');
    try {
      setLoadingLocations(true);
      console.log('🔍 [DEBUG] Querying villages table for provinces...');
      
      const { data, error } = await supabase
        .from('villages')
        .select('province')
        .neq('province', null)
        .order('province', { ascending: true });

      console.log('🔍 [DEBUG] Query result:', { data, error });

      if (error) {
        console.error('❌ [DEBUG] Error loading provinces:', error);
        return;
      }

      const uniqueProvinces = [...new Set(data?.map(v => v.province) || [])];
      console.log('🔍 [DEBUG] Unique provinces:', uniqueProvinces);
      console.log('🔍 [DEBUG] Total provinces:', uniqueProvinces.length);
      
      setProvinces(uniqueProvinces);
      console.log('🔍 [DEBUG] Provinces state updated:', uniqueProvinces.length);
    } catch (error) {
      console.error('❌ [DEBUG] Exception in loadProvinces:', error);
    } finally {
      setLoadingLocations(false);
      console.log('🔍 [DEBUG] loadProvinces() completed');
    }
  };

  // 🔍 DEBUG: โหลดโรงพยาบาลแม่ข่าย
  const loadMainHospitals = async () => {
    console.log('🔍 [DEBUG] loadMainHospitals() called');
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .order('name');

      console.log('🔍 [DEBUG] Main hospitals result:', { data, error });

      if (error) throw error;
      setMainHospitals(data || []);
      console.log('🔍 [DEBUG] Main hospitals count:', data?.length || 0);
    } catch (error) {
      console.error('❌ [DEBUG] Error loading main hospitals:', error);
    }
  };

  // 🔍 DEBUG: เมื่อเลือกจังหวัด
  const handleProvinceChange = async (province: string) => {
    console.log('🔍 [DEBUG] handleProvinceChange() called with:', province);
    setFormData({ 
      ...formData, 
      province, 
      district: '', 
      subdistrict: '',
      postal_code: '' 
    });
    setDistricts([]);
    setSubdistricts([]);
    
    if (province) {
      try {
        setLoadingLocations(true);
        console.log('🔍 [DEBUG] Querying districts for province:', province);
        
        const { data, error } = await supabase
          .from('villages')
          .select('district')
          .eq('province', province)
          .neq('district', null)
          .order('district', { ascending: true });

        console.log('🔍 [DEBUG] Districts query result:', { data, error });

        if (error) throw error;

        const uniqueDistricts = [...new Set(data?.map(v => v.district) || [])];
        console.log('🔍 [DEBUG] Unique districts:', uniqueDistricts);
        console.log('🔍 [DEBUG] Total districts:', uniqueDistricts.length);
        
        setDistricts(uniqueDistricts);
      } catch (error) {
        console.error('❌ [DEBUG] Error loading districts:', error);
      } finally {
        setLoadingLocations(false);
      }
    }
  };

  // 🔍 DEBUG: เมื่อเลือกอำเภอ
  const handleDistrictChange = async (district: string) => {
    console.log('🔍 [DEBUG] handleDistrictChange() called with:', district);
    setFormData({ 
      ...formData, 
      district, 
      subdistrict: '',
      postal_code: '' 
    });
    setSubdistricts([]);
    
    if (district && formData.province) {
      try {
        setLoadingLocations(true);
        console.log('🔍 [DEBUG] Querying subdistricts for:', formData.province, district);
        
        const { data, error } = await supabase
          .from('villages')
          .select('subdistrict, postal_code')
          .eq('province', formData.province)
          .eq('district', district)
          .neq('subdistrict', null)
          .order('subdistrict', { ascending: true });

        console.log('🔍 [DEBUG] Subdistricts query result:', { data, error });

        if (error) throw error;

        const uniqueSubdistricts = [...new Set(data?.map(v => v.subdistrict) || [])];
        console.log('🔍 [DEBUG] Unique subdistricts:', uniqueSubdistricts);
        console.log('🔍 [DEBUG] Total subdistricts:', uniqueSubdistricts.length);
        
        setSubdistricts(uniqueSubdistricts);
      } catch (error) {
        console.error('❌ [DEBUG] Error loading subdistricts:', error);
      } finally {
        setLoadingLocations(false);
      }
    }
  };

  // 🔍 DEBUG: เมื่อเลือกตำบล
  const handleSubdistrictChange = async (subdistrict: string) => {
    console.log('🔍 [DEBUG] handleSubdistrictChange() called with:', subdistrict);
    let postalCode = '';
    
    if (subdistrict && formData.province && formData.district) {
      try {
        const { data, error } = await supabase
          .from('villages')
          .select('postal_code')
          .eq('province', formData.province)
          .eq('district', formData.district)
          .eq('subdistrict', subdistrict)
          .neq('postal_code', null)
          .limit(1)
          .single();

        console.log('🔍 [DEBUG] Postal code query result:', { data, error });

        if (!error && data) {
          postalCode = data.postal_code;
          console.log('🔍 [DEBUG] Postal code found:', postalCode);
        }
      } catch (error) {
        console.error('❌ [DEBUG] Error loading postal code:', error);
      }
    }

    setFormData({ 
      ...formData, 
      subdistrict,
      postal_code: postalCode 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔍 [DEBUG] Form submitted with data:', formData);
    setLoading(true);

    try {
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
          postal_code: formData.postal_code,
          phone: formData.phone,
          is_active: true,
        });

      if (error) throw error;

      alert('✅ เพิ่มโรงพยาบาลสำเร็จ!');
      router.push('/admin/hospitals');
    } catch (error: any) {
      console.error('❌ [DEBUG] Error saving hospital:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔍 DEBUG: ตรวจสอบ state ก่อน render
  console.log('🔍 [DEBUG] Render with state:', {
    provinces: provinces.length,
    districts: districts.length,
    subdistricts: subdistricts.length,
    formData,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/hospitals')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              🏥 เพิ่มโรงพยาบาลใหม่
            </h1>
            <p className="text-gray-600">กรอกข้อมูลโรงพยาบาลแม่ข่ายหรือลูกข่าย</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 space-y-6">
          
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
              onChange={(e) => setFormData({...formData, code: e.target.value})}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น PHETCHABUN"
            />
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
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ✅ จังหวัด */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              จังหวัด <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.province}
              onChange={(e) => handleProvinceChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">-- เลือกจังหวัด --</option>
              {provinces.length === 0 ? (
                <option disabled>⚠️ ไม่มีข้อมูลจังหวัด</option>
              ) : (
                provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))
              )}
            </select>
            {loadingLocations && (
              <p className="text-xs text-gray-500 mt-1">กำลังโหลดข้อมูล...</p>
            )}
            {/* 🔍 DEBUG: แสดงจำนวนจังหวัด */}
            <p className="text-xs text-gray-400 mt-1">
              🔍 พบ {provinces.length} จังหวัด
            </p>
          </div>

          {/* ✅ อำเภอ */}
          {formData.province && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อำเภอ <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.district}
                onChange={(e) => handleDistrictChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- เลือกอำเภอ --</option>
                {districts.length === 0 ? (
                  <option disabled>⚠️ ไม่มีข้อมูลอำเภอ</option>
                ) : (
                  districts.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))
                )}
              </select>
              {/* 🔍 DEBUG: แสดงจำนวนอำเภอ */}
              <p className="text-xs text-gray-400 mt-1">
                🔍 พบ {districts.length} อำเภอใน {formData.province}
              </p>
            </div>
          )}

          {/* ✅ ตำบล */}
          {formData.district && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ตำบล <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.subdistrict}
                onChange={(e) => handleSubdistrictChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- เลือกตำบล --</option>
                {subdistricts.length === 0 ? (
                  <option disabled>⚠️ ไม่มีข้อมูลตำบล</option>
                ) : (
                  subdistricts.map((subdistrict) => (
                    <option key={subdistrict} value={subdistrict}>
                      {subdistrict}
                    </option>
                  ))
                )}
              </select>
              {/* 🔍 DEBUG: แสดงจำนวนตำบล */}
              <p className="text-xs text-gray-400 mt-1">
                🔍 พบ {subdistricts.length} ตำบลใน {formData.district}
              </p>
            </div>
          )}

          {/* ✅ รหัสไปรษณีย์ (กรอกอัตโนมัติ) */}
          {formData.subdistrict && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสไปรษณีย์
              </label>
              <input
                type="text"
                value={formData.postal_code}
                onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น 67000"
              />
            </div>
          )}

          {/* เบอร์โทรศัพท์ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เบอร์โทรศัพท์
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="056-123456"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังบันทึก...' : 'สร้างโรงพยาบาล'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/hospitals')}
              className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}