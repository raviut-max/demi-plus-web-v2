// scripts/import-from-excel.js
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ กรุณาตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function importFromExcel() {
  try {
    console.log('📖 กำลังอ่านไฟล์ Excel...');
    
    // อ่านไฟล์ Excel
    const workbook = XLSX.readFile('./Thai_Address_Database.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`✅ พบข้อมูล ${data.length} แถว`);
    
    // แยกข้อมูลเป็น 3 ตาราง
    const provincesMap = new Map();
    const districtsMap = new Map();
    const subdistricts = [];
    
    data.forEach((row, index) => {
      // ✅ Trim ข้อมูลทุกฟิลด์
      const provinceId = String(row['ID จังหวัด'] || '').trim();
      const districtId = String(row['ID อำเภอ'] || '').trim();
      const subdistrictId = String(row['ID ตำบล'] || '').trim();
      
      const provinceNameTh = String(row['ชื่อจังหวัด (ไทย)'] || '').trim();
      const provinceNameEn = String(row['ชื่อจังหวัด (อังกฤษ)'] || '').trim();
      
      const districtNameTh = String(row['ชื่ออำเภอ (ไทย)'] || '').trim();
      const districtNameEn = String(row['ชื่ออำเภอ (อังกฤษ)'] || '').trim();
      
      const subdistrictNameTh = String(row['ชื่อตำบล (ไทย)'] || '').trim();
      const subdistrictNameEn = String(row['ชื่อตำบล (อังกฤษ)'] || '').trim();
      
      // ✅ Trim และตัด zipcode ให้เหลือ 5 หลัก
      let zipcode = String(row['รหัสไปรษณีย์'] || '').trim();
      // ลบช่องว่างและเอาเฉพาะ 5 หลักแรก
      zipcode = zipcode.replace(/\s/g, '').substring(0, 5);
      
      // ข้อมูลจังหวัด
      if (provinceId && !provincesMap.has(provinceId)) {
        provincesMap.set(provinceId, {
          id: provinceId,
          name_th: provinceNameTh,
          name_en: provinceNameEn
        });
      }
      
      // ข้อมูลอำเภอ
      if (districtId && !districtsMap.has(districtId)) {
        districtsMap.set(districtId, {
          id: districtId,
          province_id: provinceId,
          name_th: districtNameTh,
          name_en: districtNameEn,
          zipcode: zipcode
        });
      }
      
      // ข้อมูลตำบล
      if (subdistrictId) {
        subdistricts.push({
          id: subdistrictId,
          district_id: districtId,
          name_th: subdistrictNameTh,
          name_en: subdistrictNameEn,
          zipcode: zipcode
        });
      }
    });
    
    const provinces = Array.from(provincesMap.values());
    const districts = Array.from(districtsMap.values());
    
    console.log(`📊 สรุปข้อมูล:`);
    console.log(`   - จังหวัด: ${provinces.length}`);
    console.log(`   - อำเภอ: ${districts.length}`);
    console.log(`   - ตำบล: ${subdistricts.length}`);
    
    // ลบข้อมูลเก่า
    console.log('\n🗑️ กำลังลบข้อมูลเก่า...');
    await supabaseAdmin.from('subdistricts').delete().neq('id', '00000');
    await supabaseAdmin.from('districts').delete().neq('id', '00');
    await supabaseAdmin.from('provinces').delete().neq('id', '00');
    
    // บันทึกจังหวัด
    console.log('\n💾 กำลังบันทึกจังหวัด...');
    const { error: provinceError } = await supabaseAdmin
      .from('provinces')
      .insert(provinces);
    
    if (provinceError) throw provinceError;
    console.log(`✅ บันทึกจังหวัดสำเร็จ ${provinces.length} รายการ`);
    
    // บันทึกอำเภอ (แบ่งเป็นชุด)
    console.log('\n💾 กำลังบันทึกอำเภอ...');
    for (let i = 0; i < districts.length; i += 1000) {
      const chunk = districts.slice(i, i + 1000);
      const { error } = await supabaseAdmin.from('districts').insert(chunk);
      if (error) throw error;
      console.log(`   บันทึกอำเภอ ${i + 1} - ${Math.min(i + 1000, districts.length)}`);
    }
    console.log(`✅ บันทึกอำเภอสำเร็จ ${districts.length} รายการ`);
    
    // บันทึกตำบล (แบ่งเป็นชุด)
    console.log('\n💾 กำลังบันทึกตำบล...');
    for (let i = 0; i < subdistricts.length; i += 1000) {
      const chunk = subdistricts.slice(i, i + 1000);
      const { error } = await supabaseAdmin.from('subdistricts').insert(chunk);
      if (error) throw error;
      console.log(`   บันทึกตำบล ${i + 1} - ${Math.min(i + 1000, subdistricts.length)}`);
    }
    console.log(`✅ บันทึกตำบลสำเร็จ ${subdistricts.length} รายการ`);
    
    console.log('\n🎉 สำเร็จ! นำเข้าข้อมูลเสร็จสมบูรณ์');
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
    process.exit(1);
  }
}

importFromExcel();