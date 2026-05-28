// lib/supabase/queries.ts
// ✅ แก้ไขล่าสุด: 18 พฤษภาคม 2569
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
  
  if (!userId || !userData) return null;
  
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
// 👤 Super Admin System Functions
// =====================================================
export function isSuperAdmin(userData: any): boolean {
  if (!userData) return false;
  return userData.admin_type === 'super' || userData.role === 'super_admin';
}

export function isHospitalAdmin(userData: any): boolean {
  if (!userData) return false;
  return userData.admin_type === 'hospital' ||
    (userData.role === 'admin' && userData.hospital_id);
}

export async function getAccessibleHospitalIds(userId: string): Promise<string[]> {
  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, admin_type, hospital_id')
      .eq('id', userId)
      .single();

    if (userError || !userData) return [];

    if (isSuperAdmin(userData)) return [];
    if (!userData.hospital_id) return [];

    const { data: hospitalData, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', userData.hospital_id)
      .single();

    if (hospitalError || !hospitalData) return [];

    if (hospitalData.type === 'main') {
      const accessibleIds: string[] = [hospitalData.id];
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospitalData.id)
        .eq('is_active', true);
      if (subHospitals && subHospitals.length > 0) {
        subHospitals.forEach(sub => accessibleIds.push(sub.id));
      }
      return accessibleIds;
    } else if (hospitalData.type === 'sub') {
      return [hospitalData.id];
    }
    return [];
  } catch (err) {
    console.error('❌ [getAccessibleHospitalIds] Exception:', err);
    return [];
  }
}

export async function getUserHospitalInfo(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`hospital_id, hospitals ( id, name, code, type, parent_id, parent_hospital:hospitals!parent_id ( id, name, code ) )`)
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data.hospitals;
  } catch (err) {
    console.error('Error fetching user hospital info:', err);
    return null;
  }
}

export function checkAdminPermission(userData: any, requiredType?: 'super' | 'hospital'): boolean {
  if (!userData) return false;
  if (!requiredType) {
    return userData.role === 'admin' ||
      userData.admin_type === 'super' ||
      userData.admin_type === 'hospital';
  }
  if (requiredType === 'super') return isSuperAdmin(userData);
  if (requiredType === 'hospital') return isHospitalAdmin(userData);
  return false;
}

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

// =====================================================
// 👥 Patient Management Functions
// =====================================================

// =====================================================
// 👥 Patient Management Functions
// =====================================================// =====================================================
// 👥 Patient Management Functions
// =====================================================

// =====================================================
// 👥 Patient Management Functions
// =====================================================

// =====================================================
// 👥 Patient Management Functions
// =====================================================
// lib/supabase/queries.ts

export async function getPatientList(
  search?: string,
  pamLevel?: string,
  hospitalIds?: string[],
  hospitalId?: string,
  coachId?: string
) {
  try {
    console.log('🔍 [getPatientList] params:', { search, pamLevel, hospitalIds, hospitalId, coachId });

    let query = supabase
      .from('profiles')
      .select(`
        *,
        hospitals:profiles_hospital_id_fkey (
          id, name, code, type
        )
      `)
      .eq('is_active', true);

    // 1. สิทธิ์การเข้าถึงโรงพยาบาล
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    // 2. กรองตามโรงพยาบาล (ฟิลเตอร์)
    if (hospitalId && hospitalId !== 'all') {
      query = query.eq('hospital_id', hospitalId);
    }

    // 3. กรองตามโค้ช
    if (coachId && coachId !== 'all') {
      query = query.eq('coach_id', coachId);
    }

    // 4. กรองตาม PAM level
    if (pamLevel) {
      query = query.eq('pam_level', pamLevel);
    }

    // 5. ค้นหาด้วยชื่อหรือ HN
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,hospital_number.ilike.%${search}%`
      );
    }

    const { data: profiles, error } = await query;
    if (error) {
      console.error('❌ [getPatientList] Supabase Error:', error);
      return [];
    }

    if (!profiles || profiles.length === 0) return [];

    // ดึงข้อมูล users (id_card, role, is_active, created_at) สำหรับผู้ป่วยทั้งหมด
    const userIds = profiles.map(p => p.id);
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, id_card, role, is_active, created_at')
      .in('id', userIds);
    if (usersError) {
      console.error('❌ [getPatientList] Users Error:', usersError);
    }
    const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);

    // ดึงชื่อโค้ชจาก doctors table (coach_id -> users.id -> doctors.user_id)
    const coachIds = profiles.map(p => p.coach_id).filter(Boolean);
    let coachesMap = new Map();
    if (coachIds.length > 0) {
      const { data: doctorsData, error: doctorsError } = await supabase
        .from('doctors')
        .select('user_id, full_name_th')
        .in('user_id', coachIds);
      if (!doctorsError && doctorsData) {
        coachesMap = new Map(doctorsData.map(d => [d.user_id, d.full_name_th]));
      }
    }

    // รวมข้อมูล
    const patients = profiles.map(profile => ({
      ...profile,
      users: usersMap.get(profile.id) || null,
      coach_name: coachesMap.get(profile.coach_id) || null,
      full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    }));

    console.log('✅ [getPatientList] Loaded:', patients.length, 'patients');
    return patients;
  } catch (err) {
    console.error('❌ [getPatientList] Exception:', err);
    return [];
  }
}

export async function getDeletedPatients() {
  try {
    // ดึงข้อมูล profiles ที่ถูกลบ
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(`
        *,
        hospitals:profiles_hospital_id_fkey (
          id, name, code, type
        )
      `)
      .eq('is_active', false)
      .order('updated_at', { ascending: false });

    if (error) return [];

    if (!profiles || profiles.length === 0) return [];

    // ดึงข้อมูล users
    const userIds = profiles.map(p => p.id);
    const { data: usersData } = await supabase
      .from('users')
      .select('id, id_card, role, is_active')
      .in('id', userIds);
    const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);

    return profiles.map(profile => ({
      ...profile,
      users: usersMap.get(profile.id) || null,
      full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    }));
  } catch (err) {
    console.error('❌ [getDeletedPatients] Exception:', err);
    return [];
  }
}

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

export async function getPatientDetail(userId: string) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`*, hospitals ( id, name, code, type )`)
      .eq('id', userId)
      .single();
    if (profileError) return null;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id_card, role, is_active, created_at')
      .eq('id', userId)
      .single();
    if (userError) return null;

    return {
      ...profile,
      full_name: profile.first_name && profile.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : '',
      users: userData
    };
  } catch (err) {
    console.error('❌ Get patient detail error:', err);
    return null;
  }
}

export async function deletePatient(patientId: string) {
  try {
    await supabase.from('profiles').update({ is_active: false, status: 'inactive', updated_at: new Date().toISOString() }).eq('id', patientId);
    await supabase.from('users').update({ is_active: false }).eq('id', patientId);
    return { success: true };
  } catch (err) {
    console.error('Delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วย' };
  }
}

export async function restorePatient(patientId: string) {
  try {
    await supabase.from('profiles').update({ is_active: true, status: 'active', updated_at: new Date().toISOString() }).eq('id', patientId);
    await supabase.from('users').update({ is_active: true }).eq('id', patientId);
    return { success: true };
  } catch (err) {
    console.error('Restore patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนผู้ป่วย' };
  }
}

export async function permanentlyDeletePatient(patientId: string) {
  try {
    const screenings = await supabase.from('screenings').select('id').eq('user_id', patientId);
    if (screenings.data && screenings.data.length > 0) {
      await supabase.from('screening_responses').delete().in('screening_id', screenings.data.map((s: any) => s.id));
    }
    await supabase.from('appointment_followups').delete().eq('user_id', patientId);
    await supabase.from('goals').delete().eq('user_id', patientId);
    await supabase.from('records').delete().eq('user_id', patientId);
    await supabase.from('screenings').delete().eq('user_id', patientId);
    await supabase.from('appointments').delete().eq('user_id', patientId);
    await supabase.from('profiles').delete().eq('id', patientId);
    await supabase.from('users').delete().eq('id', patientId);
    return { success: true };
  } catch (err) {
    console.error('Permanent delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วยถาวร' };
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
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (role) query = query.eq('role', role);
    const { data, error } = await query;
    if (error) return [];
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
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', false)
      .order('created_at', { ascending: false });
    if (error) return [];
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
    const updateUserData: any = {};
    if (data.birth_date !== undefined) updateUserData.birth_date = data.birth_date;
    if (data.password_hash !== undefined) updateUserData.password_hash = data.password_hash;
    if (data.hospital_id !== undefined) updateUserData.hospital_id = data.hospital_id;
    if (Object.keys(updateUserData).length > 0) {
      updateUserData.updated_at = new Date().toISOString();
      const { error: userError } = await supabase.from('users').update(updateUserData).eq('id', userId);
      if (userError) return { success: false, error: userError.message };
    }

    const updateDoctorData: any = { updated_at: new Date().toISOString() };
    if (data.full_name_th !== undefined) updateDoctorData.full_name_th = data.full_name_th;
    if (data.specialization_th !== undefined) updateDoctorData.specialization_th = data.specialization_th;
    if (data.is_active !== undefined) updateDoctorData.is_active = data.is_active;

    const { error } = await supabase.from('doctors').update(updateDoctorData).eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error('Update staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' };
  }
}

export async function deactivateStaff(userId: string) {
  try {
    await supabase.from('doctors').update({ is_active: false }).eq('user_id', userId);
    const { error } = await supabase.from('users').update({ is_active: false }).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error('Deactivate staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการปิดการใช้งาน' };
  }
}

export async function restoreStaff(staffId: string) {
  try {
    await supabase.from('doctors').update({ is_active: true }).eq('user_id', staffId);
    const { error } = await supabase.from('users').update({ is_active: true }).eq('id', staffId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error('Restore staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนเจ้าหน้าที่' };
  }
}

export async function permanentlyDeleteStaff(staffId: string) {
  try {
    await supabase.from('pending_staff').update({ reviewed_by: null, reviewed_at: null, rejection_reason: null }).eq('reviewed_by', staffId);
    await supabase.from('doctors').delete().eq('user_id', staffId);
    const { error: userError } = await supabase.from('users').delete().eq('id', staffId);
    if (userError) return { success: false, error: userError.message };
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
    if (error) return null;
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
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('Get hospitals error:', err);
    return [];
  }
}

export async function getHospitalsWithHierarchy() {
  try {
    const { data, error } = await supabase
      .from('hospitals')
      .select(`*, parent_hospital:hospitals!parent_id ( id, name, code )`)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });
    if (error) return [];
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
    if (hospitalId) query = query.eq('hospital_id', hospitalId);
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

export async function assignVolunteerVillage(data: { volunteer_id: string; village_id: string; }) {
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
    if (error) return [];
    const provinces = [...new Set(data?.map(v => v.province) || [])];
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
    if (error) return [];
    const districts = [...new Set(data?.map(v => v.district) || [])];
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
    if (error) return [];
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
    const { data, error } = await supabase
      .from('appointments')
      .select(`*, doctors:doctor_id ( id, full_name_th, specialization_th )`)
      .eq('user_id', patientId)
      .order('appointment_date', { ascending: true });
    if (error) return [];
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
    if (error) return { success: false, error: error.message };
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
      .select(`*, doctors ( id, full_name_th, specialization_th )`)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'confirmed', 'pending'])
      .gte('appointment_date', startOfToday.toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return null;
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
    if (error) return null;
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
    if (error) return [];
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
    if (screeningError) return { success: false, error: screeningError.message };

    const responses = data.responses.map(r => ({
      screening_id: screening.id,
      question_id: r.question_id,
      question_number: r.question_number,
      question_type: r.question_type,
      selected_option: r.selected_option,
      score: r.score,
    }));

    const { error: responsesError } = await supabase.from('screening_responses').insert(responses);
    if (responsesError) return { success: false, error: responsesError.message };

    if (data.pam_level_result) {
      const levelMap: Record<string, string> = { 'Deny': 'L1', 'General': 'L2', 'Intensive': 'L3', 'Champion': 'L4' };
      const zoneMap: Record<string, string> = { 'Deny': 'Red Zone', 'General': 'Green Zone', 'Intensive': 'Green Zone', 'Champion': 'Green Zone' };
      await supabase.from('profiles').update({
        pam_level: levelMap[data.pam_level_result] || 'L1',
        zone: zoneMap[data.pam_level_result] || 'Green Zone',
        pam_score: data.pam_total_score,
      }).eq('id', data.user_id);
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
    if (error) return [];
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
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('Get all questions error:', err);
    return [];
  }
}

// =====================================================
// 🎯 Goals Functions
// =====================================================
export async function createDefaultGoals(userId: string, pamLevel: string, createdBy: string) {
  try {
    if (pamLevel === 'L1') return { success: true, message: 'L1 - ไม่สร้างเป้าหมายอัตโนมัติ', count: 0 };
    
    const { data: existingGoals, error: checkError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');
    
    if (checkError) console.error('Error checking existing goals:', checkError);
    
    if (existingGoals && existingGoals.length > 0) {
      const goalNames = existingGoals.map(g => g.goal_name);
      const isL4ButHasL2L3Goals = pamLevel === 'L4' && goalNames.some(name => ['stop_sweet', 'reduce_rice', 'protein_vegetable', 'exercise_walk', 'record_weight_sugar'].includes(name));
      const isL2L3ButHasL4Goals = (pamLevel === 'L2' || pamLevel === 'L3') && goalNames.some(name => ['carb_control', 'protein_intake', 'water_intake', 'stretching', 'cardio', 'strengthening', 'hiit', 'sleep'].includes(name));
      
      if (isL4ButHasL2L3Goals || isL2L3ButHasL4Goals) {
        await supabase.from('goals').update({ status: 'archived', is_current: false, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('goal_type', 'weekly_activity').eq('status', 'active');
      } else {
        return { success: true, message: 'มีเป้าหมายอยู่แล้วและตรงกับ PAM Level', count: existingGoals.length, alreadyExists: true };
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const goals = [];

    if (pamLevel === 'L2' || pamLevel === 'L3') {
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', ['stop_sweet', 'reduce_rice', 'protein_vegetable', 'exercise_walk', 'record_weight_sugar'])
        .eq('is_active', true);
      
      if (activitiesError) console.error('Error fetching activities:', activitiesError);
      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null, targetUnit = null;
          if (activity.activity_code === 'exercise_walk') { targetValue = 15; targetUnit = 'minutes'; }
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
    }

    if (pamLevel === 'L4') {
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', ['carb_control', 'protein_intake', 'water_intake', 'stretching', 'cardio', 'strengthening', 'hiit', 'sleep'])
        .eq('is_active', true);
      
      if (activitiesError) console.error('Error fetching activities:', activitiesError);
      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null, targetUnit = null;
          if (activity.activity_code === 'water_intake') { targetValue = 1; targetUnit = 'liters'; }
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
    }

    if (goals.length > 0) {
      const { error } = await supabase.from('goals').insert(goals);
      if (error) return { success: false, error: error.message };
      return { success: true, count: goals.length };
    }
    return { success: true, count: 0 };
  } catch (err) {
    console.error('Create default goals error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย' };
  }
}

export async function getPatientGoals(userId: string, roundNumber?: number) {
  try {
    let query = supabase
      .from('goals')
      .select(`*, activities ( activity_code, activity_name_th, description_th )`)
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');
    
    if (roundNumber) {
      query = query.eq('round_number', roundNumber);
    } else {
      query = query.eq('is_current', true);
    }
    query = query.order('priority', { ascending: true });
    
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getPatientGoals] Exception:', err);
    return [];
  }
}

export async function getGoalRoundCount(userId: string) {
  try {
    const { data } = await supabase.from('goals').select('round_number').eq('user_id', userId).eq('goal_type', 'weekly_activity');
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
    const { data, error } = await supabase
      .from('records')
      .select(`*, activities ( activity_code, activity_name_th )`)
      .eq('user_id', userId)
      .gte('record_date', startDate.toISOString())
      .order('record_date', { ascending: false });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getPatientRecords] Exception:', err);
    return [];
  }
}

export async function updateExerciseGoal(userId: string, goalName: string, targetValue: number, targetUnit: string = 'minutes') {
  try {
    const { error } = await supabase
      .from('goals')
      .update({ target_value: targetValue, target_unit: targetUnit, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('goal_name', goalName)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');
    if (error) return { success: false, error: error.message };
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
    if (error) return null;
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
    const today = new Date().toISOString().split('T')[0];
    const { data: existingTodayGoals, error: fetchError } = await supabase
      .from('goals')
      .select('id, goal_name, created_at')
      .eq('user_id', data.user_id)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59');
    
    if (fetchError) console.error('Error fetching existing goals:', fetchError);
    
    let nextRound: number;
    if (existingTodayGoals && existingTodayGoals.length > 0) {
      nextRound = existingTodayGoals[0].round_number || 1;
      await supabase.from('goals').delete().eq('user_id', data.user_id).eq('goal_type', 'weekly_activity').eq('status', 'active').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59');
    } else {
      const { data: goalsToArchive } = await supabase.from('goals').select('id, goal_name').eq('user_id', data.user_id).eq('goal_type', 'weekly_activity').eq('status', 'active');
      if (goalsToArchive && goalsToArchive.length > 0) {
        await supabase.from('goals').update({ is_current: false, status: 'archived', updated_at: new Date().toISOString() }).eq('user_id', data.user_id).eq('goal_type', 'weekly_activity').eq('status', 'active');
      }
      const { data: allRounds } = await supabase.from('goals').select('round_number').eq('user_id', data.user_id).eq('goal_type', 'weekly_activity');
      const uniqueRounds = new Set(allRounds?.map(g => g.round_number) || []);
      nextRound = uniqueRounds.size + 1;
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

    const { error: insertError, data: insertedData } = await supabase.from('goals').insert(newGoals).select();
    if (insertError) return { success: false, error: insertError.message };
    return { success: true, round_number: nextRound, goals_count: newGoals.length };
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
      }, { onConflict: 'user_id,activity_id,record_date' })
      .select();
    if (error) return null;
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
      }, { onConflict: 'user_id,activity_id,record_date' })
      .select();
    if (error) return null;
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
      .select(`id, activity_id, is_completed, record_date, sweet_type, weight, blood_sugar, exercise_minutes`)
      .eq('user_id', userId)
      .eq('record_date', today);
    if (error) return [];
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
    if (error) return [];
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
    let patientsQuery = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true);
    if (hospitalIds && hospitalIds.length > 0) patientsQuery = patientsQuery.in('hospital_id', hospitalIds);
    const { count: totalPatients } = await patientsQuery;

    const today = new Date().toISOString().split('T')[0];
    let recordsQuery = supabase.from('records').select('*', { count: 'exact', head: true }).eq('record_date', today);
    if (hospitalIds && hospitalIds.length > 0) {
      const { data: patientIds } = await supabase.from('profiles').select('id').in('hospital_id', hospitalIds).eq('is_active', true);
      if (patientIds && patientIds.length > 0) {
        recordsQuery = recordsQuery.in('user_id', patientIds.map(p => p.id));
      } else {
        return { totalPatients: 0, todayRecords: 0, todayAppointments: 0, pendingAssessments: 0 };
      }
    }
    const { count: todayRecords } = await recordsQuery;

    let appointmentsQuery = supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', today).lte('appointment_date', today + 'T23:59:59');
    if (hospitalIds && hospitalIds.length > 0) {
      const { data: patientIds } = await supabase.from('profiles').select('id').in('hospital_id', hospitalIds).eq('is_active', true);
      if (patientIds && patientIds.length > 0) {
        appointmentsQuery = appointmentsQuery.in('user_id', patientIds.map(p => p.id));
      } else {
        return { totalPatients: 0, todayRecords: 0, todayAppointments: 0, pendingAssessments: 0 };
      }
    }
    const { count: todayAppointments } = await appointmentsQuery;

    let pendingQuery = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('pam_level', 'L1').eq('is_active', true);
    if (hospitalIds && hospitalIds.length > 0) pendingQuery = pendingQuery.in('hospital_id', hospitalIds);
    const { count: pendingAssessments } = await pendingQuery;

    return {
      totalPatients: totalPatients || 0,
      todayRecords: todayRecords || 0,
      todayAppointments: todayAppointments || 0,
      pendingAssessments: pendingAssessments || 0,
    };
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return { totalPatients: 0, todayRecords: 0, todayAppointments: 0, pendingAssessments: 0 };
  }
}

// =====================================================
// 📚 Knowledge Functions
// =====================================================
export async function getKnowledge(pamLevel: string = 'ALL') {
  try {
    const { data, error } = await supabase
      .from('knowledge')
      .select('*')
      .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return [];
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
      }, { onConflict: 'appointment_id,followup_round' })
      .select()
      .single();
    if (error) return { success: false, error: error.message };
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
    if (!data.conducted_by) throw new Error('conducted_by is required');
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
    if (error) return { success: false, error: error.message, details: error };
    return { success: true, followup };
  } catch (err: any) {
    console.error('❌ [saveAppointmentFollowupComplete] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function getPatientFollowupHistory(userId: string, limit?: number) {
  try {
    let query = supabase
      .from('appointment_followups')
      .select(`*, appointments ( appointment_date, appointment_type )`)
      .eq('user_id', userId)
      .order('followup_date', { ascending: false })
      .order('followup_round', { ascending: false });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) return [];
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
    if (error) return null;
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
    if (error) return 1;
    return (count || 0) + 1;
  } catch (err) {
    console.error('Get followup round count error:', err);
    return 1;
  }
}

// =====================================================
// 👨‍⚕️ Coach Functions
// =====================================================
export async function getAllCoaches() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, is_active, hospitals ( id, name, code, type, parent_id ) )`)
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getAllCoaches] Exception:', err);
    return [];
  }
}

export async function getCoachesByHospital(hospitalId?: string) {
  try {
    if (!hospitalId) return await getAllCoaches();
    
    const { data: hospitalData, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', hospitalId)
      .single();
    if (hospitalError || !hospitalData) return await getAllCoaches();

    let hospitalIds: string[] = [hospitalId];
    if (hospitalData.type === 'main') {
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospitalId)
        .eq('is_active', true);
      if (subHospitals && subHospitals.length > 0) {
        hospitalIds = [...hospitalIds, ...subHospitals.map(h => h.id)];
      }
    } else if (hospitalData.type === 'sub' && hospitalData.parent_id) {
      hospitalIds = [...hospitalIds, hospitalData.parent_id];
    }

    const { data, error } = await supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, is_active, hospitals ( id, name, code, type, parent_id ) )`)
      .eq('is_active', true)
      .in('users.hospital_id', hospitalIds)
      .order('full_name_th', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getCoachesByHospital] Exception:', err);
    return [];
  }
}

export async function getCoaches() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('id, user_id, full_name_th, specialization_th, is_active')
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getCoaches] Exception:', err);
    return [];
  }
}

export async function getCoachesByUserHospital(hospitalIds?: string[]) {
  try {
    let query = supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, hospital_id, hospitals ( id, name, code, type )`)
      .eq('is_active', true)
      .not('hospital_id', 'is', null);
    
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { data, error } = await query;
    if (error) return [];
    
    const filteredCoaches = (data || []).filter(coach => coach.hospital_id && coach.hospitals?.name);
    return filteredCoaches;
  } catch (err) {
    console.error('❌ [getCoachesByUserHospital] Exception:', err);
    return [];
  }
}

export async function getCoachesByHospitals(hospitalIds: string[]) {
  try {
    let query = supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, hospitals ( id, name, code, type ) )`)
      .eq('is_active', true)
      .in('role', ['doctor', 'helper']);
    
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getCoachesByHospitals] Exception:', err);
    return [];
  }
}

export async function getCoachesWithHospitals(hospitalIds?: string[]) {
  try {
    let query = supabase
      .from('doctors')
      .select(`id, user_id, full_name_th, specialization_th, is_active, is_verified, users ( hospital_id, role, admin_type, is_active, hospitals ( id, name, code, type, parent_id ) )`)
      .eq('is_active', true)
      .eq('users.is_active', true);
    
    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('users.hospital_id', hospitalIds);
    }

    const { data, error } = await query.order('full_name_th', { ascending: true });
    if (error) return [];
    
    const coachesWithHospitals = (data || []).filter(coach => coach.users?.hospital_id && coach.users?.hospitals?.name);
    return coachesWithHospitals;
  } catch (err) {
    console.error('❌ [getCoachesWithHospitals] Exception:', err);
    return [];
  }
}

// =====================================================
// 🆔 ID Card Assignment Functions
// =====================================================
export async function assignIdCard(data: { id_card: string; hospital_id: string; assigned_by: string; notes?: string; }) {
  try {
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
    if (error) return { success: false, error: error.message };
    return { success: true, data: assignment };
  } catch (err: any) {
    console.error('❌ [assignIdCard] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function getIdCardAssignments(hospitalIds?: string[], status?: string) {
  try {
    let query = supabase
      .from('id_card_assignments')
      .select(`*, hospitals ( id, name, code, type ), assigned_by_user:users!assigned_by ( id, full_name_th )`)
      .order('assigned_at', { ascending: false });
    
    if (hospitalIds && hospitalIds.length > 0) query = query.in('hospital_id', hospitalIds);
    if (status) query = query.eq('status', status);
    
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('❌ [getIdCardAssignments] Exception:', err);
    return [];
  }
}

export async function checkIdCardAssignment(idCard: string) {
  try {
    const { data, error } = await supabase
      .from('id_card_assignments')
      .select(`*, hospitals ( id, name, code )`)
      .eq('id_card', idCard)
      .eq('status', 'active')
      .single();
    if (error && error.code !== 'PGRST116') return null;
    return data;
  } catch (err) {
    console.error('❌ [checkIdCardAssignment] Exception:', err);
    return null;
  }
}

export async function updateIdCardAssignment(assignmentId: string, data: { status?: string; notes?: string; hospital_id?: string; }) {
  try {
    const updateData: any = { updated_at: new Date().toISOString() };
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.hospital_id) updateData.hospital_id = data.hospital_id;
    
    const { error } = await supabase.from('id_card_assignments').update(updateData).eq('id', assignmentId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('❌ [updateIdCardAssignment] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function cancelIdCardAssignment(assignmentId: string) {
  try {
    const { error } = await supabase
      .from('id_card_assignments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', assignmentId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('❌ [cancelIdCardAssignment] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function getIdCardAssignmentStats(hospitalIds?: string[]) {
  try {
    let query = supabase.from('id_card_assignments').select('', { count: 'exact', head: true });
    if (hospitalIds && hospitalIds.length > 0) query = query.in('hospital_id', hospitalIds);
    const { count: total } = await query;

    let activeQuery = supabase.from('id_card_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active');
    let completedQuery = supabase.from('id_card_assignments').select('*', { count: 'exact', head: true }).eq('status', 'completed');
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
// 🎫 ID Card Sequence & Generator Functions
// =====================================================
export async function getIdSequence(sequenceType: 'patient' | 'staff' | 'osm', prefix: string = '1', provinceCode: string = '1000') {
  try {
    const { data, error } = await supabase
      .from('id_sequences')
      .select('*')
      .eq('sequence_type', sequenceType)
      .eq('prefix', prefix)
      .eq('province_code', provinceCode)
      .single();
    if (error) return null;
    return data;
  } catch (err) {
    console.error('❌ [getIdSequence] Exception:', err);
    return null;
  }
}

export async function incrementIdSequence(sequenceType: 'patient' | 'staff' | 'osm', prefix: string = '1', provinceCode: string = '1000', incrementBy: number = 1) {
  try {
    const { data, error } = await supabase
      .from('id_sequences')
      .update({
        current_sequence: incrementBy,
        updated_at: new Date().toISOString()
      })
      .eq('sequence_type', sequenceType)
      .eq('prefix', prefix)
      .eq('province_code', provinceCode)
      .select()
      .single();
    
    if (error) {
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
          .update({ current_sequence: newValue, updated_at: new Date().toISOString() })
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

function calculateCheckDigit(first12Digits: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(first12Digits[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit.toString();
}

export function generateDummyIdCard(prefix: string = '1', provinceCode: string = '1000', sequenceNum: number): string {
  if (!/^[1-8]$/.test(prefix)) prefix = '1';
  const sequenceStr = sequenceNum.toString().padStart(5, '0');
  const groupCode = Math.floor(sequenceNum / 100000).toString().padStart(2, '0').slice(-2);
  const first12 = `${prefix}${provinceCode}${sequenceStr}${groupCode}`;
  const checkDigit = calculateCheckDigit(first12);
  return `${first12}${checkDigit}`;
}

export function validateThaiIdCard(idCard: string): boolean {
  // ทำความสะอาดเลขบัตรก่อนตรวจ
  const cleaned = idCard.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(cleaned)) return false;
  const providedCheck = parseInt(cleaned[12]);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * (13 - i);
  }
  const calculatedCheck = (11 - (sum % 11)) % 10;
  return providedCheck === calculatedCheck;
}

export function formatIdCard(idCard: string): string {
  const cleaned = idCard.replace(/[\s-]/g, '');
  if (cleaned.length !== 13) return idCard;
  return `${cleaned[0]}-${cleaned.slice(1,5)}-${cleaned.slice(5,10)}-${cleaned.slice(10,12)}-${cleaned[12]}`;
}

export async function getPendingIdCards(hospitalIds?: string[]) {
  try {
    let pendingQuery = supabase.from('pending_staff').select(`*, hospitals ( id, name, code )`).eq('status', 'pending');
    if (hospitalIds && hospitalIds.length > 0) pendingQuery = pendingQuery.in('hospital_id', hospitalIds);
    const { data: pendingData, error: pendingError } = await pendingQuery;
    if (pendingError) console.error('❌ [getPendingIdCards] Error fetching pending:', pendingError);

    let staffQuery = supabase
      .from('users')
      .select(`id, id_card, role, hospital_id, created_at, doctors ( full_name_th, specialization_th ), hospitals ( id, name, code )`)
      .in('role', ['admin', 'doctor', 'helper', 'osm'])
      .eq('is_active', true)
      .not('id_card', 'is', null);
    if (hospitalIds && hospitalIds.length > 0) staffQuery = staffQuery.in('hospital_id', hospitalIds);
    const { data: staffData, error: staffError } = await staffQuery;
    if (staffError) console.error('❌ [getPendingIdCards] Error fetching staff:', staffError);

    const { data: assignments } = await supabase.from('id_card_assignments').select('id_card').eq('status', 'active');
    const assignedCards = new Set(assignments?.map(a => a.id_card) || []);

    const pendingCards: any[] = [];
    if (pendingData) {
      pendingData.forEach(item => {
        if (!assignedCards.has(item.id_card)) {
          pendingCards.push({ ...item, source: 'pending', full_name_th: item.full_name_th, hospitals: item.hospitals });
        }
      });
    }
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
    return pendingCards;
  } catch (err) {
    console.error('❌ [getPendingIdCards] Exception:', err);
    return [];
  }
}

// =====================================================
// 👥 Staff Management Functions (Updated for Temporary)
// =====================================================
export async function addStaff(data: {
  id_card: string;
  full_name_th: string;
  role: 'admin' | 'doctor' | 'helper' | 'osm';
  hospital_id?: string;
  birth_date: string;
  password: string;
  created_by: string;
  admin_type?: 'super' | 'hospital' | null;
  specialization_th?: string;
  phone?: string;
  email?: string;
  is_temporary_id?: boolean;
  temp_id_notes?: string;
}) {
  try {
    // 1️⃣ เข้ารหัสรหัสผ่าน (ใช้ RPC หรือเปลี่ยนเป็น bcrypt ตามระบบจริง)
    const { data: passwordHash, error: hashError } = await supabase.rpc('hash_password', { 
      plain_text: data.password 
    });
    if (hashError) throw new Error('ไม่สามารถเข้ารหัสรหัสผ่านได้: ' + hashError.message);

    // 2️⃣ สร้าง User ในตาราง users
    const now = new Date().toISOString();
    const isTemp = data.is_temporary_id ?? false;

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: passwordHash,
        role: data.role,
        hospital_id: data.hospital_id || null,
        birth_date: data.birth_date,
        is_active: true,
        admin_type: data.admin_type || null,
        created_by: data.created_by,
        // 🚩 ฟิลด์ชั่วคราว
        is_temporary_id: isTemp,
        temp_id_notes: data.temp_id_notes || null,
        id_card_updated_at: isTemp ? null : now,
        id_card_updated_by: isTemp ? null : data.created_by,
      })
      .select()
      .single();

    if (userError) throw userError;

    // 3️⃣ ถ้าเป็นหมอ/เจ้าหน้าที่/อสม. ให้สร้างเรคคอร์ดในตาราง doctors ด้วย
    if (['doctor', 'helper', 'osm'].includes(data.role)) {
      const { error: docError } = await supabase.from('doctors').insert({
        user_id: user.id,
        full_name_th: data.full_name_th,
        specialization_th: data.specialization_th || null,
        phone: data.phone || null,
        email: data.email || null,
        is_active: true,
        is_verified: !isTemp, // ✅ ยืนยันแล้วถ้าไม่ใช่ชั่วคราว
        can_assign_goals: data.role === 'doctor',
        can_view_all_patients: false,
        max_patients: 100,
        current_patients: 0,
      });

      if (docError) {
        console.error('⚠️ สร้าง doctors record ล้มเหลว:', docError.message);
        // หมายเหตุ: ใน Production ควรใช้ Transaction เพื่อ Rollback ถ้าขั้นนี้ไม่ผ่าน
      }
    }

    return { success: true, user };
  } catch (error: any) {
    console.error('addStaff error:', error);
    return { success: false, error: error.message };
  }
}

export async function getStaffForVerification(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      doctors:doctors!user_id (
        full_name_th,
        specialization_th,
        phone,
        email
      )
    `)
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateIdCard(userId: string, newIdCard: string, updatedBy: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .update({
      id_card: newIdCard,
      is_temporary_id: false,
      id_card_updated_at: now,
      id_card_updated_by: updatedBy,
      updated_at: now,
      temp_id_notes: null // ล้างหมายเหตุชั่วคราว
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// 📥 Import Patients from Excel Functions
// =====================================================
export function convertThaiDateToISO(thaiDateStr: string): string | null {
  if (!thaiDateStr) return null;
  const dateRegex = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
  const match = thaiDateStr.match(dateRegex);
  if (!match) return null;
  const [, day, month, year] = match;
  const yearAD = parseInt(year) - 543;
  return `${yearAD}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export async function findHospitalByName(hospitalName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('hospitals')
      .select('id')
      .ilike('name', hospitalName.trim())
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return data.id;
  } catch (err) {
    console.error('❌ [findHospitalByName] Error:', err);
    return null;
  }
}

export async function findCoachByFullName(coachFullName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('user_id')
      .ilike('full_name_th', coachFullName.trim())
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return data.user_id;
  } catch (err) {
    console.error('❌ [findCoachByFullName] Error:', err);
    return null;
  }
}

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

  const { data: allHospitals } = await supabase.from('hospitals').select('id, name').eq('is_active', true);
  const { data: allCoaches } = await supabase.from('doctors').select('user_id, full_name_th').eq('is_active', true);
  
  // ✅ แก้ไข: ตรวจสอบทั้ง id_card และ role patient
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id_card, role')
    .eq('role', 'patient'); // ดึงเฉพาะ patient
  
  const existingPatientIdCards = new Set(
    existingUsers?.map(u => u.id_card.replace(/[-\s]/g, '')) || []
  );

  const hospitalMap = new Map<string, string>();
  allHospitals?.forEach(h => hospitalMap.set(h.name.toLowerCase().trim(), h.id));

  const coachMap = new Map<string, string>();
  allCoaches?.forEach(c => coachMap.set(c.full_name_th.toLowerCase().trim(), c.user_id));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;

    try {
      const genderMap: Record<string, string> = { 'ชาย': 'male', 'หญิง': 'female' };
      const gender = genderMap[row.gender] || row.gender.toLowerCase();
      
      const birthDateISO = convertThaiDateToISO(row.birth_date);
      if (!birthDateISO) throw new Error(`รูปแบบวันเกิดไม่ถูกต้อง: ${row.birth_date}`);
      
      const cleanIdCard = row.id_card.replace(/\D/g, '');
      
      // ✅ แก้ไข: ตรวจสอบเฉพาะ patient ที่มีบัตรซ้ำ
      if (existingPatientIdCards.has(cleanIdCard)) {
        throw new Error('เลขบัตรประชาชนนี้มีผู้ป่วยอยู่ในระบบแล้ว (Role: Patient)');
      }
      
      let hospitalId = hospitalMap.get(row.hospital_name.toLowerCase().trim());
      if (!hospitalId) hospitalId = await findHospitalByName(row.hospital_name);
      if (!hospitalId) throw new Error(`ไม่พบโรงพยาบาล: ${row.hospital_name}`);
      
      let coachId: string | undefined = undefined;
      if (row.coach_name && row.coach_name.trim()) {
        coachId = coachMap.get(row.coach_name.toLowerCase().trim());
        if (!coachId) coachId = await findCoachByFullName(row.coach_name);
      }
      
      const password = row.birth_date;
      
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
        if (profileError.code === '23505') throw new Error('HN ซ้ำในโรงพยาบาลนี้');
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

// =====================================================
// 📍 Address Validation Functions
// =====================================================
export async function getAllValidAddresses() {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('province, district, subdistrict, postal_code')
      .neq('province', null)
      .neq('district', null)
      .neq('subdistrict', null);
    
    if (error) return [];
    
    const addresses = data?.map(v => ({
      province: v.province,
      district: v.district,
      subdistrict: v.subdistrict,
      postal_code: v.postal_code,
    })) || [];
    
    return addresses;
  } catch (err) {
    console.error('❌ [getAllValidAddresses] Error:', err);
    return [];
  }
}

export function validateAddress(address: { province: string; district: string; subdistrict: string; postal_code: string; }, validAddresses: Array<{ province: string; district: string; subdistrict: string; postal_code: string; }>) {
  const errors: string[] = [];
  
  if (address.province && !validAddresses.some(v => v.province === address.province)) {
    errors.push('จังหวัดไม่ถูกต้อง');
  }
  if (address.district && !validAddresses.some(v => v.district === address.district && v.province === address.province)) {
    errors.push('อำเภอไม่ถูกต้อง');
  }
  if (address.subdistrict && !validAddresses.some(v => v.subdistrict === address.subdistrict && v.district === address.district && v.province === address.province)) {
    errors.push('ตำบลไม่ถูกต้อง');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


// ✅ เพิ่มฟังก์ชันนี้ในไฟล์ @/lib/supabase/queries.ts

// 1. ดึงรายชื่อจังหวัดจากตาราง provinces
export async function getAllValidProvinces(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('provinces')
      .select('name_th');
    if (error) {
      console.error('❌ Error fetching provinces:', error);
      return [];
    }
    return data ? data.map(p => p.name_th) : [];
  } catch (err) {
    console.error('❌ getAllValidProvinces exception:', err);
    return [];
  }
}


export async function checkPatientExists(idCard: string): Promise<{ exists: boolean; isPatient: boolean }> {
  try {
    const cleanId = idCard.replace(/[-\s]/g, '');
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id_card', cleanId)
      .maybeSingle();

    if (error) {
      console.error('❌ checkPatientExists Supabase error:', error);
      return { exists: false, isPatient: false };
    }
    return { 
      exists: !!data, 
      isPatient: data?.role === 'patient' 
    };
  } catch (err) {
    console.error('❌ checkPatientExists Exception:', err);
    return { exists: false, isPatient: false };
  }
}


// เพิ่มฟังก์ชันนี้ใน queries.ts
export async function getCoachName(coachId: string) {
  try {
    const { data } = await supabase
      .from('doctors')
      .select('full_name_th')
      .eq('user_id', coachId)
      .single();
    return data?.full_name_th || '-';
  } catch {
    return '-';
  }
}

// =====================================================
// 🔍 ID Card Duplicate Check Function
// =====================================================
/**
 * ตรวจสอบว่าเลขบัตรประชาชน + บทบาท มีอยู่ในระบบแล้วหรือไม่
 * ใช้ตรวจสอบก่อนสร้างบัตรใหม่ เพื่อป้องกันข้อมูลซ้ำ
 */
export async function checkIdCardExistsExcludeUser(idCard: string, role: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('id_card', idCard)
      .eq('role', role);
    
    if (error) {
      console.error('❌ [checkIdCardExists] Error:', error);
      return false;
    }
    return (count || 0) > 0;
  } catch (err) {
    console.error('❌ [checkIdCardExists] Exception:', err);
    return false;
  }
}

// =====================================================
// 🎫 ID Card Sequence & Generator Functions (แก้ไข)
// =====================================================
/**
 * สร้างและจองเลขบัตรประชาชนอัตโนมัติ พร้อมตรวจสอบความซ้ำ
 * @param sequenceType ประเภทลำดับ (patient|staff|osm)
 * @param prefix ตัวขึ้นต้นเลขบัตร (1-8)
 * @param provinceCode รหัสจังหวัด (3 หลัก)
 * @param role บทบาทผู้ใช้ สำหรับตรวจสอบความซ้ำ (optional)
 * @param maxRetries จำนวนครั้งสูงสุดในการลองสร้างใหม่หากซ้ำ (default: 10)
 */
export async function generateAndReserveIdCard(
  sequenceType: 'patient' | 'staff' | 'osm', 
  prefix: string = '1', 
  provinceCode: string = '1000',
  role?: string,
  maxRetries: number = 10
) {
  try {
    let attempts = 0;
    
    while (attempts < maxRetries) {
      // 1. ดึงลำดับปัจจุบัน
      const sequence = await getIdSequence(sequenceType, prefix, provinceCode);
      if (!sequence) return { success: false, error: 'ไม่พบข้อมูลลำดับในฐานข้อมูล' };
      
      const currentSeq = sequence.current_sequence || 1;
      
      // 2. สร้างเลขบัตรประชาชนด้วยอัลกอริทึมตรวจสอบได้ (Checksum)
      const idCard = generateDummyIdCard(prefix, provinceCode, currentSeq);
      
      // 3. ✅ ตรวจสอบความซ้ำ (ถ้าระบุ role)
      if (role) {
        const exists = await checkIdCardExists(idCard, role);
        if (exists) {
          // เลขซ้ำ -> ข้ามลำดับนี้แล้วลองใหม่
          await incrementIdSequence(sequenceType, prefix, provinceCode, 1);
          attempts++;
          continue;
        }
      }
      
      // 4. ✅ เลขไม่ซ้ำ -> จองสำเร็จ
      await incrementIdSequence(sequenceType, prefix, provinceCode, 1);
      return { success: true, idCard, sequenceNumber: currentSeq };
    }
    
    return { success: false, error: 'ไม่สามารถสร้างเลขบัตรที่ไม่ซ้ำได้หลังจากลองหลายครั้ง กรุณาลองใหม่' };
  } catch (err: any) {
    console.error('❌ [generateAndReserveIdCard] Error:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการสร้างบัตรประชาชน' };
  }
}

// =====================================================
// 🎫 Temporary OSM ID Card Management Functions
// =====================================================

/**
 * ตรวจสอบว่าเลขบัตรประชาชนซ้ำหรือไม่ (ไม่รวม user คนเดิม)
 */
export async function checkIdCardExists(idCard: string, excludeUserId?: string): Promise<boolean> {
  try {
    const cleanIdCard = idCard.replace(/[-\s]/g, '');
    let query = supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('id_card', cleanIdCard);
    
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }
    
    const { count, error } = await query;
    if (error) {
      console.error('❌ [checkIdCardExists] Error:', error);
      return false;
    }
    return (count || 0) > 0;
  } catch (err) {
    console.error('❌ [checkIdCardExists] Exception:', err);
    return false;
  }
}

/**
 * ดึงรายการอสม. ที่ใช้บัตรประชาชนชั่วคราว
 */
export async function getTemporaryOSMCards(hospitalIds?: string[]) {
  try {
    let query = supabase
      .from('users')
      .select(`
        id,
        id_card,
        role,
        is_active,
        created_at,
        is_temporary_id,
        temp_id_notes,
        id_card_updated_at,
        id_card_updated_by,
        hospital_id,
        doctors (
          full_name_th,
          phone,
          specialization_th,
          email
        ),
        hospitals (
          id,
          name,
          code,
          type
        ),
        created_by_user:users!created_by (
          full_name_th
        )
      `)
      .eq('role', 'osm')
      .eq('is_temporary_id', true)
      .order('created_at', { ascending: false });

    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ [getTemporaryOSMCards] Error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('❌ [getTemporaryOSMCards] Exception:', err);
    return [];
  }
}

/**
 * อัปเดตเลขบัตรอสม. จากชั่วคราวเป็นเลขจริง
 */
export async function updateTemporaryOSMIdCard(
  userId: string,
  newIdCard: string,
  updatedBy: string,
  confirmNotes?: string
) {
  try {
    // 1. ทำความสะอาดและตรวจสอบรูปแบบเลขบัตร
    const cleanIdCard = newIdCard.replace(/[-\s]/g, '');
    if (!/^\d{13}$/.test(cleanIdCard)) {
      return { success: false, error: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' };
    }

    // 2. ตรวจสอบ Checksum
    if (!validateThaiIdCard(cleanIdCard)) {
      return { success: false, error: 'เลขบัตรประชาชนไม่ผ่านการตรวจสอบความถูกต้อง (Checksum Invalid)' };
    }

    // 3. ตรวจสอบความซ้ำ (ไม่รวมตัวเอง)
    const isDuplicate = await checkIdCardExists(cleanIdCard, userId);
    if (isDuplicate) {
      return { success: false, error: 'เลขบัตรประชาชนนี้ถูกใช้งานแล้วในระบบ กรุณาตรวจสอบอีกครั้ง' };
    }

    // 4. อัปเดตข้อมูลในตาราง users
    const { error } = await supabase
      .from('users')
      .update({
        id_card: cleanIdCard,
        is_temporary_id: false,
        temp_id_notes: confirmNotes 
          ? `${confirmNotes} | เดิม: ${notes || 'ไม่มี'}` 
          : (temp_id_notes || 'อัปเดตเป็นเลขจริง'),
        id_card_updated_at: new Date().toISOString(),
        id_card_updated_by: updatedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว (Unique Constraint Violation)' };
      }
      return { success: false, error: error.message };
    }

    // 5. อัปเดต is_verified ในตาราง doctors เป็น true
    await supabase
      .from('doctors')
      .update({
        is_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    return { success: true };
  } catch (err: any) {
    console.error('❌ [updateTemporaryOSMIdCard] Exception:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการอัปเดต' };
  }
}

/**
 * ดึงสถิติบัตรอสม.ชั่วคราว
 */
export async function getTemporaryOSMStats(hospitalIds?: string[]) {
  try {
    let query = supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'osm')
      .eq('is_temporary_id', true);

    if (hospitalIds && hospitalIds.length > 0) {
      query = query.in('hospital_id', hospitalIds);
    }

    const { count, error } = await query;
    if (error) return { total: 0 };

    return {
      total: count || 0,
    };
  } catch (err) {
    console.error('❌ [getTemporaryOSMStats] Error:', err);
    return { total: 0 };
  }
}