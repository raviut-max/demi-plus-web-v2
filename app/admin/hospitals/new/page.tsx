// app/admin/hospitals/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { ArrowLeft, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ✅ รายการจังหวัดไทยทั้งหมด (ใช้เป็น fallback)
const THAI_PROVINCES = [
  'กระบี่', 'กรุงเทพมหานคร', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น',
  'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร',
  'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี',
  'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พังงา', 'พัทลุง', 'พิจิตร',
  'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'พะเยา', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด',
  'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน',
  'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย',
  'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง',
  'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี', 'อำนาจเจริญ'
];

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

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadProvinces();
    loadMainHospitals();
  }, [router]);

  // ✅ โหลดรายการจังหวัด - ดึงจาก villages หรือใช้รายการ default
  const loadProvinces = async () => {
    try {
      setLoadingLocations(true);
      console.log('[DEBUG] Loading provinces...');
      
      // พยายามดึงจาก villages table ก่อน
      const { data, error } = await supabase
        .from('villages')
        .select('province')
        .neq('province', null)
        .order('province', { ascending: true });

      console.log('[DEBUG] Villages query result:', { data, error });

      if (error) {
        console.error('Error loading from villages:', error);
      }

      // ดึง province ที่ไม่ซ้ำกัน
      const uniqueProvinces = [...new Set(data?.map(v => v.province).filter(Boolean) || [])];
      
      console.log('[DEBUG] Unique provinces from villages:', uniqueProvinces);

      // ✅ ถ้าไม่มีข้อมูลใน villages ให้ใช้รายการจังหวัดไทยทั้งหมด
      const finalProvinces = uniqueProvinces.length > 0 ? uniqueProvinces : THAI_PROVINCES;
      
      console.log('[DEBUG] Final provinces:', finalProvinces.length);
      setProvinces(finalProvinces);
    } catch (error) {
      console.error('Error loading provinces:', error);
      // ✅ Fallback: ใช้รายการจังหวัดไทยทั้งหมด
      setProvinces(THAI_PROVINCES);
    } finally {
      setLoadingLocations(false);
    }
  };

  // ✅ โหลดโรงพยาบาลแม่ข่ายสำหรับ dropdown
  const loadMainHospitals = async () => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setMainHospitals(data || []);
      console.log('[DEBUG] Main hospitals loaded:', data?.length || 0);
    } catch (error) {
      console.error('Error loading main hospitals:', error);
    }
  };

  // ✅ เมื่อเลือกจังหวัด → โหลดอำเภอจาก villages
  const handleProvinceChange = async (province: string) => {
    console.log('[DEBUG] Province changed to:', province);
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
        const { data, error } = await supabase
          .from('villages')
          .select('district')
          .eq('province', province)
          .neq('district', null)
          .order('district', { ascending: true });

        console.log('[DEBUG] Districts query result:', { data, error });

        if (error) throw error;

        const uniqueDistricts = [...new Set(data?.map(v => v.district).filter(Boolean) || [])];
        console.log('[DEBUG] Unique districts:', uniqueDistricts);
        
        setDistricts(uniqueDistricts);
      } catch (error) {
        console.error('Error loading districts:', error);
      } finally {
        setLoadingLocations(false);
      }
    }
  };

  // ✅ เมื่อเลือกอำเภอ → โหลดตำบลจาก villages
  const handleDistrictChange = async (district: string) => {
    console.log('[DEBUG] District changed to:', district);
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
        const { data, error } = await supabase
          .from('villages')
          .select('subdistrict, postal_code')
          .eq('province', formData.province)
          .eq('district', district)
          .neq('subdistrict', null)
          .order('subdistrict', { ascending: true });

        console.log('[DEBUG] Subdistricts query result:', { data, error });

        if (error) throw error;

        const uniqueSubdistricts = [...new Set(data?.map(v => v.subdistrict).filter(Boolean) || [])];
        console.log('[DEBUG] Unique subdistricts:', uniqueSubdistricts);
        
        setSubdistricts(uniqueSubdistricts);
      } catch (error) {
        console.error('Error loading subdistricts:', error);
      } finally {
        setLoadingLocations(false);
      }
    }
  };

  // ✅ เมื่อเลือกตำบล → กรอกรหัสไปรษณีย์อัตโนมัติ
  const handleSubdistrictChange = async (subdistrict: string) => {
    console.log('[DEBUG] Subdistrict changed to:', subdistrict);
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

        console.log('[DEBUG] Postal code query result:', { data, error });

        if (!error && data) {
          postalCode = data.postal_code;
          console.log('[DEBUG] Postal code found:', postalCode);
        }
      } catch (error) {
        console.error('Error loading postal code:', error);
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
    console.log('[DEBUG] Form submitted with data:', formData);
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
      console.error('[DEBUG] Error saving hospital:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ DEBUG: แสดง state
  console.log('[DEBUG] Render with state:', {
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

          {/* ✅ จังหวัด - ดึงจาก villages หรือใช้ default */}
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
              {provinces.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
            {loadingLocations && (
              <p className="text-xs text-gray-500 mt-1">กำลังโหลดข้อมูล...</p>
            )}
            {/* ✅ DEBUG: แสดงจำนวนจังหวัด */}
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
                {districts.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
              {/* ✅ DEBUG: แสดงจำนวนอำเภอ */}
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
                {subdistricts.map((subdistrict) => (
                  <option key={subdistrict} value={subdistrict}>
                    {subdistrict}
                  </option>
                ))}
              </select>
              {/* ✅ DEBUG: แสดงจำนวนตำบล */}
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