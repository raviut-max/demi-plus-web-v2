// components/HospitalAddressSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

// ✅ Interfaces สำหรับ Province, District, Subdistrict
interface Province {
  id: string;
  name_th: string;
  name_en: string;
}

interface District {
  id: string;
  province_id: string;
  name_th: string;
  name_en: string;
  zipcode: string;
}

interface Subdistrict {
  id: string;
  district_id: string;
  name_th: string;
  name_en: string;
  zipcode: string;
}

// ✅ Props Interface - แก้ไขตรงนี้!
interface HospitalAddressSelectorProps {
  onAddressChange?: (data: {
    province: string;
    district: string;
    subdistrict: string;
    postalCode: string;
  }) => void;
}

export default function HospitalAddressSelector({ onAddressChange }: HospitalAddressSelectorProps) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [subdistricts, setSubdistricts] = useState<Subdistrict[]>([]);
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [loadingProvince, setLoadingProvince] = useState(false);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [loadingSubdistrict, setLoadingSubdistrict] = useState(false);

  // ✅ โหลดจังหวัดเมื่อ component mount
  useEffect(() => {
    loadProvinces();
  }, []);

  // ✅ แจ้งเตือนเมื่อที่อยู่เปลี่ยน
  useEffect(() => {
    if (onAddressChange) {
      const provinceData = provinces.find(p => p.name_th === selectedProvince);
      const districtData = districts.find(d => d.name_th === selectedDistrict);
      const subdistrictData = subdistricts.find(s => s.name_th === selectedSubdistrict);

      onAddressChange({
        province: provinceData?.name_th || selectedProvince,
        district: districtData?.name_th || selectedDistrict,
        subdistrict: subdistrictData?.name_th || selectedSubdistrict,
        postalCode: subdistrictData?.zipcode || postalCode,
      });
    }
  }, [selectedProvince, selectedDistrict, selectedSubdistrict, postalCode, provinces, districts, subdistricts, onAddressChange]);

  // ✅ โหลดอำเภอเมื่อเลือกจังหวัด
  useEffect(() => {
    if (selectedProvince) {
      const province = provinces.find(p => p.name_th === selectedProvince);
      if (province) {
        loadDistricts(province.id);
      }
    } else {
      setDistricts([]);
      setSelectedDistrict('');
      setSubdistricts([]);
      setSelectedSubdistrict('');
      setPostalCode('');
    }
  }, [selectedProvince, provinces]);

  // ✅ โหลดตำบลเมื่อเลือกอำเภอ
  useEffect(() => {
    if (selectedDistrict) {
      const district = districts.find(d => d.name_th === selectedDistrict);
      if (district) {
        loadSubdistricts(district.id);
      }
    } else {
      setSubdistricts([]);
      setSelectedSubdistrict('');
      setPostalCode('');
    }
  }, [selectedDistrict, districts]);

  // ✅ โหลดจังหวัด
  const loadProvinces = async () => {
    setLoadingProvince(true);
    try {
      const { data, error } = await supabase
        .from('provinces')
        .select('*')
        .order('name_th', { ascending: true });

      if (error) throw error;
      setProvinces(data || []);
    } catch (error) {
      console.error('Error loading provinces:', error);
    } finally {
      setLoadingProvince(false);
    }
  };

  // ✅ โหลดอำเภอ
  const loadDistricts = async (provinceId: string) => {
    setLoadingDistrict(true);
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('*')
        .eq('province_id', provinceId)
        .order('name_th', { ascending: true });

      if (error) throw error;
      setDistricts(data || []);
    } catch (error) {
      console.error('Error loading districts:', error);
    } finally {
      setLoadingDistrict(false);
    }
  };

  // ✅ โหลดตำบล
  const loadSubdistricts = async (districtId: string) => {
    setLoadingSubdistrict(true);
    try {
      const { data, error } = await supabase
        .from('subdistricts')
        .select('*')
        .eq('district_id', districtId)
        .order('name_th', { ascending: true });

      if (error) throw error;
      setSubdistricts(data || []);
    } catch (error) {
      console.error('Error loading subdistricts:', error);
    } finally {
      setLoadingSubdistrict(false);
    }
  };

  // ✅ จัดการเมื่อเลือกตำบล
  const handleSubdistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subdistrictName = e.target.value;
    setSelectedSubdistrict(subdistrictName);
    
    const subdistrict = subdistricts.find(s => s.name_th === subdistrictName);
    if (subdistrict) {
      setPostalCode(subdistrict.zipcode);
    }
  };

  return (
    <div className="space-y-3">
      {/* ✅ บรรทัดที่ 1: จังหวัด + อำเภอ/เขต (2 คอลัมน์) */}
      <div className="grid grid-cols-2 gap-4">
        {/* จังหวัด */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            จังหวัด <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loadingProvince}
            required
          >
            <option value="">-- เลือกจังหวัด --</option>
            {provinces.map((province) => (
              <option key={province.id} value={province.name_th}>
                {province.name_th}
              </option>
            ))}
          </select>
          {loadingProvince && <p className="text-xs text-gray-500 mt-1">กำลังโหลด...</p>}
        </div>

        {/* อำเภอ/เขต */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อำเภอ/เขต <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!selectedProvince || loadingDistrict}
            required
          >
            <option value="">-- เลือกอำเภอ/เขต --</option>
            {districts.map((district) => (
              <option key={district.id} value={district.name_th}>
                {district.name_th}
              </option>
            ))}
          </select>
          {loadingDistrict && <p className="text-xs text-gray-500 mt-1">กำลังโหลด...</p>}
          {!selectedProvince && <p className="text-xs text-gray-400 mt-1">กรุณาเลือกจังหวัดก่อน</p>}
        </div>
      </div>

      {/* ✅ บรรทัดที่ 2: ตำบล + รหัสไปรษณีย์ (2 คอลัมน์) */}
      <div className="grid grid-cols-2 gap-4">
        {/* ตำบล */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ตำบล/แขวง <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedSubdistrict}
            onChange={handleSubdistrictChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!selectedDistrict || loadingSubdistrict}
            required
          >
            <option value="">-- เลือกตำบล --</option>
            {subdistricts.map((subdistrict) => (
              <option key={subdistrict.id} value={subdistrict.name_th}>
                {subdistrict.name_th}
              </option>
            ))}
          </select>
          {loadingSubdistrict && <p className="text-xs text-gray-500 mt-1">กำลังโหลด...</p>}
          {!selectedDistrict && <p className="text-xs text-gray-400 mt-1">กรุณาเลือกอำเภอก่อน</p>}
        </div>

        {/* รหัสไปรษณีย์ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสไปรษณีย์
          </label>
          <input
            type="text"
            value={postalCode}
            readOnly
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            placeholder="รหัสไปรษณีย์จะปรากฏอัตโนมัติ"
          />
          <p className="text-xs text-gray-500 mt-1">อัตโนมัติเมื่อเลือกตำบล</p>
        </div>
      </div>
    </div>
  );
}