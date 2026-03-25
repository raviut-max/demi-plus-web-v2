// app/admin/address-migration/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Search, User, MapPin, Save, CheckCircle, AlertCircle } from 'lucide-react';

interface Patient {
  id: string;
  full_name: string;
  hospital_number: string;
  pam_level: string;
  phone?: string;
  address_line1?: string;
  district?: string;
  province?: string;
  postal_code?: string;
  house_number?: string;
  soi?: string;
  road?: string;
  village_no?: string;
  village_name?: string;
  subdistrict?: string;
}

export default function AddressMigrationPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Search States
  const [searchHN, setSearchHN] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Selected Patient
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [addressData, setAddressData] = useState({
    house_number: '',
    soi: '',
    road: '',
    village_no: '',
    village_name: '',
    subdistrict: '',
    district: '',
    province: '',
    postal_code: '',
  });
  
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadPatients();
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchHN = (value: string) => {
    setSearchHN(value);
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }
    const filtered = patients.filter(patient => 
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase()) ||
      patient.full_name?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  const handleSearchName = (value: string) => {
    setSearchName(value);
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }
    const filtered = patients.filter(patient => 
      patient.full_name?.toLowerCase().includes(value.toLowerCase()) ||
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  const handleSelectPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchHN('');
    setSearchName('');
    setShowSearchDropdown(false);
    setFilteredPatients([]);
    
    // โหลดข้อมูลที่อยู่
    await loadPatientAddress(patient.id);
  };

  const loadPatientAddress = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('house_number, soi, road, village_no, village_name, subdistrict, district, province, postal_code, address_line1')
        .eq('id', patientId)
        .single();

      if (error) {
        console.error('Error loading address:', error);
        return;
      }

      setAddressData({
        house_number: data?.house_number || '',
        soi: data?.soi || '',
        road: data?.road || '',
        village_no: data?.village_no || '',
        village_name: data?.village_name || '',
        subdistrict: data?.subdistrict || '',
        district: data?.district || '',
        province: data?.province || '',
        postal_code: data?.postal_code || '',
      });
    } catch (error) {
      console.error('Load address error:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddressData({
      ...addressData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    if (!selectedPatient) {
      setMessage({ type: 'error', text: 'กรุณาเลือกผู้ป่วย' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...addressData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPatient.id);

      if (error) {
        throw error;
      }

      setMessage({ type: 'success', text: 'บันทึกที่อยู่สำเร็จ' });
      
      // รีโหลดข้อมูล
      await loadPatientAddress(selectedPatient.id);
    } catch (error: any) {
      setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">ตรวจสอบและแก้ไขที่อยู่</h1>
          <p className="text-gray-600">ตรวจสอบการย้ายข้อมูลที่อยู่จาก address_line1 ไปยังฟิลด์แยกส่วน</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        
        {/* Search Patient */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            ค้นหาผู้ป่วย
          </h2>

          {/* Search by HN */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              🔍 ค้นหาด้วย HN (Hospital Number)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchHN}
                onChange={(e) => handleSearchHN(e.target.value)}
                placeholder="พิมพ์ HN เพื่อค้นหา..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Search by Name */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              👤 ค้นหาด้วยชื่อผู้ป่วย
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchName}
                onChange={(e) => handleSearchName(e.target.value)}
                placeholder="พิมพ์ชื่อผู้ป่วยเพื่อค้นหา..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Search Results */}
          {showSearchDropdown && filteredPatients.length > 0 && (
            <div className="mb-4 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {patient.hospital_number} - {patient.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        PAM: {patient.pam_level} | {patient.phone || 'ไม่มีเบอร์โทร'}
                      </p>
                    </div>
                    <div className="text-sm text-blue-600 font-medium">คลิกเลือก</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Dropdown */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              หรือเลือกจากรายการทั้งหมด
            </label>
            <select
              onChange={(e) => {
                const patient = patients.find(p => p.id === e.target.value);
                if (patient) handleSelectPatient(patient);
              }}
              value={selectedPatient?.id || ''}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.hospital_number} - {patient.full_name} (PAM: {patient.pam_level})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-xl p-4 flex items-center gap-2 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <span className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
              {message.text}
            </span>
          </div>
        )}

        {/* Address Form */}
        {selectedPatient && (
          <>
            {/* Patient Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-900">{selectedPatient.full_name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                    <div>
                      <p className="text-xs text-blue-600">HN</p>
                      <p className="text-sm font-semibold text-blue-900">{selectedPatient.hospital_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">PAM Level</p>
                      <p className="text-sm font-semibold text-blue-900">{selectedPatient.pam_level}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">เบอร์โทร</p>
                      <p className="text-sm font-semibold text-blue-900">{selectedPatient.phone || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Old Address Display */}
            {selectedPatient.address_line1 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  ที่อยู่เดิม (address_line1)
                </h3>
                <p className="text-sm text-yellow-800">{selectedPatient.address_line1}</p>
                <p className="text-xs text-yellow-600 mt-2">
                  💡 ข้อมูลนี้จะถูกเก็บไว้สำหรับอ้างอิง แต่ไม่ใช้ในการแสดงผลใหม่
                </p>
              </div>
            )}

            {/* New Address Form */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-pink-600" />
                แก้ไขที่อยู่ (ฟิลด์แยกส่วน)
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* เลขที่ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เลขที่
                  </label>
                  <input
                    type="text"
                    name="house_number"
                    value={addressData.house_number}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="123"
                  />
                </div>

                {/* หมู่ที่/ชุมชน */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมู่ที่/ชุมชน
                  </label>
                  <input
                    type="text"
                    name="village_no"
                    value={addressData.village_no}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="หมู่ 5"
                  />
                </div>

                {/* หมู่บ้าน */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมู่บ้าน
                  </label>
                  <input
                    type="text"
                    name="village_name"
                    value={addressData.village_name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="หมู่บ้านสุขใจ"
                  />
                </div>

                {/* ซอย */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ซอย
                  </label>
                  <input
                    type="text"
                    name="soi"
                    value={addressData.soi}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="ซอย 5"
                  />
                </div>

                {/* ถนน */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ถนน
                  </label>
                  <input
                    type="text"
                    name="road"
                    value={addressData.road}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="ถนนสุขุมวิท"
                  />
                </div>

                {/* ตำบล */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ตำบล
                  </label>
                  <input
                    type="text"
                    name="subdistrict"
                    value={addressData.subdistrict}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="ตำบลคลองเตย"
                  />
                </div>

                {/* อำเภอ/เขต */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อำเภอ/เขต
                  </label>
                  <input
                    type="text"
                    name="district"
                    value={addressData.district}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="เขตคลองเตย"
                  />
                </div>

                {/* จังหวัด */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จังหวัด
                  </label>
                  <input
                    type="text"
                    name="province"
                    value={addressData.province}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="กรุงเทพมหานคร"
                  />
                </div>

                {/* รหัสไปรษณีย์ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสไปรษณีย์
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={addressData.postal_code}
                    onChange={handleChange}
                    maxLength={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="10100"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold py-4 rounded-xl hover:from-pink-600 hover:to-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      บันทึกที่อยู่
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Preview Full Address */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-green-900 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                ตัวอย่างที่อยู่เต็มรูปแบบ
              </h3>
              <p className="text-sm text-green-800">
                {[
                  addressData.house_number,
                  addressData.village_no ? `หมู่ ${addressData.village_no}` : '',
                  addressData.village_name,
                  addressData.soi,
                  addressData.road,
                  addressData.subdistrict,
                  addressData.district,
                  addressData.province,
                  addressData.postal_code,
                ].filter(Boolean).join(' ') || 'ยังไม่มีข้อมูล'}
              </p>
            </div>
          </>
        )}

        {!selectedPatient && (
          <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-200 text-center">
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">เลือกผู้ป่วยเพื่อแก้ไขที่อยู่</h3>
            <p className="text-gray-600">ค้นหาและเลือกผู้ป่วยจากช่องค้นหาข้างต้น</p>
          </div>
        )}
      </div>
    </div>
  );
}