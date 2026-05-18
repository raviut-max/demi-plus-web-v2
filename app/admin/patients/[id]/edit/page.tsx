// app/admin/patients/[id]/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, getPatientDetail, getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { 
  ArrowLeft, Save, AlertCircle, CheckCircle, MapPin, User, 
  ShieldCheck, Building2 
} from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  
  // State สำหรับที่อยู่
  const [addressData, setAddressData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  });

  // State สำหรับข้อมูลเดิม (ไว้แสดงเปรียบเทียบ)
  const [originalData, setOriginalData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
    id_card: '',
  });

  // State สำหรับฟอร์ม
  const [formData, setFormData] = useState({
    id_card: '',
    first_name: '',
    last_name: '',
    hospital_number: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    gender: '',
    phone: '',
    email: '',
    current_weight: '',
    height: '',
    waist_circumference: '',
    diabetes_type: '',
    blood_sugar: '',
    hba1c_level: '',
    notes: '',
    occupation: '',
    education_level: '',
    hospital_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    coach_id: '', // ID ของโค้ชที่เลือก
  });

  // State สำหรับ Dropdown โรงพยาบาลและโค้ช
  const [availableHospitals, setAvailableHospitals] = useState<any[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<any[]>([]);

  // ✅ 1. ตรวจสอบ Session และโหลดข้อมูล (ลบการตรวจสอบ Role)
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    // ✅ อนุญาตให้เข้าถึงได้โดยไม่ต้องตรวจสอบ Role (Admin, Doctor, Helper, OSM, etc.)
    setUser(userData);
    loadData(patientId, userData);
  }, [router, patientId]);

  const loadData = async (pid: string, currentUser: any) => {
    try {
      // โหลดข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(pid);
      if (patientData) {
        setPatient(patientData);
        setupFormData(patientData);
      }

      // โหลดข้อมูลโรงพยาบาลและโค้ชที่เกี่ยวข้อง
      if (currentUser) {
        await loadNetworkResources(currentUser);
      }
    } catch (error) {
      console.error('Error loading ', error);
    } finally {
      setLoading(false);
    }
  };

  const setupFormData = (data: any) => {
    let birthDay = '';
    let birthMonth = '';
    let birthYear = '';

    if (data.birth_date) {
      const birthDate = new Date(data.birth_date);
      birthDay = birthDate.getDate().toString();
      birthMonth = (birthDate.getMonth() + 1).toString();
      birthYear = (birthDate.getFullYear() + 543).toString();
    }

    setFormData({
      id_card: data.users?.id_card || '',
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      hospital_number: data.hospital_number || '',
      birth_day: birthDay,
      birth_month: birthMonth,
      birth_year: birthYear,
      gender: data.gender || '',
      phone: data.phone || '',
      email: data.email || '',
      current_weight: data.current_weight?.toString() || '',
      height: data.height?.toString() || '',
      waist_circumference: data.waist_circumference?.toString() || '',
      diabetes_type: data.diabetes_type || '',
      blood_sugar: data.blood_sugar?.toString() || '',
      hba1c_level: data.hba1c_level?.toString() || '',
      notes: data.notes || '',
      occupation: data.occupation || '',
      education_level: data.education_level || '',
      hospital_id: data.hospital_id || '',
      emergency_contact_name: data.emergency_contact_name || '',
      emergency_contact_phone: data.emergency_contact_phone || '',
      emergency_contact_relationship: data.emergency_contact_relationship || '',
      coach_id: data.coach_id || '',
    });

    setOriginalData({
      province: data.province || '',
      district: data.district || '',
      subdistrict: data.subdistrict || '',
      postalCode: data.postal_code || '',
      id_card: data.users?.id_card || '',
    });

    setAddressData({
      province: data.province || '',
      district: data.district || '',
      subdistrict: data.subdistrict || '',
      postalCode: data.postal_code || '',
    });
  };

  // ✅ 2. โหลดทรัพยากรเครือข่าย (โรงพยาบาลและโค้ช)
  const loadNetworkResources = async (currentUser: any) => {
    try {
      // ดึงโรงพยาบาลทั้งหมดเพื่อหาโครงสร้าง
      const { data: allHospitals } = await supabase
        .from('hospitals')
        .select('*')
        .order('name');

      if (!allHospitals || allHospitals.length === 0) return;

      const userHospital = allHospitals.find((h) => h.id === currentUser.hospital_id);
      if (!userHospital) return;

      let networkHospitalIds: string[] = [];
      let filteredHospitals: any[] = [];

      if (userHospital.type === 'main') {
        // ถ้าเป็นแม่ข่าย: แสดงตัวเอง + ลูกข่ายทั้งหมด
        filteredHospitals = allHospitals.filter(
          (h) => h.id === userHospital.id || h.parent_id === userHospital.id
        );
      } else {
        // ถ้าเป็นลูกข่าย: แสดงตัวเอง + แม่ข่าย
        const parentHospital = allHospitals.find((h) => h.id === userHospital.parent_id);
        filteredHospitals = [userHospital];
        if (parentHospital) {
          filteredHospitals.push(parentHospital);
          // Optionally: Include siblings? User instruction said "Main hospital and sub-hospitals of that network". 
          // Usually means just the direct parent connection for sub-hospital users.
        }
      }
      
      // เรียงลำดับโรงพยาบาล (แม่ข่ายขึ้นก่อน)
      filteredHospitals.sort((a, b) => (a.type === 'main' ? -1 : 1));
      
      setAvailableHospitals(filteredHospitals);
      networkHospitalIds = filteredHospitals.map(h => h.id);

      // ดึงรายชื่อโค้ช/บุคลากร ในโรงพยาบาลเครือข่าย
      const { data: coaches } = await supabase
        .from('profiles') // หรือตาราง staff ขึ้นอยู่กับโครงสร้างจริง
        .select(`
          id, 
          full_name_th, 
          role,
          hospitals (name)
        `)
        .in('hospital_id', networkHospitalIds)
        .eq('is_active', true) // สมมติว่ามี flag นี้
        .order('full_name_th');

      setAvailableCoaches(coaches || []);

    } catch (error) {
      console.error('Error loading network resources:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAddressChange = (data: any) => {
    setAddressData(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const updateData: any = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        hospital_number: formData.hospital_number,
        birth_date: birthDate,
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email,
        current_weight: formData.current_weight ? parseFloat(formData.current_weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
        diabetes_type: formData.diabetes_type,
        blood_sugar: formData.blood_sugar ? parseFloat(formData.blood_sugar) : null,
        hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : null,
        notes: formData.notes,
        occupation: formData.occupation,
        education_level: formData.education_level,
        hospital_id: formData.hospital_id || null,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        coach_id: formData.coach_id || null,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', patientId);

      if (profileError) throw profileError;

      // อัปเดต ID Card ในตาราง users ถ้ามีการเปลี่ยน
      if (formData.id_card !== originalData.id_card) {
        await supabase
          .from('users')
          .update({ id_card: formData.id_card })
          .eq('id', patientId);
      }

      alert('✅ บันทึกข้อมูลสำเร็จ!');
      router.push(`/admin/patients/${patientId}`);
    } catch (error: any) {
      console.error('Error updating patient:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          
          {/* ด้านซ้าย: ย้อนกลับและรายละเอียดผู้ป่วย */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}`)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">แก้ไขข้อมูลผู้ป่วย</h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>HN: {patient?.hospital_number}</span>
                  <span>•</span>
                  <span>{patient?.first_name} {patient?.last_name}</span>
                </div>
              </div>
            </div>

            {/* ด้านขวา: การ์ดผู้ใช้งาน */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-full">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{user?.full_name_th || 'ผู้ใช้งาน'}</p>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> {user?.role || 'staff'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {patient?.hospitals?.name || 'ไม่ระบุสังกัด'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" /> ข้อมูลส่วนตัว
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัตรประชาชน</label>
                <input
                  type="text"
                  name="id_card"
                  value={formData.id_card}
                  onChange={handleChange}
                  maxLength={13}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="กรอกเลขบัตรประชาชน 13 หลัก"
                />
                {originalData.id_card && formData.id_card !== originalData.id_card && (
                  <p className="text-xs text-orange-500 mt-1">เดิม: {originalData.id_card}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HN (เลขที่ผู้ป่วย)</label>
                <input
                  type="text"
                  name="hospital_number"
                  value={formData.hospital_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันเกิด</label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    name="birth_day"
                    value={formData.birth_day}
                    onChange={handleChange}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">วัน</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <select
                    name="birth_month"
                    value={formData.birth_month}
                    onChange={handleChange}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">เดือน</option>
                    {THAI_MONTHS.map((month, index) => (
                      <option key={index + 1} value={index + 1}>{month}</option>
                    ))}
                  </select>
                  <select
                    name="birth_year"
                    value={formData.birth_year}
                    onChange={handleChange}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">ปี พ.ศ.</option>
                    {Array.from({ length: 100 }, (_, i) => 2567 - i).map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เพศ</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อาชีพ</label>
                <input
                  type="text"
                  name="occupation"
                  value={formData.occupation}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระดับการศึกษา</label>
                <input
                  type="text"
                  name="education_level"
                  value={formData.education_level}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" /> ข้อมูลสุขภาพ
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนัก (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  name="current_weight"
                  value={formData.current_weight}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ส่วนสูง (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  name="waist_circumference"
                  value={formData.waist_circumference}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทเบาหวาน</label>
                <select
                  name="diabetes_type"
                  value={formData.diabetes_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกประเภท --</option>
                  <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>
                  <option value="เบาหวาน">เบาหวาน</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าน้ำตาล (mg/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  name="blood_sugar"
                  value={formData.blood_sugar}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่า HbA1c</label>
                <input
                  type="number"
                  step="0.1"
                  name="hba1c_level"
                  value={formData.hba1c_level}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* ที่อยู่และสังกัด */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-500" /> ที่อยู่อาศัยและสังกัด
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่</label>
                  <input
                    type="text"
                    name="house_number"
                    value={formData.house_number}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมู่ที่</label>
                  <input
                    type="text"
                    name="village_no"
                    value={formData.village_no}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่เพิ่มเติม</label>
                <input
                  type="text"
                  name="address_line1"
                  value={formData.address_line1}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <ThaiAddressSelector 
                onAddressChange={handleAddressChange} 
                initialData={{
                  province: addressData.province,
                  district: addressData.district,
                  subdistrict: addressData.subdistrict,
                  postal_code: addressData.postalCode,
                }} 
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">โรงพยาบาลสังกัด</label>
                  {/* ✅ 3. Dropdown โรงพยาบาล (แสดงเฉพาะเครือข่าย) */}
                  <select
                    name="hospital_id"
                    value={formData.hospital_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- เลือกโรงพยาบาล --</option>
                    {availableHospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ดูแล/โค้ช</label>
                  {/* ✅ 4. Dropdown โค้ช (แสดงบุคลากรในเครือข่าย) */}
                  <select
                    name="coach_id"
                    value={formData.coach_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- เลือกผู้ดูแล --</option>
                    {availableCoaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name_th} | {c.role} | {c.hospitals?.name || 'ไม่ระบุ'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ผู้ติดต่อฉุกเฉิน */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4">ผู้ติดต่อฉุกเฉิน</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">ความสัมพันธ์</label>
                <input
                  type="text"
                  name="emergency_contact_relationship"
                  value={formData.emergency_contact_relationship}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ปุ่มบันทึก */}
          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.push(`/admin/patients/${patientId}`)}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <span className="animate-spin">⏳</span> : <Save className="w-4 h-4" />}
              บันทึกข้อมูล
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}