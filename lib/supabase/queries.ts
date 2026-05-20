// lib/supabase/queries.ts
// ✅ แก้ไขล่าสุด: 18 พฤษภาคม 2569
// ✅ แก้ไขปัญหา: เพิ่มเงื่อนไขตรวจสอบ role 'admin' ในฟังก์ชัน addStaff เพื่อให้บันทึกชื่อลงตาราง doctors ได้ถูกต้อง
import { supabase } from './client';

// =====================================================
// 🔐 Authentication Functions
// =====================================================
export async function login(idCard: string, password: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, id_card, password_hash, role, admin_type, is_active, hospital_id')
      .eq('id_card', idCard)
      .eq('password_hash', password)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    let full_name_th = 'ผู้ใช้';
    let hospital_number = '';
    let pam_level = 'L2';
    let zone = 'Green Zone';
    let current_step = 'Starter';

    // ✅ เพิ่ม 'osm' และ 'admin' ในการตรวจสอบดึงข้อมูลชื่อ
    if (['admin', 'doctor', 'helper', 'osm'].includes(data.role)) {
      const { data: doctor } = await supabase
        .from('doctors')
        .select('full_name_th, specialization_th')
        .eq('user_id', data.id)
        .single();

      full_name_th = doctor?.full_name_th || 'ผู้ดูแลระบบ';
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, hospital_number, pam_level, pam_score, zone, current_step')
        .eq('id', data.id)
        .single();

      full_name_th = profile?.first_name && profile?.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : 'ผู้ใช้';
      hospital_number = profile?.hospital_number || '';
      pam_level = profile?.pam_level || 'L2';
      zone = profile?.zone || 'Green Zone';
      current_step = profile?.current_step || 'Starter';
    }

    return {
      id: data.id,
      id_card: data.id_card,
      full_name_th: full_name_th,
      hospital_number: hospital_number,
      pam_level: pam_level,
      pam_score: 0,
      zone: zone,
      current_step: current_step,
      role: data.role,
      admin_type: data.admin_type || 'hospital',
      hospital_id: data.hospital_id,
    };
  } catch (err) {
    console.error('Login error:', err);
    return null;
  }
}

export async function logout() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_data');
  localStorage.removeItem('login_time');
}

export function checkSession() {
  const userId = localStorage.getItem('user_id');
  const userData = localStorage.getItem('user_data');
  const loginTime = localStorage.getItem('login_time');

  if (!userId || !userData) {
    return null;
  }

  if (loginTime) {
    const loginDate = new Date(loginTime);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      logout();
      return null;
    }
  }

  return JSON.parse(userData);
}

// =====================================================
// 👤 Super Admin System Functions (ใหม่)
// =====================================================

/**
ตรวจสอบว่าเป็น Super Admin หรือไม่
Super Admin = admin_type = 'super' หรือ role = 'super_admin'
*/
export function isSuperAdmin(userData: any): boolean {
  if (!userData) return false;
  return userData.admin_type === 'super' || userData.role === 'super_admin';
}

/**
ตรวจสอบว่าเป็น Hospital Admin หรือไม่
Hospital Admin = admin_type = 'hospital' หรือ role = 'admin' + มี hospital_id
*/
export function isHospitalAdmin(userData: any): boolean {
  if (!userData) return false;
  return userData.admin_type === 'hospital' || 
         (userData.role === 'admin' && userData.hospital_id);
}

/**
ดึงรายชื่อโรงพยาบาล ID ที่ผู้ใช้สามารถเข้าถึงได้
Super Admin: เข้าถึงทั้งหมด (return empty array = ไม่กรอง)
Hospital Admin (แม่ข่าย): เข้าถึงตัวเอง + ลูกข่ายทั้งหมดที่อยู่ใต้
Hospital Admin (ลูกข่าย): เข้าถึงเฉพาะตัวเองเท่านั้น
*/
export async function getAccessibleHospitalIds(userId: string): Promise<string[]> {
  try {
    console.log('🔍 [getAccessibleHospitalIds] Getting accessible hospitals for user:', userId);
    // ✅ 1. ดึงข้อมูลผู้ใช้ (role + admin_type + hospital_id)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, admin_type, hospital_id')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('❌ [getAccessibleHospitalIds] Error fetching user data:', userError);
      return [];
    }

    console.log('📊 [getAccessibleHospitalIds] User data:', {
      role: userData.role,
      admin_type: userData.admin_type,
      hospital_id: userData.hospital_id
    });

    // ✅ 2. ถ้าเป็น Super Admin → เข้าถึงทั้งหมด (return empty = ไม่กรอง)
    if (isSuperAdmin(userData)) {
      console.log('👑 [getAccessibleHospitalIds] Super Admin - can access all hospitals');
      return []; // Empty array = ไม่มีการกรอง
    }

    // ✅ 3. ถ้าไม่มี hospital_id → ไม่สามารถเข้าถึงอะไรได้
    if (!userData.hospital_id) {
      console.log('⚠️ [getAccessibleHospitalIds] User has no hospital assigned');
      return [];
    }

    // ✅ 4. ดึงข้อมูลโรงพยาบาลของผู้ใช้
    const { data: hospitalData, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', userData.hospital_id)
      .single();

    if (hospitalError || !hospitalData) {
      console.error('❌ [getAccessibleHospitalIds] Error fetching hospital data:', hospitalError);
      return [];
    }

    console.log('🏥 [getAccessibleHospitalIds] User hospital:', {
      id: hospitalData.id,
      type: hospitalData.type,
      parent_id: hospitalData.parent_id
    });

    // ✅ 5. ตรวจสอบประเภทโรงพยาบาล
    if (hospitalData.type === 'main') {
      // ✅ แม่ข่าย: เข้าถึงตัวเอง + ลูกข่ายทั้งหมดที่อยู่ใต้
      const accessibleIds: string[] = [hospitalData.id];
      
      // ดึงลูกข่ายทั้งหมดที่อยู่ใต้แม่ข่ายนี้
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospitalData.id)
        .eq('is_active', true);

      if (subHospitals && subHospitals.length > 0) {
        subHospitals.forEach(sub => accessibleIds.push(sub.id));
        console.log('✅ [getAccessibleHospitalIds] Found', subHospitals.length, 'sub hospitals');
      }

      console.log('🏥 [getAccessibleHospitalIds] Main hospital - accessible:', accessibleIds.length, 'hospitals');
      return accessibleIds;
    } else if (hospitalData.type === 'sub') {
      // ✅ ลูกข่าย: เข้าถึงเฉพาะตัวเองเท่านั้น
      console.log('🏥 [getAccessibleHospitalIds] Sub hospital - accessible: 1 hospital (own)');
      return [hospitalData.id];
    }

    return [];
  } catch (err) {
    console.error('❌ [getAccessibleHospitalIds] Exception:', err);
    return [];
  }
}

/**
ดึงข้อมูลโรงพยาบาลของผู้ใช้พร้อมรายละเอียด
*/
export async function getUserHospitalInfo(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`hospital_id, hospitals ( id, name, code, type, parent_id, parent_hospital:hospitals!parent_id ( id, name, code ) )`)
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.hospitals;
  } catch (err) {
    console.error('Error fetching user hospital info:', err);
    return null;
  }
}

/**
ตรวจสอบสิทธิ์ Admin สำหรับแต่ละหน้า
*/
export function checkAdminPermission(userData: any, requiredType?: 'super' | 'hospital'): boolean {
  if (!userData) return false;

  // ✅ ถ้าไม่ระบุ type → ตรวจสอบแค่ว่าเป็น admin หรือไม่
  if (!requiredType) {
    return userData.role === 'admin' || 
           userData.admin_type === 'super' || 
           userData.admin_type === 'hospital';
  }

  // ✅ ตรวจสอบตาม type ที่ต้องการ
  if (requiredType === 'super') {
    return isSuperAdmin(userData);
  }

  if (requiredType === 'hospital') {
    return isHospitalAdmin(userData);
  }

  return false;
}

/**
ฟังก์ชันกรองข้อมูลตามสิทธิ์ (ใช้สำหรับทุกหน้า)
*/
export async function filterDataByHospitalPermission<T>(
  userId: string,
  fetchData: (hospitalIds: string[]) => Promise<T[]>
): Promise<T[]> {
  const hospitalIds = await getAccessibleHospitalIds(userId);
  return fetchData(hospitalIds);
}

// =====================================================
// 👥 Patient Management Functions
// =====================================================

/**
✅ แก้ไขแล้ว - รับ hospitalIds แทน userId
*/
export async function getPatientList(search?: string, pamLevel?: string, hospitalIds?: string[]) {
  try {
    console.log('🔍 [getPatientList] Called with hospitalIds:', hospitalIds);
    // ✅ 1. สร้าง query
    let query = supabase
      .from('profiles')
      .select(`*, users!profiles_id_fkey ( id_card, role, is_active, created_at ), hospitals ( id, name, code, type )`)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // ✅ 2. กรองตามโรงพยาบาลที่เข้าถึงได้ (ถ้ามี hospitalIds)
    if (hospitalIds && hospitalIds.length > 0) {
      console.log('🏥 [getPatientList] Filtering by hospitalIds:', hospitalIds);
      query = query.in('hospital_id', hospitalIds);
    } else if (hospitalIds && hospitalIds.length === 0) {
      // ✅ Super Admin (empty array = ไม่กรอง)
      console.log('👑 [getPatientList] Super Admin - showing all patients');
    } else {
      // ✅ ไม่มีการส่ง hospitalIds มา
      console.log('⚠️ [getPatientList] No hospitalIds provided');
    }

    // ✅ 3. ค้นหา
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,hospital_number.ilike.%${search}%`
      );
    }

    // ✅ 4. กรองตาม PAM Level
    if (pamLevel) {
      query = query.eq('pam_level', pamLevel);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getPatientList] Error:', error);
      return [];
    }

    const patientsWithData = data?.map(patient => ({
      ...patient,
      full_name: patient.first_name && patient.last_name 
        ? `${patient.first_name} ${patient.last_name}` 
        : '',
    })) || [];

    console.log('📊 [getPatientList] Total patients (filtered):', patientsWithData.length);
    return patientsWithData;
  } catch (err) {
    console.error('❌ [getPatientList] Exception:', err);
    return [];
  }
}

// ✅ ในฟังก์ชัน registerPatient - ลบ subdistrict_health_center และ village_id
// lib/supabase/queries.ts
// ✅ แก้ไข Syntax Errors ทั้งหมด
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ... (ส่วนบนของไฟล์คงเดิม) ...

// ✅ ฟังก์ชัน registerPatient (แก้ไขแล้ว)
export async function registerPatient(data: {
  id_card: string;
  password: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  birth_date: string;
  gender: string;
  phone?: string;
  email?: string;
  current_weight?: number;
  height?: number;
  waist_circumference?: number;
  coach_id?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  house_number?: string;
  address_line1?: string;
  soi?: string;
  road?: string;
  village_no?: string;
  village_name?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postal_code?: string;
  diabetes_type?: string;
  blood_sugar?: number;
  hba1c_level?: number;
  notes?: string;
  occupation?: string;
  education_level?: string;
  hospital_id?: string;
  village_id?: string;
  pam_level?: string;
  pam_score?: number;
  zone?: string;
  created_by: string;
}) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: 'patient',
        is_active: true,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        first_name: data.first_name,
        last_name: data.last_name,
        hospital_number: data.hospital_number,
        birth_date: data.birth_date,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        current_weight: data.current_weight,
        height: data.height,
        waist_circumference: data.waist_circumference,
        coach_id: data.coach_id,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        emergency_contact_relationship: data.emergency_contact_relationship,
        house_number: data.house_number,
        address_line1: data.address_line1,
        soi: data.soi,
        road: data.road,
        village_no: data.village_no,
        village_name: data.village_name,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        postal_code: data.postal_code,
        diabetes_type: data.diabetes_type,
        blood_sugar: data.blood_sugar,
        hba1c_level: data.hba1c_level,
        notes: data.notes,
        occupation: data.occupation,
        education_level: data.education_level,
        hospital_id: data.hospital_id,
        village_id: data.village_id,
        pam_level: data.pam_level || 'L0',
        pam_score: data.pam_score ?? 0,
        zone: data.zone || 'Zero Zone',
        current_step: 'Starter',
        is_active: true,
        status: 'active',
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      await supabase.from('users').delete().eq('id', user.id);
      return { success: false, error: profileError.message };
    }

    return { success: true, user, profile };
  } catch (err) {
    console.error('Register patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลงทะเบียน' };
  }
}

// ✅ ฟังก์ชัน getPatientDetail (แก้ไขแล้ว)
export async function getPatientDetail(userId: string) {
  try {
    console.log('🔍 Fetching patient detail for ID:', userId);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        hospitals (
          id,
          name,
          code,
          type
        )
      `)
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      return null;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id_card, role, is_active, created_at')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Error fetching user:', userError);
      return null;
    }

    const result = {
      ...profile,
      full_name: profile.first_name && profile.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : '',
      users: userData
    };

    console.log('✅ Patient detail fetched successfully:', result);
    return result;
  } catch (err) {
    console.error('❌ Get patient detail error:', err);
    return null;
  }
}

// ... (ส่วนที่เหลือของไฟล์คงเดิม) ...

export async function deletePatient(patientId: string) {
  try {
    console.log('🗑️ Deleting patient:', patientId);
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: false,
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return { success: false, error: profileError.message };
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', patientId);

    if (userError) {
      console.error('Error updating user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient deleted successfully');
    return { success: true };
  } catch (err) {
    console.error('Delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วย' };
  }
}

export async function restorePatient(patientId: string) {
  try {
    console.log('♻️ Restoring patient:', patientId);
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: true,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error restoring profile:', profileError);
      return { success: false, error: profileError.message };
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', patientId);

    if (userError) {
      console.error('Error restoring user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนผู้ป่วย' };
  }
}

export async function permanentlyDeletePatient(patientId: string) {
  try {
    console.log('🗑️ Permanently deleting patient:', patientId);
    // ✅ 1. ลบ screening_responses ก่อน (foreign key)
    const screenings = await supabase
      .from('screenings')
      .select('id')
      .eq('user_id', patientId);

    if (screenings.data && screenings.data.length > 0) {
      await supabase
        .from('screening_responses')
        .delete()
        .in(
          'screening_id',
          screenings.data.map((s: any) => s.id)
        );
    }

    // ✅ 2. ลบ appointment_followups
    await supabase
      .from('appointment_followups')
      .delete()
      .eq('user_id', patientId);

    // ✅ 3. ลบ goals
    await supabase
      .from('goals')
      .delete()
      .eq('user_id', patientId);

    // ✅ 4. ลบ records
    await supabase
      .from('records')
      .delete()
      .eq('user_id', patientId);

    // ✅ 5. ลบ screenings
    await supabase.from('screenings').delete().eq('user_id', patientId);

    // ✅ 6. ลบ appointments
    await supabase.from('appointments').delete().eq('user_id', patientId);

    // ✅ 7. ลบ profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', patientId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return { success: false, error: profileError.message };
    }

    // ✅ 8. ลบ users (สุดท้าย)
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', patientId);

    if (userError) {
      console.error('Error deleting user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient permanently deleted with all related data');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วยถาวร' };
  }
}

export async function getDeletedPatients() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`*, users!profiles_id_fkey ( id_card, role, is_active )`)
      .eq('is_active', false)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching deleted patients:', error);
      return [];
    }

    const patientsWithData = data?.map(patient => ({
      ...patient,
      full_name: patient.first_name && patient.last_name 
        ? `${patient.first_name} ${patient.last_name}` 
        : '',
    })) || [];

    return patientsWithData;
  } catch (err) {
    console.error('Get deleted patients error:', err);
    return [];
  }
}

// =====================================================
// 👨‍⚕️ Staff Management Functions
// =====================================================

export async function getStaffList(role?: string) {
  try {
    let query = supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, is_active, is_verified ), hospitals ( id, name, code )`)
      // ✅ เพิ่ม 'osm'
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching staff list:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get staff list error:', err);
    return [];
  }
}

export async function getDeactivatedStaff() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email )`)
      // ✅ เพิ่ม 'osm'
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching deactivated staff:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get deactivated staff error:', err);
    return [];
  }
}

export async function updateStaff(userId: string, data: {
  full_name_th?: string;
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;
  birth_date?: string;
  password_hash?: string;
  is_active?: boolean;
}) {
  try {
    // ✅ 1. อัปเดตข้อมูลในตาราง users
    const updateUserData: any = {};
    if (data.birth_date !== undefined) {
      updateUserData.birth_date = data.birth_date;
    }

    if (data.password_hash !== undefined) {
      updateUserData.password_hash = data.password_hash;
    }

    if (data.hospital_id !== undefined) {
      updateUserData.hospital_id = data.hospital_id;
    }

    if (Object.keys(updateUserData).length > 0) {
      updateUserData.updated_at = new Date().toISOString();
      
      const { error: userError } = await supabase
        .from('users')
        .update(updateUserData)
        .eq('id', userId);

      if (userError) {
        console.error('Error updating user:', userError);
        return { success: false, error: userError.message };
      }
    }

    // ✅ 2. อัปเดตข้อมูลในตาราง doctors
    const updateDoctorData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.full_name_th !== undefined) {
      updateDoctorData.full_name_th = data.full_name_th;
    }

    if (data.specialization_th !== undefined) {
      updateDoctorData.specialization_th = data.specialization_th;
    }

    if (data.is_active !== undefined) {
      updateDoctorData.is_active = data.is_active;
    }

    const { error } = await supabase
      .from('doctors')
      .update(updateDoctorData)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' };
  }
}

export async function deactivateStaff(userId: string) {
  try {
    await supabase
      .from('doctors')
      .update({ is_active: false })
      .eq('user_id', userId);

    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      console.error('Error deactivating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Deactivate staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการปิดการใช้งาน' };
  }
}

export async function restoreStaff(staffId: string) {
  try {
    console.log('♻️ Restoring staff:', staffId);
    await supabase
      .from('doctors')
      .update({ is_active: true })
      .eq('user_id', staffId);

    const { error } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', staffId);

    if (error) {
      console.error('Error restoring staff:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Staff restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนเจ้าหน้าที่' };
  }
}

export async function permanentlyDeleteStaff(staffId: string) {
  try {
    console.log('🗑️ Permanently deleting staff:', staffId);
    
    // ✅ 1. แก้ไข pending_staff ที่ reference มาที่ user นี้ก่อน
    await supabase
      .from('pending_staff')
      .update({ 
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null
      })
      .eq('reviewed_by', staffId);
    
    console.log('✅ Cleared pending_staff references');
    
    // ✅ 2. ลบ record ในตาราง doctors
    await supabase
      .from('doctors')
      .delete()
      .eq('user_id', staffId);
    
    console.log('✅ Deleted doctors record');

    // ✅ 3. ลบ users (สุดท้าย)
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', staffId);

    if (userError) {
      console.error('Error deleting user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Staff permanently deleted');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบเจ้าหน้าที่ถาวร' };
  }
}


export async function getStaffDetail(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email, is_active, is_verified )`)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching staff detail:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get staff detail error:', err);
    return null;
  }
}

// =====================================================
// 🏥 Hospital Management Functions
// =====================================================

export async function getHospitals() {
  try {
    console.log('🏥 Fetching all hospitals...');
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching hospitals:', error);
      return [];
    }

    console.log('✅ Hospitals loaded:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get hospitals error:', err);
    return [];
  }
}

export async function getHospitalsWithHierarchy() {
  try {
    console.log('🏥 Fetching hospitals with hierarchy...');
    const { data, error } = await supabase
      .from('hospitals')
      .select(`
        *,
        parent_hospital:hospitals!parent_id (
          id,
          name,
          code
        )
      `)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching hospitals:', error);
      return [];
    }

    console.log('✅ Hospitals with hierarchy fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('❌ Get hospitals with hierarchy error:', err);
    return [];
  }
}

export async function createHospital(data: {
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id?: string;
  address?: string;
  phone?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
}) {
  try {
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .insert({
        name: data.name,
        code: data.code,
        type: data.type,
        parent_id: data.parent_id,
        address: data.address,
        phone: data.phone,
        province: data.province,
        district: data.district,
        subdistrict: data.subdistrict,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, hospital };
  } catch (err) {
    console.error('Create hospital error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างโรงพยาบาล' };
  }
}

// =====================================================
// 🏘️ Village Management Functions
// =====================================================

export async function getVillages(hospitalId?: string) {
  try {
    let query = supabase
      .from('villages')
      .select(`*, hospitals ( name, type )`)
      .eq('is_active', true)
      .order('province', { ascending: true })
      .order('district', { ascending: true })
      .order('subdistrict', { ascending: true })
      .order('village_no', { ascending: true });

    if (hospitalId) {
      query = query.eq('hospital_id', hospitalId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (err) {
    console.error('Get villages error:', err);
    return [];
  }
}

export async function createVillage(data: {
  village_no: string;
  village_name?: string;
  subdistrict: string;
  district: string;
  province: string;
  postal_code?: string;
  hospital_id?: string;
}) {
  try {
    const { data: village, error } = await supabase
      .from('villages')
      .insert({
        village_no: data.village_no,
        village_name: data.village_name,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        postal_code: data.postal_code,
        hospital_id: data.hospital_id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, village };
  } catch (err) {
    console.error('Create village error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างหมู่บ้าน' };
  }
}

// =====================================================
// 👩‍⚕️ Volunteer Management Functions
// =====================================================

export async function getVolunteerVillages(volunteerId: string) {
  try {
    const { data, error } = await supabase
      .from('volunteer_villages')
      .select(`*, villages ( village_no, village_name, subdistrict, district, province )`)
      .eq('volunteer_id', volunteerId)
      .eq('is_active', true);

    if (error) throw error;

    return data || [];
  } catch (err) {
    console.error('Get volunteer villages error:', err);
    return [];
  }
}

export async function assignVolunteerVillage(data: {
  volunteer_id: string;
  village_id: string;
}) {
  try {
    const { data: result, error } = await supabase
      .from('volunteer_villages')
      .insert({
        volunteer_id: data.volunteer_id,
        village_id: data.village_id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: result };
  } catch (err) {
    console.error('Assign volunteer village error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการมอบหมายหมู่บ้าน' };
  }
}

// =====================================================
// 📍 Address Functions
// =====================================================

export async function getProvinces() {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('province')
      .neq('province', null)
      .order('province', { ascending: true });

    if (error) {
      console.error('Error fetching provinces:', error);
      return [];
    }

    const provinces = [...new Set(data?.map(v => v.province) || [])];
    console.log('✅ Provinces fetched:', provinces.length);
    return provinces;
  } catch (err) {
    console.error('Get provinces error:', err);
    return [];
  }
}

export async function getDistricts(province: string) {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('district')
      .eq('province', province)
      .neq('district', null)
      .order('district', { ascending: true });

    if (error) {
      console.error('Error fetching districts:', error);
      return [];
    }

    const districts = [...new Set(data?.map(v => v.district) || [])];
    console.log('✅ Districts fetched for', province, ':', districts.length);
    return districts;
  } catch (err) {
    console.error('Get districts error:', err);
    return [];
  }
}

export async function getSubdistricts(province: string, district: string) {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('subdistrict, postal_code')
      .eq('province', province)
      .eq('district', district)
      .neq('subdistrict', null)
      .order('subdistrict', { ascending: true });

    if (error) {
      console.error('Error fetching subdistricts:', error);
      return [];
    }

    console.log('✅ Subdistricts fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get subdistricts error:', err);
    return [];
  }
}

// =====================================================
// 📅 Appointment Functions
// =====================================================

export async function getAppointments(patientId: string) {
  try {
    console.log('📅 [getAppointments] Fetching for patient:', patientId);
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors:doctor_id (
          id,
          full_name_th,
          specialization_th
        )
      `)
      .eq('user_id', patientId)
      .order('appointment_date', { ascending: true });

    if (error) {
      console.error('❌ [getAppointments] Error:', error);
      return [];
    }

    console.log('✅ [getAppointments] Found:', data?.length || 0, 'appointments');
    return data || [];
  } catch (err) {
    console.error('❌ [getAppointments] Error:', err);
    return [];
  }
}

export async function createAppointment(data: {
  user_id: string;
  doctor_id: string;
  appointment_type: string;
  appointment_date: string;
  duration_minutes?: number;
  location_type?: string;
  location_detail?: string;
  notes?: string;
  created_by: string;
}) {
  try {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        user_id: data.user_id,
        doctor_id: data.doctor_id,
        appointment_type: data.appointment_type,
        appointment_date: data.appointment_date,
        duration_minutes: data.duration_minutes || 30,
        location_type: data.location_type || 'clinic',
        location_detail: data.location_detail,
        status: 'scheduled',
        notes: data.notes,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating appointment:', error);
      return { success: false, error: error.message };
    }

    return { success: true, appointment };
  } catch (err) {
    console.error('Create appointment error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างนัดหมาย' };
  }
}

export async function getNextAppointment(userId: string) {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors (
          id,
          full_name_th,
          specialization_th
        )
      `)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'confirmed', 'pending'])
      .gte('appointment_date', startOfToday.toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching appointment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Appointment error:', err);
    return null;
  }
}

export async function getNextPatientAppointment(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('appointment_date', new Date().toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching next appointment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get next appointment error:', err);
    return null;
  }
}

// =====================================================
// 📋 Screening Functions
// =====================================================

export async function getScreeningQuestions(questionType: string = 'pam') {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('question_type', questionType)
      .eq('is_active', true)
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching screening questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get screening questions error:', err);
    return [];
  }
}

export async function saveScreening(data: {
  user_id: string;
  screening_type: string;
  pam_total_score?: number;
  pam_level_result?: string;
  proms_q1_score?: number;
  proms_q2_score?: number;
  proms_q3_score?: number;
  proms_q4_score?: number;
  proms_zone?: string;
  proms_has_low_score?: boolean;
  confidence_score?: number;
  confidence_improvement_plan?: string;
  conducted_by?: string;
  responses: Array<{
    question_id: string;
    question_number: number;
    question_type: string;
    selected_option?: string;
    score?: number;
  }>;
}) {
  try {
    const { data: screening, error: screeningError } = await supabase
      .from('screenings')
      .insert({
        user_id: data.user_id,
        screening_type: data.screening_type,
        pam_total_score: data.pam_total_score,
        pam_level_result: data.pam_level_result,
        proms_q1_score: data.proms_q1_score,
        proms_q2_score: data.proms_q2_score,
        proms_q3_score: data.proms_q3_score,
        proms_q4_score: data.proms_q4_score,
        proms_zone: data.proms_zone,
        proms_has_low_score: data.proms_has_low_score,
        confidence_score: data.confidence_score,
        confidence_improvement_plan: data.confidence_improvement_plan,
        conducted_by: data.conducted_by,
      })
      .select()
      .single();

    if (screeningError) {
      console.error('Error creating screening:', screeningError);
      return { success: false, error: screeningError.message };
    }

    const responses = data.responses.map(r => ({
      screening_id: screening.id,
      question_id: r.question_id,
      question_number: r.question_number,
      question_type: r.question_type,
      selected_option: r.selected_option,
      score: r.score,
    }));

    const { error: responsesError } = await supabase
      .from('screening_responses')
      .insert(responses);

    if (responsesError) {
      console.error('Error saving responses:', responsesError);
      return { success: false, error: responsesError.message };
    }

    if (data.pam_level_result) {
      const levelMap: Record<string, string> = {
        'Deny': 'L1',
        'General': 'L2',
        'Intensive': 'L3',
        'Champion': 'L4',
      };

      const zoneMap: Record<string, string> = {
        'Deny': 'Red Zone',
        'General': 'Green Zone',
        'Intensive': 'Green Zone',
        'Champion': 'Green Zone',
      };

      await supabase
        .from('profiles')
        .update({
          pam_level: levelMap[data.pam_level_result] || 'L1',
          zone: zoneMap[data.pam_level_result] || 'Green Zone',
          pam_score: data.pam_total_score,
        })
        .eq('id', data.user_id);
    }

    return { success: true, screening };
  } catch (err) {
    console.error('Save screening error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึก screening' };
  }
}

export async function getScreeningHistory(patientId: string) {
  try {
    const { data: screenings, error } = await supabase
      .from('screenings')
      .select(`*, screening_responses ( question_id, question_number, question_type, selected_option, score )`)
      .eq('user_id', patientId)
      .order('screening_date', { ascending: false });

    if (error) {
      console.error('Error fetching screening history:', error);
      return [];
    }

    return screenings || [];
  } catch (err) {
    console.error('Get screening history error:', err);
    return [];
  }
}

export async function getAllScreeningQuestions() {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('is_active', true)
      .order('question_type', { ascending: true })
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get all questions error:', err);
    return [];
  }
}

// =====================================================
// 🎯 Goals Functions
// =====================================================

export async function createDefaultGoals(
  userId: string,
  pamLevel: string,
  createdBy: string
) {
  try {
    console.log('🎯 Creating default goals for user:', userId, 'PAM Level:', pamLevel);
    if (pamLevel === 'L1') {
      console.log('⚠️ L1 Patient: No default goals created');
      return { success: true, message: 'L1 - ไม่สร้างเป้าหมายอัตโนมัติ', count: 0 };
    }

    const { data: existingGoals, error: checkError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (checkError) {
      console.error('Error checking existing goals:', checkError);
    }

    if (existingGoals && existingGoals.length > 0) {
      const goalNames = existingGoals.map(g => g.goal_name);
      
      const isL4ButHasL2L3Goals = pamLevel === 'L4' && 
        goalNames.some(name => ['stop_sweet', 'reduce_rice', 'protein_vegetable', 'exercise_walk', 'record_weight_sugar'].includes(name));
      
      const isL2L3ButHasL4Goals = (pamLevel === 'L2' || pamLevel === 'L3') && 
        goalNames.some(name => ['carb_control', 'protein_intake', 'water_intake', 'stretching', 'cardio', 'strengthening', 'hiit', 'sleep'].includes(name));

      if (isL4ButHasL2L3Goals || isL2L3ButHasL4Goals) {  
        console.log('⚠️ PAM Level changed! Archiving old goals and creating new ones...');
        
        const { error: archiveError } = await supabase
          .from('goals')
          .update({ 
            status: 'archived',
            is_current: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active');

        if (archiveError) {
          console.error('Error archiving old goals:', archiveError);
        }
      } else {
        console.log('✅ Goals already exist and match PAM Level:', existingGoals.length, 'goals');
        return { 
          success: true, 
          message: 'มีเป้าหมายอยู่แล้วและตรงกับ PAM Level', 
          count: existingGoals.length,
          alreadyExists: true
        };
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const goals = [];

    if (pamLevel === 'L2' || pamLevel === 'L3') {
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          'stop_sweet',
          'reduce_rice',
          'protein_vegetable',
          'exercise_walk',
          'record_weight_sugar'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          if (activity.activity_code === 'exercise_walk') {
            targetValue = 15;
            targetUnit = 'minutes';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th, 
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L2/L3: Created ${goals.length} default goals`);
    }

    if (pamLevel === 'L4') {
      const { data: activities, error: activitiesError } = await supabase  
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          'carb_control',
          'protein_intake', 
          'water_intake',
          'stretching',
          'cardio',
          'strengthening',
          'hiit',
          'sleep'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          if (activity.activity_code === 'water_intake') {
            targetValue = 1;
            targetUnit = 'liters';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th,
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L4: Created ${goals.length} default goals`);
    }

    if (goals.length > 0) {
      const { error } = await supabase.from('goals').insert(goals);

      if (error) {
        console.error('❌ Error creating goals:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ Created ${goals.length} default goals successfully`);
      return { success: true, count: goals.length };
    }

    return { success: true, count: 0 };
  } catch (err) {
    console.error('Create default goals error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย' };
  }
}

// =====================================================
// 🎯 Patient Goals Functions
// =====================================================

export async function getPatientGoals(userId: string, roundNumber?: number) {
  try {
    console.log('🎯 [getPatientGoals] Fetching for user:', userId, 'Round:', roundNumber);
    let query = supabase
      .from('goals')
      .select(`
        *,
        activities (
          activity_code,
          activity_name_th,
          description_th
        )
      `)
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (roundNumber) {
      query = query.eq('round_number', roundNumber);
    } else {
      // ถ้าไม่ระบุ round ให้เอารอบล่าสุด
      query = query.eq('is_current', true);
    }

    query = query.order('priority', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getPatientGoals] Error:', error);
      return [];
    }

    console.log('✅ [getPatientGoals] Fetched:', data?.length || 0, 'goals');
    return data || [];
  } catch (err) {
    console.error('❌ [getPatientGoals] Exception:', err);
    return [];
  }
}

export async function getGoalRoundCount(userId: string) {
  try {
    const { count, error } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity');

    if (error) {
      console.error('Error counting goal rounds:', error);
      return 1;
    }

    // นับจำนวน round ที่ไม่ซ้ำกัน
    const { data } = await supabase
      .from('goals')
      .select('round_number')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity');

    if (!data || data.length === 0) return 1;

    const uniqueRounds = [...new Set(data.map(g => g.round_number))];
    return Math.max(...uniqueRounds, 1);
  } catch (err) {
    console.error('Get goal round count error:', err);
    return 1;
  }
}

export async function getPatientRecords(userId: string, days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log('📝 [getPatientRecords] Fetching for user:', userId, 'Days:', days);

    const { data, error } = await supabase
      .from('records')
      .select(`
        *,
        activities (
          activity_code,
          activity_name_th
        )
      `)
      .eq('user_id', userId)
      .gte('record_date', startDate.toISOString())
      .order('record_date', { ascending: false });

    if (error) {
      console.error('❌ [getPatientRecords] Error:', error);
      return [];
    }

    console.log('✅ [getPatientRecords] Fetched:', data?.length || 0, 'records');
    return data || [];
  } catch (err) {
    console.error('❌ [getPatientRecords] Exception:', err);
    return [];
  }
}

export async function updateExerciseGoal(
  userId: string,
  goalName: string,
  targetValue: number,
  targetUnit: string = 'minutes'
) {
  try {
    const { error } = await supabase
      .from('goals')
      .update({
        target_value: targetValue,
        target_unit: targetUnit,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('goal_name', goalName)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (error) {
      console.error('Error updating exercise goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update exercise goal error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการอัปเดตเป้าหมาย' };
  }
}

export async function getLatestGoalRound(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('round_number, created_at')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .order('round_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching latest goal round:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('Get latest goal round error:', err);
    return null;
  }
}

export async function saveGoalsNewRound(data: {
  user_id: string;
  goals: Array<{
    goal_name: string;
    goal_name_th: string;
    target_days: number;
    target_value?: number;
    target_unit?: string;
    activity_id?: string;
    primary_goal_note?: string;
    weekly_goal_note?: string;
  }>;
  created_by: string;
}) {
  try {
    console.log('💾 [saveGoalsNewRound] Starting...', data.user_id);
    const today = new Date().toISOString().split('T')[0];
    console.log('[saveGoalsNewRound] Today:', today);

    const { data: existingTodayGoals, error: fetchError } = await supabase
      .from('goals')
      .select('id, goal_name, created_at')
      .eq('user_id', data.user_id)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59');

    if (fetchError) {
      console.error('Error fetching existing goals:', fetchError);
    }

    console.log('📋 [saveGoalsNewRound] Existing goals today:', existingTodayGoals?.length || 0);

    let nextRound: number;

    if (existingTodayGoals && existingTodayGoals.length > 0) {
      nextRound = existingTodayGoals[0].round_number || 1;
      console.log('📅 [saveGoalsNewRound] Same day - using existing round:', nextRound);

      const { error: deleteError } = await supabase
        .from('goals')
        .delete()
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');

      if (deleteError) {
        console.error('❌ [saveGoalsNewRound] Error deleting today goals:', deleteError);
      } else {
        console.log('✅ [saveGoalsNewRound] Successfully deleted', existingTodayGoals.length, 'goals for today');
      }
    } else {
      console.log('🆕 [saveGoalsNewRound] New day - archiving old goals');

      const { data: goalsToArchive } = await supabase
        .from('goals')
        .select('id, goal_name')
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');

      console.log('📦 [saveGoalsNewRound] Goals to archive:', goalsToArchive?.length || 0);

      if (goalsToArchive && goalsToArchive.length > 0) {
        const { error: archiveError } = await supabase
          .from('goals')
          .update({
            is_current: false,
            status: 'archived',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', data.user_id)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active');

        if (archiveError) {
          console.error('❌ [saveGoalsNewRound] Error archiving goals:', archiveError);
        } else {
          console.log('✅ [saveGoalsNewRound] Archived', goalsToArchive?.length || 0, 'old goals');
        }
      }

      const { data: allRounds } = await supabase
        .from('goals')
        .select('round_number')
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity');

      const uniqueRounds = new Set(allRounds?.map(g => g.round_number) || []);
      nextRound = uniqueRounds.size + 1;

      console.log('🆕 [saveGoalsNewRound] New day - next round:', nextRound);
    }

    const newGoals = data.goals.map(goal => ({
      user_id: data.user_id,
      goal_type: 'weekly_activity' as const,
      goal_name: goal.goal_name,
      goal_name_th: goal.goal_name_th,
      target_days: goal.target_days,
      target_value: goal.target_value || null,
      target_unit: goal.target_unit || null,
      activity_id: goal.activity_id || null,
      status: 'active' as const,
      is_current: true,
      round_number: nextRound,
      start_date: today,
      priority: 1,
      is_core_goal: true,
      created_by: data.created_by,
      primary_goal_note: goal.primary_goal_note || null,
      weekly_goal_note: goal.weekly_goal_note || null,
      last_recorded_date: today,
    }));

    console.log('📝 [saveGoalsNewRound] Creating', newGoals.length, 'new goals');

    const { error: insertError, data: insertedData } = await supabase
      .from('goals')
      .insert(newGoals)
      .select();

    if (insertError) {
      console.error('❌ [saveGoalsNewRound] Error creating new goals:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ [saveGoalsNewRound] Created new goals successfully');
    console.log('✅ [saveGoalsNewRound] Inserted IDs:', insertedData?.map(g => g.id));

    return {
      success: true,
      round_number: nextRound,
      goals_count: newGoals.length,
    };
  } catch (err) {
    console.error('❌ [saveGoalsNewRound] Error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกเป้าหมาย' };
  }
}

// =====================================================
// 📊 Records Functions
// =====================================================

export async function saveRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  is_completed: boolean;
  weight?: number;
  blood_sugar?: number;
  sweet_type?: string[];
  exercise_minutes?: number;
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.blood_sugar !== undefined && { blood_sugar: data.blood_sugar }),
        ...(data.sweet_type !== undefined && { sweet_type: data.sweet_type }),
        ...(data.exercise_minutes !== undefined && { exercise_minutes: data.exercise_minutes }),
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Upsert error:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save record error:', err);
    return null;
  }
}

export async function saveExerciseRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  exercise_minutes: number;
  is_completed: boolean;
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        exercise_minutes: data.exercise_minutes,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Error saving exercise record:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save exercise record error:', err);
    return null;
  }
}

export async function getTodayRecords(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('records')
      .select(`
        id, 
        activity_id, 
        is_completed, 
        record_date, 
        sweet_type, 
        weight, 
        blood_sugar,
        exercise_minutes
      `)
      .eq('user_id', userId)
      .eq('record_date', today);

    if (error) {
      console.error('Error fetching today records:', error);
      return [];
    }

    console.log('📝 Today records:', data);
    return data || [];
  } catch (err) {
    console.error('Get today records error:', err);
    return [];
  }
}

export async function getWeeklyGoals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('goal_type', 'weekly_activity');

    if (error) {
      console.error('Error fetching weekly goals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get weekly goals error:', err);
    return [];
  }
}

export async function getProgress(userId: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('records')
    .select(`*, activities ( activity_code, activity_name_th, activity_type )`)
    .eq('user_id', userId)
    .gte('record_date', startDate.toISOString())
    .order('record_date', { ascending: false });

  if (error) return [];
  return data;
}

// =====================================================
// 📈 Dashboard Functions
// =====================================================

export async function getDashboardStats(hospitalIds?: string[]) {
  try {
    // ✅ 1. นับผู้ป่วยทั้งหมด (กรองตามโรงพยาบาลถ้ามี)
    let patientsQuery = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (hospitalIds && hospitalIds.length > 0) {
      patientsQuery = patientsQuery.in('hospital_id', hospitalIds);
    }

    const { count: totalPatients } = await patientsQuery;

    // ✅ 2. นับบันทึกวันนี้
    const today = new Date().toISOString().split('T')[0];

    let recordsQuery = supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('record_date', today);

    if (hospitalIds && hospitalIds.length > 0) {
      const { data: patientIds } = await supabase
        .from('profiles')
        .select('id')
        .in('hospital_id', hospitalIds)
        .eq('is_active', true);
      
      if (patientIds && patientIds.length > 0) {
        recordsQuery = recordsQuery.in(
          'user_id',
          patientIds.map(p => p.id)
        );
      } else {
        return {
          totalPatients: 0,
          todayRecords: 0,
          todayAppointments: 0,
          pendingAssessments: 0,
        };
      }
    }

    const { count: todayRecords } = await recordsQuery;

    // ✅ 3. นับนัดหมายวันนี้
    let appointmentsQuery = supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('appointment_date', today)
      .lte('appointment_date', today + 'T23:59:59');

    if (hospitalIds && hospitalIds.length > 0) {
      const { data: patientIds } = await supabase
        .from('profiles')
        .select('id')
        .in('hospital_id', hospitalIds)
        .eq('is_active', true);
      
      if (patientIds && patientIds.length > 0) {
        appointmentsQuery = appointmentsQuery.in(
          'user_id',
          patientIds.map(p => p.id)
        );
      } else {
        return {
          totalPatients: 0,
          todayRecords: 0,
          todayAppointments: 0,
          pendingAssessments: 0,
        };
      }
    }

    const { count: todayAppointments } = await appointmentsQuery;

    // ✅ 4. นับรอประเมิน
    let pendingQuery = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('pam_level', 'L1') 
      .eq('is_active', true);

    if (hospitalIds && hospitalIds.length > 0) {
      pendingQuery = pendingQuery.in('hospital_id', hospitalIds);
    }

    const { count: pendingAssessments } = await pendingQuery;

    return {
      totalPatients: totalPatients || 0,
      todayRecords: todayRecords || 0,
      todayAppointments: todayAppointments || 0,
      pendingAssessments: pendingAssessments || 0,
    };
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return {
      totalPatients: 0,
      todayRecords: 0,
      todayAppointments: 0,
      pendingAssessments: 0,
    };
  }
}

// =====================================================
// 📚 Knowledge Functions
// =====================================================

export async function getKnowledge(pamLevel: string = 'ALL') {
  try {
    console.log('📚 [getKnowledge] Fetching for pamLevel:', pamLevel);
    const { data, error } = await supabase
      .from('knowledge')
      .select('*')
      .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [getKnowledge] Error:', error);
      return [];
    }

    console.log('✅ [getKnowledge] Fetched:', data?.length || 0, 'items');
    return data || [];
  } catch (err) {
    console.error('❌ [getKnowledge] Error:', err);
    return [];
  }
}

// =====================================================
// 📋 Appointment Followup Functions
// =====================================================

export async function saveAppointmentFollowup(data: {
  appointment_id: string;
  user_id: string;
  followup_date: string;
  followup_round: number;
  blood_sugar_dtx?: number;
  blood_pressure_sys?: number;
  blood_pressure_dia?: number;
  pulse?: number;
  weight?: number;
  waist_circumference?: number;
  food_amount_status?: 'completed' | 'not_completed' | 'not_in_plan';
  food_type_status?: 'completed' | 'not_completed' | 'not_in_plan';
  movement_status?: 'completed' | 'not_completed' | 'not_in_plan';
  confidence_score?: number;
  notes?: string;
  life_schedule_image_url?: string;
  followup_status?: 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'monitoring';
  conducted_by: string;
}) {
  try {
    const { data: followup, error } = await supabase
      .from('appointment_followups')
      .upsert({
        appointment_id: data.appointment_id,
        user_id: data.user_id,
        followup_date: data.followup_date,
        followup_round: data.followup_round,
        blood_sugar_dtx: data.blood_sugar_dtx,
        blood_pressure_sys: data.blood_pressure_sys,
        blood_pressure_dia: data.blood_pressure_dia,
        pulse: data.pulse,
        weight: data.weight,
        waist_circumference: data.waist_circumference,
        food_amount_status: data.food_amount_status,
        food_type_status: data.food_type_status,
        movement_status: data.movement_status,
        confidence_score: data.confidence_score,
        notes: data.notes,
        life_schedule_image_url: data.life_schedule_image_url,
        followup_status: data.followup_status,
        conducted_by: data.conducted_by,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'appointment_id,followup_round',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving followup:', error);
      return { success: false, error: error.message };
    }

    return { success: true, followup };
  } catch (err) {
    console.error('Save followup error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึก' };
  }
}

export async function saveAppointmentFollowupComplete(data: {
  appointment_id: string;
  user_id: string;
  followup_date: string;
  followup_round: number;
  weight?: number | null;
  waist_circumference?: number | null;
  blood_pressure_sys?: number | null;
  blood_pressure_dia?: number | null;
  blood_sugar_dtx?: number | null;
  life_schedule_image_url?: string | null;
  adaptation_summary?: string | null;
  adaptation_obstacles?: string | null;
  adaptation_opportunities?: string | null;
  adaptation_other?: string | null;
  food_amount_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  food_type_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  movement_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  food_amount_note?: string | null;
  food_type_note?: string | null;
  movement_note?: string | null;
  confidence_score?: number | null;
  confidence_improvement_plan?: string | null;
  summary?: string | null;
  recommendations?: string | null;
  followup_status?: 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'monitoring' | null;
  conducted_by: string;
}) {
  try {
    console.log('💾 [saveAppointmentFollowupComplete] Starting...');
    console.log('📝 Data to save:', data);

    if (!data.conducted_by) {
      throw new Error('conducted_by is required');
    }

    const { data: followup, error } = await supabase
      .from('appointment_followups')
      .insert({
        appointment_id: data.appointment_id,
        user_id: data.user_id,
        followup_date: data.followup_date,
        followup_round: data.followup_round,
        weight: data.weight || null,
        waist_circumference: data.waist_circumference || null,
        blood_pressure_sys: data.blood_pressure_sys || null,
        blood_pressure_dia: data.blood_pressure_dia || null,
        blood_sugar_dtx: data.blood_sugar_dtx || null,
        life_schedule_image_url: data.life_schedule_image_url || null,
        adaptation_summary: data.adaptation_summary || null,
        adaptation_obstacles: data.adaptation_obstacles || null,
        adaptation_opportunities: data.adaptation_opportunities || null,
        adaptation_other: data.adaptation_other || null,
        food_amount_status: data.food_amount_status || null,
        food_type_status: data.food_type_status || null,
        movement_status: data.movement_status || null,
        food_amount_note: data.food_amount_note || null,
        food_type_note: data.food_type_note || null,
        movement_note: data.movement_note || null,
        confidence_score: data.confidence_score || null,
        confidence_improvement_plan: data.confidence_improvement_plan || null,
        summary: data.summary || null,
        recommendations: data.recommendations || null,
        followup_status: data.followup_status || null,
        conducted_by: data.conducted_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [saveAppointmentFollowupComplete] Error:', error);
      return { success: false, error: error.message, details: error };
    }

    console.log('✅ [saveAppointmentFollowupComplete] Success:', followup);
    return { success: true, followup };
  } catch (err: any) {
    console.error('❌ [saveAppointmentFollowupComplete] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function getPatientFollowupHistory(userId: string, limit?: number) {
  try {
    console.log('📋 Fetching followup history for user:', userId);
    let query = supabase
      .from('appointment_followups')
      .select(`
        *,
        appointments (
          appointment_date,
          appointment_type
        )
      `)
      .eq('user_id', userId)
      .order('followup_date', { ascending: false })
      .order('followup_round', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching followup history:', error);
      return [];
    }

    console.log('✅ Followup history fetched:', data?.length || 0, 'records');
    return data || [];
  } catch (err) {
    console.error('❌ Get followup history error:', err);
    return [];
  }
}

export async function getFollowupByAppointmentId(appointmentId: string) {
  try {
    const { data, error } = await supabase
      .from('appointment_followups')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('followup_round', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching followup:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get followup error:', err);
    return null;
  }
}

export async function getFollowupRoundCount(userId: string) {
  try {
    const { count, error } = await supabase
      .from('appointment_followups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error counting followups:', error);
      return 1;
    }

    return (count || 0) + 1;
  } catch (err) {
    console.error('Get followup round count error:', err);
    return 1;
  }
}

// =====================================================
// 👨‍⚕️ Coach Functions (แก้ไขแล้ว)
// =====================================================

/**
ดึงรายชื่อโค้ชทั้งหมด (ไม่กรองตามสิทธิ์)
ใช้สำหรับหน้าลงทะเบียนผู้ป่วยที่ Super Admin เข้าถึง
*/
export async function getAllCoaches() {
  try {
    console.log('👨‍⚕️ [getAllCoaches] Fetching all coaches...');
    const { data, error } = await supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, is_active, hospitals ( id, name, code, type, parent_id ) )`)
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });

    if (error) {
      console.error('❌ [getAllCoaches] Error:', error);
      return [];
    }

    console.log('✅ [getAllCoaches] Fetched:', data?.length || 0, 'coaches');
    return data || [];
  } catch (err) {
    console.error('❌ [getAllCoaches] Exception:', err);
    return [];
  }
}

/**
ดึงรายชื่อโค้ชตามโรงพยาบาลที่เลือก (รวมแม่ข่ายและลูกข่าย)
ถ้าเลือกแม่ข่าย → แสดงโค้ชจากแม่ข่าย + ลูกข่ายทั้งหมดที่อยู่ใต้
ถ้าเลือกลูกข่าย → แสดงโค้ชจากลูกข่าย + แม่ข่ายที่เป็น parent
ถ้าไม่เลือก → แสดงโค้ชทั้งหมด
*/
export async function getCoachesByHospital(hospitalId?: string) {
  try {
    console.log('👨‍⚕️ [getCoachesByHospital] Fetching coaches for hospital:', hospitalId || 'ALL');

    // ถ้าไม่เลือกโรงพยาบาล → โหลดทั้งหมด
    if (!hospitalId) {
      return await getAllCoaches();
    }

    // ดึงข้อมูลโรงพยาบาลที่เลือก
    const { data: hospitalData, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', hospitalId)
      .single();

    if (hospitalError || !hospitalData) {
      console.error('❌ [getCoachesByHospital] Error fetching hospital:', hospitalError);
      return await getAllCoaches();
    }

    // รวบรวม hospital IDs ที่จะใช้กรองโค้ช
    let hospitalIds: string[] = [hospitalId];

    // ถ้าเป็นแม่ข่าย → เพิ่มลูกข่ายทั้งหมดที่อยู่ใต้
    if (hospitalData.type === 'main') {
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospitalId)
        .eq('is_active', true);

      if (subHospitals && subHospitals.length > 0) {
        hospitalIds = [...hospitalIds, ...subHospitals.map(h => h.id)];
        console.log('🏥 [getCoachesByHospital] Main hospital - adding', subHospitals.length, 'sub hospitals');
      }
    }
    // ถ้าเป็นลูกข่าย → เพิ่มแม่ข่ายที่เป็น parent
    else if (hospitalData.type === 'sub' && hospitalData.parent_id) {
      hospitalIds = [...hospitalIds, hospitalData.parent_id];
      console.log('🏥 [getCoachesByHospital] Sub hospital - adding parent hospital');
    }

    console.log('🏥 [getCoachesByHospital] Filtering by hospital IDs:', hospitalIds);

    const { data, error } = await supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, is_active, hospitals ( id, name, code, type, parent_id ) )`)
      .eq('is_active', true)
      .in('users.hospital_id', hospitalIds)
      .order('full_name_th', { ascending: true });

    if (error) {
      console.error('❌ [getCoachesByHospital] Error:', error);
      return [];
    }

    console.log('✅ [getCoachesByHospital] Fetched:', data?.length || 0, 'coaches');
    return data || [];
  } catch (err) {
    console.error('❌ [getCoachesByHospital] Exception:', err);
    return [];
  }
}

/**
ดึงรายชื่อโค้ชแบบง่าย (ไม่รวมข้อมูลโรงพยาบาล)
ใช้สำหรับหน้าที่ไม่ต้องการแสดงข้อมูลโรงพยาบาลของโค้ช
*/
export async function getCoaches() {
  try {
    console.log('👨‍⚕️ [getCoaches] Fetching coaches (simple)...');
    const { data, error } = await supabase
      .from('doctors')
      .select('id, user_id, full_name_th, specialization_th, is_active')
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });

    if (error) {
      console.error('❌ [getCoaches] Error:', error);
      return [];
    }

    console.log('✅ [getCoaches] Fetched:', data?.length || 0, 'coaches');
    return data || [];
  } catch (err) {
    console.error('❌ [getCoaches] Exception:', err);
    return [];
  }
}

// ✅ เพิ่มฟังก์ชันใหม่ต่อจาก getCoaches() เดิม
/**
✅ ดึงรายชื่อโค้ชพร้อมโรงพยาบาล (กรองตาม hospital_ids ที่กำหนด)
@param hospitalIds - รายการ ID โรงพยาบาลที่ต้องการกรอง (ถ้าเป็น empty array = ไม่กรอง)
*/
export async function getCoachesByUserHospital(hospitalIds?: string[]) {
  try {
    console.log('👨‍⚕️ [getCoachesByUserHospital] Fetching coaches...', { hospitalIds });
    let query = supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, hospital_id, hospitals ( id, name, code, type )`)
      .eq('is_active', true)
      .not('hospital_id', 'is', null); // กรองเฉพาะโค้ชที่มี hospital_id

    // ✅ กรองตาม hospital_ids ถ้ามีการระบุ
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
      console.log('🔒 [getCoachesByUserHospital] Filtering by hospitalIds:', hospitalIds);
    } else {
      console.log('👑 [getCoachesByUserHospital] No hospital filter - showing all coaches');
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getCoachesByUserHospital] Error:', error);
      return [];
    }

    // ✅ กรองเอาเฉพาะโค้ชที่มี hospital_id และ hospital name
    const filteredCoaches = (data || []).filter(coach => 
      coach.hospital_id && coach.hospitals?.name
    );

    console.log('✅ [getCoachesByUserHospital] Fetched:', filteredCoaches.length, 'coaches with hospitals');
    console.log('📋 [getCoachesByUserHospital] Coaches:', filteredCoaches.map(c => ({
      name: c.full_name_th,
      hospital: c.hospitals?.name,
      hospital_id: c.hospital_id
    })));

    return filteredCoaches;
  } catch (err) {
    console.error('❌ [getCoachesByUserHospital] Exception:', err);
    return [];
  }
}

// ✅ ฟังก์ชันดึงโค้ชพร้อมข้อมูลโรงพยาบาล (กรองตาม hospitalIds)
export async function getCoachesByHospitals(hospitalIds: string[]) {
  try {
    console.log('👨‍⚕️ [getCoachesByHospitals] Loading coaches for hospitals:', hospitalIds);
    let query = supabase
      .from('doctors')
      .select(`
        id,
        user_id,
        full_name_th,
        specialization_th,
        is_active,
        is_verified,
        users (
          hospital_id,
          role,
          admin_type,
          hospitals (
            id,
            name,
            code,
            type
          )
        )
      `)
      .eq('is_active', true)
      .in('role', ['doctor', 'helper']);

    // ✅ กรองตามโรงพยาบาลที่ระบุ
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getCoachesByHospitals] Error:', error);
      return [];
    }

    console.log('✅ [getCoachesByHospitals] Loaded:', data?.length || 0, 'coaches');
    return data || [];
  } catch (err) {
    console.error('❌ [getCoachesByHospitals] Exception:', err);
    return [];
  }
}
// ✅ โหลดโค้ชพร้อมข้อมูลโรงพยาบาล (แก้ไขแล้ว)
export async function getCoachesWithHospitals(hospitalIds?: string[]) {
  try {
    console.log('👨‍⚕️ [getCoachesWithHospitals] Loading coaches...', hospitalIds);
    
    // ✅ Query ที่ join กับ users และ hospitals
    let query = supabase
      .from('doctors')
      .select(`
        id, 
        user_id, 
        full_name_th, 
        specialization_th, 
        is_active, 
        is_verified, 
        users!users_id_fkey ( 
          hospital_id, 
          role, 
          admin_type, 
          is_active, 
          hospitals!users_hospital_id_fkey ( 
            id, 
            name, 
            code, 
            type, 
            parent_id 
          ) 
        )
      `)
      .eq('is_active', true)
      .eq('users.is_active', true);
    
    // ✅ กรองตาม hospitalIds ถ้ามี (สำหรับ Hospital Admin)
    if (hospitalIds && hospitalIds.length > 0) {
      console.log('🔒 [getCoachesWithHospitals] Filtering by hospitalIds:', hospitalIds);
      query = query.in('users.hospital_id', hospitalIds);
    }

    const { data, error } = await query.order('full_name_th', { ascending: true });

    if (error) {
      console.error('❌ [getCoachesWithHospitals] Error:', error);
      return [];
    }

    console.log('📊 [getCoachesWithHospitals] Raw data type:', typeof data);
    console.log('📊 [getCoachesWithHospitals] Is array:', Array.isArray(data));
    console.log('📊 [getCoachesWithHospitals] First item type:', typeof data?.[0]);

    // ✅ กรองเอาเฉพาะ coaches ที่มี hospital_id
    const coachesWithHospitals = (data || []).filter(coach => 
      coach?.users?.hospital_id && coach?.users?.hospitals?.name
    );

    console.log('✅ [getCoachesWithHospitals] Loaded:', coachesWithHospitals.length, 'coaches');
    console.log('📋 [getCoachesWithHospitals] Sample coach:', coachesWithHospitals[0]);
    
    return coachesWithHospitals;
  } catch (err) {
    console.error('❌ [getCoachesWithHospitals] Exception:', err);
    return [];
  }
}

// =====================================================
// 🆔 ID Card Assignment Functions (ใหม่)
// =====================================================

/**
บันทึกการบรรจุ ID Card
*/
export async function assignIdCard(data: {
  id_card: string;
  hospital_id: string;
  assigned_by: string;
  notes?: string;
}) {
  try {
    console.log('📝 [assignIdCard] Assigning ID Card:', data.id_card);
    const { data: assignment, error } = await supabase
      .from('id_card_assignments')
      .insert({
        id_card: data.id_card,
        hospital_id: data.hospital_id,
        assigned_by: data.assigned_by,
        notes: data.notes || null,
        status: 'active',
      })
      .select(`*, hospitals ( id, name, code ), assigned_by_user:users!assigned_by ( id, full_name_th )`)
      .single();

    if (error) {
      console.error('❌ [assignIdCard] Error:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ [assignIdCard] Assigned successfully');
    return { success: true, data: assignment };
  } catch (err: any) {
    console.error('❌ [assignIdCard] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
ดึงรายการ ID Card ที่บรรจุแล้ว (กรองตามโรงพยาบาล)
*/
export async function getIdCardAssignments(hospitalIds?: string[], status?: string) {
  try {
    console.log('📋 [getIdCardAssignments] Fetching assignments...');
    let query = supabase
      .from('id_card_assignments')
      .select(`*, hospitals ( id, name, code, type ), assigned_by_user:users!assigned_by ( id, full_name_th )`)
      .order('assigned_at', { ascending: false });

    // กรองตามโรงพยาบาล
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    // กรองตามสถานะ
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getIdCardAssignments] Error:', error);
      return [];
    }

    console.log('✅ [getIdCardAssignments] Fetched:', data?.length || 0, 'assignments');
    return data || [];
  } catch (err) {
    console.error('❌ [getIdCardAssignments] Exception:', err);
    return [];
  }
}

/**
ตรวจสอบว่า ID Card นี้ถูกบรรจุแล้วหรือไม่
*/
export async function checkIdCardAssignment(idCard: string) {
  try {
    const { data, error } = await supabase
      .from('id_card_assignments')
      .select(`*, hospitals ( id, name, code )`)
      .eq('id_card', idCard)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [checkIdCardAssignment] Error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('❌ [checkIdCardAssignment] Exception:', err);
    return null;
  }
}

/**
อัปเดตสถานะการบรรจุ
*/
export async function updateIdCardAssignment(
  assignmentId: string,
  data: {
    status?: string;
    notes?: string;
    hospital_id?: string;
  }
) {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.hospital_id) updateData.hospital_id = data.hospital_id;

    const { error } = await supabase
      .from('id_card_assignments')
      .update(updateData)
      .eq('id', assignmentId);

    if (error) {
      console.error('❌ [updateIdCardAssignment] Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('❌ [updateIdCardAssignment] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
ยกเลิกการบรรจุ
*/
export async function cancelIdCardAssignment(assignmentId: string) {
  try {
    const { error } = await supabase
      .from('id_card_assignments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId);

    if (error) {
      console.error('❌ [cancelIdCardAssignment] Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('❌ [cancelIdCardAssignment] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
ดึงสถิติการบรรจุ ID Card
*/
export async function getIdCardAssignmentStats(hospitalIds?: string[]) {
  try {
    let query = supabase
      .from('id_card_assignments')
      .select('*', { count: 'exact', head: true });

    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { count: total } = await query;

    // นับแยกตามสถานะ
    let activeQuery = supabase
      .from('id_card_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    let completedQuery = supabase
      .from('id_card_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    if (hospitalIds && hospitalIds.length > 0) {
      activeQuery = activeQuery.in('hospital_id', hospitalIds);
      completedQuery = completedQuery.in('hospital_id', hospitalIds);
    }

    const { count: active } = await activeQuery;
    const { count: completed } = await completedQuery;

    return {
      total: total || 0,
      active: active || 0,
      completed: completed || 0,
      pending: (total || 0) - (active || 0) - (completed || 0),
    };
  } catch (err) {
    console.error('❌ [getIdCardAssignmentStats] Error:', err);
    return { total: 0, active: 0, completed: 0, pending: 0 };
  }
}

// =====================================================
// 🎫 ID Card Sequence & Generator Functions (ใหม่)
// =====================================================

/**
✅ ดึงข้อมูลลำดับปัจจุบันจากฐานข้อมูล
*/
export async function getIdSequence(
  sequenceType: 'patient' | 'staff' | 'osm',
  prefix: string = '1',
  provinceCode: string = '1000'
) {
  try {
    console.log(`🔍 [getIdSequence] Fetching for ${sequenceType}...`);
    const { data, error } = await supabase
      .from('id_sequences')
      .select('*')
      .eq('sequence_type', sequenceType)
      .eq('prefix', prefix)
      .eq('province_code', provinceCode)
      .single();

    if (error) {
      console.error('❌ [getIdSequence] Error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('❌ [getIdSequence] Exception:', err);
    return null;
  }
}

/**
✅ อัปเดตและเพิ่มลำดับ (Atomic increment)
*/
export async function incrementIdSequence(
  sequenceType: 'patient' | 'staff' | 'osm',
  prefix: string = '1',
  provinceCode: string = '1000',
  incrementBy: number = 1
) {
  try {
    console.log(`🔄 [incrementIdSequence] Incrementing ${sequenceType} by ${incrementBy}...`);
    const { data, error } = await supabase
      .from('id_sequences')
      .update({
        current_sequence: supabase.rpc('increment_sequence', {
          current_val: incrementBy
        }), // ใช้ RPC สำหรับ atomic update หรือใช้วิธีด้านล่าง
        updated_at: new Date().toISOString()
      })
      .eq('sequence_type', sequenceType)
      .eq('prefix', prefix)
      .eq('province_code', provinceCode)
      .select()
      .single();

    // ✅ Fallback ถ้าไม่มี RPC: ใช้วิธีธรรมดา (อาจมี race condition)
    if (error) {
      // ดึงค่าปัจจุบัน
      const { data: current } = await supabase
        .from('id_sequences')
        .select('current_sequence')
        .eq('sequence_type', sequenceType)
        .eq('prefix', prefix)
        .eq('province_code', provinceCode)
        .single();

      if (current) {
        const newValue = (current.current_sequence || 1) + incrementBy;
        const { data: updated, error: updateError } = await supabase
          .from('id_sequences')
          .update({ 
            current_sequence: newValue,
            updated_at: new Date().toISOString()
          })
          .eq('sequence_type', sequenceType)
          .eq('prefix', prefix)
          .eq('province_code', provinceCode)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('❌ [incrementIdSequence] Error:', err);
    return null;
  }
}

/**
✅ คำนวณ Check Digit สำหรับบัตรประชาชนไทย (13 หลัก)
สูตร: (11 - (sum % 11)) % 10
*/
function calculateCheckDigit(first12Digits: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(first12Digits[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit.toString();
}

/**
✅ สร้างเลขบัตรประชาชนจำลอง 13 หลัก พร้อม Check Digit ที่ถูกต้อง
@param prefix - หลักแรก (1-8) สำหรับประเภทการลงทะเบียน
@param provinceCode - รหัสจังหวัด 4 หลัก (เช่น 1000 = กรุงเทพฯ)
@param sequenceNum - ลำดับที่ (5-6 หลัก)
@returns string - บัตรประชาชน 13 หลัก
*/
export function generateDummyIdCard(
  prefix: string = '1',
  provinceCode: string = '1000',
  sequenceNum: number
): string {
  // ✅ Validate input
  if (!/^[1-8]$/.test(prefix)) {
    console.warn('⚠️ Invalid prefix, using default "1"');
    prefix = '1';
  }

  // ✅ Format sequence number to 5 digits (pad with zeros)
  const sequenceStr = sequenceNum.toString().padStart(5, '0');

  // ✅ Build first 12 digits: Prefix(1) + Province(4) + Sequence(5) + Group(2)
  // Group code: ใช้ 00-99 สุ่มหรือใช้จาก sequence
  const groupCode = Math.floor(sequenceNum / 100000).toString().padStart(2, '0').slice(-2);

  const first12 = `${prefix}${provinceCode}${sequenceStr}${groupCode}`;

  // ✅ Calculate check digit (หลักที่ 13)
  const checkDigit = calculateCheckDigit(first12);

  // ✅ Return full 13-digit ID
  return `${first12}${checkDigit}`;
}

/**
✅ ฟังก์ชันรวม: สร้างบัตรประชาชนใหม่พร้อมอัปเดตลำดับในฐานข้อมูล
@param sequenceType - ประเภท: 'patient' | 'staff' | 'osm'
@param prefix - หลักแรก (1-8)
@param provinceCode - รหัสจังหวัด 4 หลัก
@returns { success: boolean, idCard?: string, error?: string }
*/
export async function generateAndReserveIdCard(
  sequenceType: 'patient' | 'staff' | 'osm',
  prefix: string = '1',
  provinceCode: string = '1000'
) {
  try {
    // ✅ 1. ดึงลำดับปัจจุบัน
    const sequence = await getIdSequence(sequenceType, prefix, provinceCode);
    if (!sequence) {
      return {
        success: false,
        error: 'ไม่พบข้อมูลลำดับในฐานข้อมูล'
      };
    }

    const currentSeq = sequence.current_sequence || 1;

    // ✅ 2. สร้างบัตรประชาชน
    const idCard = generateDummyIdCard(prefix, provinceCode, currentSeq);

    // ✅ 3. อัปเดตลำดับสำหรับครั้งต่อไป
    await incrementIdSequence(sequenceType, prefix, provinceCode, 1);

    console.log(`✅ [generateAndReserveIdCard] Generated: ${idCard} (seq: ${currentSeq})`);

    return {
      success: true,
      idCard,
      sequenceNumber: currentSeq
    };
  } catch (err: any) {
    console.error('❌ [generateAndReserveIdCard] Error:', err);
    return {
      success: false,
      error: err.message || 'เกิดข้อผิดพลาดในการสร้างบัตรประชาชน'
    };
  }
}

/**
✅ ตรวจสอบความถูกต้องของบัตรประชาชนไทย (13 หลัก)
@param idCard - เลขบัตร 13 หลัก
@returns boolean - ถูกต้องหรือไม่
*/
export function validateThaiIdCard(idCard: string): boolean {
  // ✅ ลบช่องว่างและขีดกลาง
  const cleaned = idCard.replace(/[\s-]/g, '');

  // ✅ ต้องมี 13 หลักและเป็นตัวเลขทั้งหมด
  if (!/^\d{13}$/.test(cleaned)) {
    return false;
  }

  // ✅ คำนวณและตรวจสอบ Check Digit
  const providedCheck = parseInt(cleaned[12]);
  const calculatedCheck = parseInt(calculateCheckDigit(cleaned.slice(0, 12)));

  return providedCheck === calculatedCheck;
}

/**
Format บัตรประชาชนให้อ่านง่าย: 1-1234-56789-01-2
*/
export function formatIdCard(idCard: string): string {
  const cleaned = idCard.replace(/[\s-]/g, '');
  if (cleaned.length !== 13) return idCard;
  return `${cleaned[0]}-${cleaned.slice(1,5)}-${cleaned.slice(5,10)}-${cleaned.slice(10,12)}-${cleaned[12]}`;
}

/**
ดึงรายการ ID Card ที่ยังไม่ได้บรรจุ (Pending)
รวมข้อมูลจากทั้ง pending_staff และ approved users ที่ยังไม่มี assignment
*/
export async function getPendingIdCards(hospitalIds?: string[]) {
  try {
    console.log('⏳ [getPendingIdCards] Fetching pending ID cards...');
    // ✅ 1. ดึงจาก pending_staff (รออนุมัติ)
    let pendingQuery = supabase
      .from('pending_staff')
      .select(`*, hospitals ( id, name, code )`)
      .eq('status', 'pending');

    if (hospitalIds && hospitalIds.length > 0) {
      pendingQuery = pendingQuery.in('hospital_id', hospitalIds);
    }

    const { data: pendingData, error: pendingError } = await pendingQuery;
    if (pendingError) {
      console.error('❌ [getPendingIdCards] Error fetching pending:', pendingError);
    }

    // ✅ 2. ดึงจาก users ที่ approved แล้ว แต่ยังไม่มี ID Card assignment
    let staffQuery = supabase
      .from('users')
      .select(`id, id_card, role, hospital_id, created_at, doctors ( full_name_th, specialization_th ), hospitals ( id, name, code )`)
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', true)
      .not('id_card', 'is', null);

    if (hospitalIds && hospitalIds.length > 0) {
      staffQuery = staffQuery.in('hospital_id', hospitalIds);
    }

    const { data: staffData, error: staffError } = await staffQuery;
    if (staffError) {
      console.error('❌ [getPendingIdCards] Error fetching staff:', staffError);
    }

    // ✅ 3. ดึง ID Card ที่มีการบรรจุแล้ว
    const { data: assignments } = await supabase
      .from('id_card_assignments')
      .select('id_card')
      .eq('status', 'active');

    const assignedCards = new Set(assignments?.map(a => a.id_card) || []);

    // ✅ 4. รวมข้อมูลจากทั้ง 2 แหล่ง และกรองเอาเฉพาะที่ยังไม่มีการบรรจุ
    const pendingCards: any[] = [];

    // จาก pending_staff
    if (pendingData) {
      pendingData.forEach(item => {
        if (!assignedCards.has(item.id_card)) {
          pendingCards.push({
            ...item,
            source: 'pending',
            full_name_th: item.full_name_th,
            hospitals: item.hospitals
          });
        }
      });
    }

    // จาก approved staff
    if (staffData) {
      staffData.forEach(staff => {
        if (staff.id_card && !assignedCards.has(staff.id_card)) {
          pendingCards.push({
            id: staff.id,
            id_card: staff.id_card,
            full_name_th: staff.doctors?.full_name_th || '-',
            role: staff.role,
            hospital_id: staff.hospital_id,
            hospitals: staff.hospitals,
            created_at: staff.created_at,
            specialization_th: staff.doctors?.specialization_th,
            source: 'approved'
          });
        }
      });
    }

    console.log('✅ [getPendingIdCards] Found:', pendingCards.length, 'pending ID cards');
    return pendingCards;
  } catch (err) {
    console.error('❌ [getPendingIdCards] Exception:', err);
    return [];
  }
}

// ✅ แก้ไข: เพิ่ม 'admin' ใน type definition และเงื่อนไขสร้าง doctor record
export async function addStaff(data: {
  id_card: string;
  password: string;
  full_name_th: string;
  // ✅ เพิ่ม 'admin' และ 'osm' ใน type
  role: 'doctor' | 'helper' | 'osm' | 'admin';
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;
  birth_date?: string;
  created_by: string;
  admin_type?: 'super' | 'hospital' | null;  // ✅ เพิ่ม field นี้
}) {
  try {
    console.log('🔍 [addStaff] Starting staff creation...', { 
      role: data.role, 
      admin_type: data.admin_type 
    });

    // ✅ 1. สร้าง user ในตาราง users
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: data.role,
        is_active: true,
        created_by: data.created_by,
        hospital_id: data.hospital_id || null,
        birth_date: data.birth_date || null,
        // ✅ สำคัญ: ส่ง admin_type ไปบันทึกด้วย
        admin_type: data.admin_type || null,
      })
      .select()
      .single();

    if (userError) {
      console.error('❌ [addStaff] Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ [addStaff] User created:', user.id);

    // ✅ 2. ประกาศ doctorData ก่อน if block
    let doctorData: any = null;

    // ✅ 3. สร้าง record ในตาราง doctors (สำหรับ doctor/helper/osm/admin)
    if (['doctor', 'helper', 'osm', 'admin'].includes(data.role)) {
      console.log('💾 [addStaff] Creating doctor record for role:', data.role);
      
      const specialization = data.specialization_th?.trim() || (
        data.role === 'osm' ? 'อาสาสมัครสาธารณสุข' : 
        data.role === 'helper' ? 'เจ้าหน้าที่สาธารณสุข' : 
        data.role === 'admin' ? 'ผู้ดูแลระบบ' :  // ✅ เพิ่มกรณี admin
        'แพทย์'
      );

      const { data: doctorDataResult, error: doctorError } = await supabase
        .from('doctors')
        .insert({
          user_id: user.id,
          full_name: data.full_name_th.trim(),  // ✅ trim ชื่อ
          full_name_th: data.full_name_th.trim(),
          specialization_th: specialization,
          phone: data.phone || null,
          email: data.email || null,
          is_active: true,
          is_verified: false,
        })
        .select()
        .single();

      if (doctorError) {
        console.error('❌ [addStaff] Error creating doctor:', doctorError);
        // ⚠️ Rollback user ถ้าสร้าง doctors ล้มเหลว
        await supabase.from('users').delete().eq('id', user.id);
        return { success: false, error: doctorError.message };
      }

      doctorData = doctorDataResult;
      console.log('✅ [addStaff] Doctor record created:', doctorData.id);
    }

    console.log('✅ [addStaff] Staff creation completed!');

    return { 
      success: true, 
      user,
      doctor: doctorData
    };

  } catch (err: any) {
    console.error('❌ [addStaff] Unexpected error:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด' };
  }
}

// =====================================================
// 📥 Import Patients from Excel Functions
// =====================================================

/**
 * แปลงวันที่จาก วว/ดด/ปปปป (พ.ศ.) เป็น YYYY-MM-DD (ค.ศ.)
 */
export function convertThaiDateToISO(thaiDateStr: string): string | null {
  if (!thaiDateStr) return null;
  
  const dateRegex = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/;
  const match = thaiDateStr.match(dateRegex);
  
  if (!match) return null;
  
  const [, day, month, year] = match;
  const yearAD = parseInt(year) - 543; // แปลง พ.ศ. เป็น ค.ศ.
  
  return `${yearAD}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * ค้นหาโรงพยาบาลจากชื่อ (case-insensitive)
 */
export async function findHospitalByName(hospitalName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('hospitals')
      .select('id')
      .ilike('name', hospitalName.trim())
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      console.error('❌ [findHospitalByName] Not found:', hospitalName);
      return null;
    }
    
    return data.id;
  } catch (err) {
    console.error('❌ [findHospitalByName] Error:', err);
    return null;
  }
}

/**
 * ค้นหาโค้ชจากชื่อเต็ม (case-insensitive)
 */
export async function findCoachByFullName(coachFullName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('user_id')
      .ilike('full_name_th', coachFullName.trim())
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      console.error('❌ [findCoachByFullName] Not found:', coachFullName);
      return null;
    }
    
    return data.user_id;
  } catch (err) {
    console.error('❌ [findCoachByFullName] Error:', err);
    return null;
  }
}

/**
 * ✅ ฟังก์ชันนำเข้าผู้ป่วยแบบ Batch
 * @param rows - ข้อมูลผู้ป่วยจาก Excel (array ของ objects)
 * @param createdBy - ID ของผู้ใช้ที่นำเข้า
 * @returns { success: number, failed: number, errors: Array }
 */
/**
 * ✅ ฟังก์ชันนำเข้าผู้ป่วยแบบ Batch
 */
export async function importPatientsBatch(
  rows: Array<{
    id_card: string;
    first_name: string;
    last_name: string;
    hospital_number: string;
    birth_date: string;
    gender: string;
    hospital_name: string;
    phone?: string;
    email?: string;
    current_weight?: string;
    height?: string;
    waist_circumference?: string;
    diabetes_type?: string;
    blood_sugar?: string;
    hba1c_level?: string;
    notes?: string;
    house_number?: string;
    village_no?: string;
    village_name?: string;
    soi?: string;
    road?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    postal_code?: string;
    address_line1?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
    coach_name?: string;
  }>,
  createdBy: string
) {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ row: number; id_card: string; hospital_number: string; error: string }>
  };

  console.log(`📥 [importPatientsBatch] Starting import of ${rows.length} patients...`);

  // ✅ โหลดข้อมูล hospitals, coaches และ users (เพื่อเช็คเลขบัตรประชาชนซ้ำ) ล่วงหน้า
  const { data: allHospitals } = await supabase.from('hospitals').select('id, name').eq('is_active', true);
  const { data: allCoaches } = await supabase.from('doctors').select('user_id, full_name_th').eq('is_active', true);
  
  // ✅ โหลดเลขบัตรประชาชนทั้งหมดที่มีในระบบเพื่อเช็ค Duplicate แบบเร็ว
  const { data: existingUsers } = await supabase.from('users').select('id_card');
  const existingIdCards = new Set(existingUsers?.map(u => u.id_card) || []);

  const hospitalMap = new Map<string, string>();
  allHospitals?.forEach(h => hospitalMap.set(h.name.toLowerCase().trim(), h.id));

  const coachMap = new Map<string, string>();
  allCoaches?.forEach(c => coachMap.set(c.full_name_th.toLowerCase().trim(), c.user_id));

  // ✅ ประมวลผลทีละแถว
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;

    try {
      // 1. แปลงเพศ
      const genderMap: Record<string, string> = { 'ชาย': 'male', 'หญิง': 'female' };
      const gender = genderMap[row.gender] || row.gender.toLowerCase();

      // 2. แปลงวันที่
      const birthDateISO = convertThaiDateToISO(row.birth_date);
      if (!birthDateISO) throw new Error(`รูปแบบวันเกิดไม่ถูกต้อง: ${row.birth_date}`);

      // 3. ✅ เช็คเลขบัตรประชาชนซ้ำ (Duplicate Check)
      const cleanIdCard = row.id_card.replace(/\D/g, '');
      if (existingIdCards.has(cleanIdCard)) {
        throw new Error('เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว');
      }

      // 4. ค้นหา hospital_id
      let hospitalId = hospitalMap.get(row.hospital_name.toLowerCase().trim());
      if (!hospitalId) hospitalId = await findHospitalByName(row.hospital_name);
      if (!hospitalId) throw new Error(`ไม่พบโรงพยาบาล: ${row.hospital_name}`);

      // 5. ค้นหา coach_id
      let coachId: string | undefined = undefined;
      if (row.coach_name && row.coach_name.trim()) {
        coachId = coachMap.get(row.coach_name.toLowerCase().trim());
        if (!coachId) coachId = await findCoachByFullName(row.coach_name);
      }

      // 6. สร้างรหัสผ่าน
      const password = row.birth_date;

      // 7. Insert user
      const { data: user, error: userError } = await supabase
        .from('users')
        .insert({
          id_card: cleanIdCard,
          password_hash: password,
          role: 'patient',
          is_active: true,
          created_by: createdBy,
          hospital_id: hospitalId,
        })
        .select()
        .single();

      if (userError) {
        if (userError.code === '23505') throw new Error('เลขบัตรประชาชนซ้ำ (Unique Violation)');
        throw userError;
      }

      // 8. Insert profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        first_name: row.first_name.trim(),
        last_name: row.last_name.trim(),
        hospital_number: row.hospital_number.trim(),
        birth_date: birthDateISO,
        gender: gender,
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        current_weight: row.current_weight ? parseFloat(row.current_weight) : null,
        height: row.height ? parseFloat(row.height) : null,
        waist_circumference: row.waist_circumference ? parseFloat(row.waist_circumference) : null,
        diabetes_type: row.diabetes_type?.trim() || null,
        blood_sugar: row.blood_sugar ? parseFloat(row.blood_sugar) : null,
        hba1c_level: row.hba1c_level ? parseFloat(row.hba1c_level) : null,
        notes: row.notes?.trim() || null,
        house_number: row.house_number?.trim() || null,
        village_no: row.village_no?.trim() || null,
        village_name: row.village_name?.trim() || null,
        soi: row.soi?.trim() || null,
        road: row.road?.trim() || null,
        subdistrict: row.subdistrict?.trim() || null,
        district: row.district?.trim() || null,
        province: row.province?.trim() || null,
        postal_code: row.postal_code?.trim() || null,
        address_line1: row.address_line1?.trim() || null,
        emergency_contact_name: row.emergency_contact_name?.trim() || null,
        emergency_contact_phone: row.emergency_contact_phone?.trim() || null,
        emergency_contact_relationship: row.emergency_contact_relationship?.trim() || null,
        hospital_id: hospitalId,
        coach_id: coachId || null,
        pam_level: 'L0',
        pam_score: 0,
        zone: 'Zero Zone',
        current_step: 'Starter',
        is_active: true,
        status: 'active',
      });

      if (profileError) {
        if (profileError.code === '23505') {
          throw new Error('HN ซ้ำในโรงพยาบาลนี้');
        }
        await supabase.from('users').delete().eq('id', user.id);
        throw profileError;
      }

      results.success++;

    } catch (error: any) {
      results.failed++;
      results.errors.push({
        row: rowIndex,
        id_card: row.id_card,
        hospital_number: row.hospital_number,
        error: error.message || 'เกิดข้อผิดพลาด'
      });
      console.error(`❌ Row ${rowIndex} failed:`, error.message);
    }
  }

  return results;
}
