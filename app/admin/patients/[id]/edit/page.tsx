// app/admin/patients/[id]/edit/page.tsx
// ✅ แก้ไขล่าสุด: 17 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ลบการตรวจสอบสิทธิ์ (Access Control) ให้ทุกคนใช้งานได้
//    2. เพิ่ม User Info Card ที่มุมขวาบน แสดงข้อมูลผู้ใช้งานและสังกัด
//    3. ปรับ Dropdown โรงพยาบาล: แสดงเฉพาะเครือข่าย (แม่ข่าย+ลูกข่าย) ของผู้ใช้งาน
//    4. เพิ่ม Dropdown เลือกโค้ช: ดึงรายชื่อจากโรงพยาบาลในเครือข่าย เรียงตามชื่อ
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail, getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { 
  ArrowLeft, LogOut, Save, AlertCircle, CheckCircle, MapPin, 
  User, Shield, UserCircle2, Stethoscope 
} from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// Interface สำหรับโรงพยาบาล
interface HospitalData {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

// Interface สำหรับโค้ช/บุคลากร
interface CoachData {
  id: string;
  full_name_th: string;
  hospital_id: string;
  hospitals?: { name: string } | null;
}

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  
  // ข้อมูลสำหรับ Dropdown
  const [networkHospitals, setNetworkHospitals] = useState<HospitalData[]>([]);
  const [networkCoaches, setNetworkCoaches] = useState<CoachData[]>([]);
  
  // ข้อมูลผู้ใช้สำหรับการแสดง Card
  const [userHospitalDetails, setUserHospitalDetails] = useState<any>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [validationSuccess, setValidationSuccess] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const [addressData, setAddressData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  });

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
    house_number: '',
    address_line1: '',
    soi: '',
    road: '',
    village_no: '',
    village_name: '',
    hospital_id: '',
    coach_id: '', // เพิ่มฟิลด์ coach_id
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
  });

  // ✅ โหลดข้อมูลเริ่มต้น
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    // ✅ ลบการตรวจสอบสิทธิ์: ให้ทุกคนใช้งานได้
    // if (!['admin', 'doctor', 'helper'].includes(userData.role)) { ... }

    setUser(userData);
    loadPatientData();
    loadNetworkResources(userData);
  }, [router]);

  // ✅ โหลดข้อมูลเครือข่าย (โรงพยาบาล + โค้ช)
  const loadNetworkResources = async (currentUser: any) => {
    try {
      // 1. ดึงข้อมูลโรงพยาบาลทั้งหมด
      const allHospitals = await getHospitalsWithHierarchy();
      
      // 2. หาโรงพยาบาลของผู้ใช้ปัจจุบัน (สมมติว่า user มี hospital_id)
      // หาก user ไม่มี hospital_id ใน session อาจต้อง fetch profile
      let userHospId = currentUser.hospital_id;
      
      let rootHospitalId = null;
      let filteredHospitals: HospitalData[] = [];

      if (userHospId) {
        const userHosp = allHospitals.find((h: any) => h.id === userHospId);
        
        if (userHosp) {
          // หา Root (แม่ข่าย) ของเครือข่ายนี้
          if (userHosp.type === 'main') {
            rootHospitalId = userHosp.id;
          } else if (userHosp.type === 'sub' && userHosp.parent_id) {
            rootHospitalId = userHosp.parent_id;
          }
        }

        // กรองเฉพาะโรงพยาบาลในเครือข่าย (แม่ข่าย + ลูกข่ายทั้งหมดในเครือนี้)
        if (rootHospitalId) {
          filteredHospitals = allHospitals.filter((h: any) => 
            h.id === rootHospitalId || h.parent_id === rootHospitalId
          );
          
          // เรียงลำดับ: แม่ข่ายก่อน แล้วตามด้วยลูกข่ายเรียงชื่อ
          filteredHospitals.sort((a, b) => {
            if (a.type === 'main' && b.type === 'sub') return -1;
            if (a.type === 'sub' && b.type === 'main') return 1;
            return a.name.localeCompare(b.name);
          });

          // เก็บข้อมูลโรงพยาบาลของผู้ใช้เพื่อแสดงใน Card
          setUserHospitalDetails(userHosp);
        }
      } else {
        // ถ้าไม่ทราบสังกัด ให้แสดงทั้งหมด (Fallback)
        filteredHospitals = allHospitals;
      }

      setNetworkHospitals(filteredHospitals);

      // 3. ดึงรายชื่อโค้ช/บุคลากร จากโรงพยาบาลในเครือข่าย
      const hospitalIds = filteredHospitals.map(h => h.id);
      
      const { data: coachesData } = await supabase
        .from('doctors') // สมมติตารางชื่อ doctors หรือ profiles ที่มี role
        .select(`
          id,
          full_name_th,
          hospital_id,
          hospitals (name)
        `)
        .in('hospital_id', hospitalIds)
        .order('full_name_th', { ascending: true });

      if (coachesData) {
        setNetworkCoaches(coachesData);
      }

    } catch (error) {
      console.error('Error loading network resources:', error);
    }
  };

  const loadPatientData = async () => {
    try {
      const data = await getPatientDetail(patientId);
      if (data) {
        setPatient(data);
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
          house_number: data.house_number || '',
          address_line1: data.address_line1 || '',
          soi: data.soi || '',
          road: data.road || '',
          village_no: data.village_no || '',
          village_name: data.village_name || '',
          hospital_id: data.hospital_id || '',
          coach_id: data.coach_id || '', // โหลด coach_id
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          emergency_contact_relationship: data.emergency_contact_relationship || '',
        });

        setAddressData({
          province: data.province || '',
          district: data.district || '',
          subdistrict: data.subdistrict || '',
          postalCode: data.postal_code || '',
        });
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressChange = (data: { province: string; district: string; subdistrict: string; postalCode: string; }) => {
    setAddressData(data);
  };

  // ฟังก์ชันตรวจสอบความถูกต้องของฟอร์ม
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.hospital_number) errors.hospital_number = 'กรุณากรอก HN';
    if (!formData.first_name) errors.first_name = 'กรุณากรอกชื่อ';
    if (!formData.last_name) errors.last_name = 'กรุณากรอกนามสกุล';
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setError('');

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
        house_number: formData.house_number,
        address_line1: formData.address_line1,
        soi: formData.soi,
        road: formData.road,
        village_no: formData.village_no,
        village_name: formData.village_name,
        subdistrict: addressData.subdistrict,
        district: addressData.district,
        province: addressData.province,
        postal_code: addressData.postalCode,
        hospital_id: formData.hospital_id || null,
        coach_id: formData.coach_id || null, // บันทึก coach_id
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', patientId);

      if (profileError) throw profileError;

      alert('✅ บันทึกข้อมูลสำเร็จ!');
      router.push(`/admin/patients/${patientId}`);
    } catch (err: any) {
      setError('เกิดข้อผิดพลาด: ' + err.message);
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
      {/* ✅ ส่วนหัว: ซ้าย (ย้อนกลับ+ชื่อเพจ) | ขวา (การ์ดผู้ใช้งาน) */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            {/* ด้านซ้าย: ปุ่มย้อนกลับ และ ข้อมูลหน้าเพจ */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">แก้ไขข้อมูลผู้ป่วย</h1>
                <p className="text-sm text-gray-500">
                  {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number}
                </p>
              </div>
            </div>

            {/* ด้านขวา: การ์ดแสดงรายละเอียดผู้ใช้งาน */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center gap-3 shadow-sm min-w-[250px]">
              <div className="bg-blue-100 p-2 rounded-full">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {user?.full_name_th || 'ผู้ใช้งาน'}
                  </p>
                  <Shield className="w-4 h-4 text-green-500" />
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="font-medium">สังกัด:</span>
                  <span className="truncate">
                    {userHospitalDetails?.name || 'ไม่ระบุ'}
                  </span>
                </div>
                {userHospitalDetails?.type && (
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {userHospitalDetails.type === 'main' ? '(แม่ข่าย)' : '(ลูกข่าย)'}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" /> ข้อมูลส่วนตัว
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HN</label>
                <input
                  type="text"
                  value={formData.hospital_number}
                  onChange={(e) => setFormData({...formData, hospital_number: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-lg ${validationErrors.hospital_number ? 'border-red-500' : 'border-gray-300'}`}
                />
                {validationErrors.hospital_number && <p className="text-xs text-red-500 mt-1">{validationErrors.hospital_number}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัตรประชาชน</label>
                <input
                  type="text"
                  value={formData.id_card}
                  onChange={(e) => setFormData({...formData, id_card: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-lg ${validationErrors.first_name ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-lg ${validationErrors.last_name ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันเกิด</label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={formData.birth_day}
                    onChange={(e) => setFormData({...formData, birth_day: e.target.value})}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">วัน</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    value={formData.birth_month}
                    onChange={(e) => setFormData({...formData, birth_month: e.target.value})}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">เดือน</option>
                    {THAI_MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={formData.birth_year}
                    onChange={(e) => setFormData({...formData, birth_year: e.target.value})}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">ปี พ.ศ.</option>
                    {Array.from({ length: 100 }, (_, i) => 2567 - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เพศ</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" /> ข้อมูลสุขภาพ
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนัก (kg)</label>
                <input
                  type="number"
                  value={formData.current_weight}
                  onChange={(e) => setFormData({...formData, current_weight: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ส่วนสูง (cm)</label>
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData({...formData, height: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (cm)</label>
                <input
                  type="number"
                  value={formData.waist_circumference}
                  onChange={(e) => setFormData({...formData, waist_circumference: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าน้ำตาล (mg/dL)</label>
                <input
                  type="number"
                  value={formData.blood_sugar}
                  onChange={(e) => setFormData({...formData, blood_sugar: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HbA1c</label>
                <input
                  type="number"
                  value={formData.hba1c_level}
                  onChange={(e) => setFormData({...formData, hba1c_level: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทเบาหวาน</label>
                <select
                  value={formData.diabetes_type}
                  onChange={(e) => setFormData({...formData, diabetes_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือก --</option>
                  <option value="type1">Type 1</option>
                  <option value="type2">Type 2</option>
                  <option value="gestational">Gestational</option>
                </select>
              </div>
            </div>
          </div>

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-500" /> ที่อยู่
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่</label>
                <input
                  type="text"
                  value={formData.house_number}
                  onChange={(e) => setFormData({...formData, house_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมู่ที่</label>
                <input
                  type="text"
                  value={formData.village_no}
                  onChange={(e) => setFormData({...formData, village_no: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่เพิ่มเติม</label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <ThaiAddressSelector onAddressChange={handleAddressChange} initialData={addressData} />
          </div>

          {/* สังกัดและโค้ช */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Hospital className="w-5 h-5 text-purple-500" /> สังกัดและโค้ชดูแล
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ✅ Dropdown โรงพยาบาล: แสดงเฉพาะเครือข่าย */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โรงพยาบาลสังกัด</label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => setFormData({...formData, hospital_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>
                  {networkHospitals.map((hosp) => (
                    <option key={hosp.id} value={hosp.id}>
                      {hosp.name} ({hosp.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">แสดงเฉพาะโรงพยาบาลในเครือข่ายของคุณ</p>
              </div>

              {/* ✅ Dropdown โค้ช: แสดงจากโรงพยาบาลในเครือข่าย */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โค้ช/ผู้ดูแล</label>
                <select
                  value={formData.coach_id}
                  onChange={(e) => setFormData({...formData, coach_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกโค้ช --</option>
                  {networkCoaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.full_name_th} | {coach.hospitals?.name || 'ไม่ระบุรพ.'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">รายชื่อจากโรงพยาบาลในเครือข่าย</p>
              </div>
            </div>
          </div>

          {/* ปุ่มบันทึก */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  บันทึกข้อมูล
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}