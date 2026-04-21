// components/HospitalAddressSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

interface HospitalAddressSelectorProps {
  onAddressChange: (data: {
    province: string;
    district: string;
    subdistrict: string;
  }) => void;
}

export default function HospitalAddressSelector({ onAddressChange }: HospitalAddressSelectorProps) {
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [subdistricts, setSubdistricts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState('');

  // ✅ โหลดรายการจังหวัดทั้งหมด
  useEffect(() => {
    loadProvinces();
  }, []);

  const loadProvinces = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('villages')
        .select('province')
        .neq('province', null)
        .order('province', { ascending: true });

      if (error) throw error;

      const uniqueProvinces = [...new Set(data?.map(v => v.province) || [])];
      setProvinces(uniqueProvinces);
    } catch (error) {
      console.error('Error loading provinces:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ เมื่อเลือกจังหวัด → โหลดอำเภอ
  useEffect(() => {
    if (selectedProvince) {
      loadDistricts();
    } else {
      setDistricts([]);
      setSubdistricts([]);
      setSelectedDistrict('');
      setSelectedSubdistrict('');
    }
  }, [selectedProvince]);

  const loadDistricts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('villages')
        .select('district')
        .eq('province', selectedProvince)
        .neq('district', null)
        .order('district', { ascending: true });

      if (error) throw error;

      const uniqueDistricts = [...new Set(data?.map(v => v.district) || [])];
      setDistricts(uniqueDistricts);
    } catch (error) {
      console.error('Error loading districts:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ เมื่อเลือกอำเภอ → โหลดตำบล
  useEffect(() => {
    if (selectedDistrict && selectedProvince) {
      loadSubdistricts();
    } else {
      setSubdistricts([]);
      setSelectedSubdistrict('');
    }
  }, [selectedDistrict, selectedProvince]);

  const loadSubdistricts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('villages')
        .select('subdistrict')
        .eq('province', selectedProvince)
        .eq('district', selectedDistrict)
        .neq('subdistrict', null)
        .order('subdistrict', { ascending: true });

      if (error) throw error;

      const uniqueSubdistricts = [...new Set(data?.map(v => v.subdistrict) || [])];
      setSubdistricts(uniqueSubdistricts);
    } catch (error) {
      console.error('Error loading subdistricts:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ แจ้งเตือนเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    onAddressChange({
      province: selectedProvince,
      district: selectedDistrict,
      subdistrict: selectedSubdistrict,
    });
  }, [selectedProvince, selectedDistrict, selectedSubdistrict, onAddressChange]);

  return (
    <div className="space-y-3">
      {/* จังหวัด */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          จังหวัด <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedProvince}
          onChange={(e) => setSelectedProvince(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        >
          <option value="">-- เลือกจังหวัด --</option>
          {provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
      </div>

      {/* อำเภอ */}
      {selectedProvince && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อำเภอ/เขต <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

      {/* ตำบล */}
      {selectedDistrict && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ตำบล/แขวง <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedSubdistrict}
            onChange={(e) => setSelectedSubdistrict(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">-- เลือกตำบล --</option>
            {subdistricts.map((subdistrict) => (
              <option key={subdistrict} value={subdistrict}>
                {subdistrict}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-500">กำลังโหลดข้อมูล...</p>
      )}
    </div>
  );
}