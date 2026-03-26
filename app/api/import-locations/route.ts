// app/api/import-locations/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'import') {
      // 1. ดาวน์โหลดข้อมูล
      const provincesRes = await fetch('https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/province.json');
      const provincesData = await provincesRes.json();

      const districtsRes = await fetch('https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/district.json');
      const districtsData = await districtsRes.json();

      const subdistrictsRes = await fetch('https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/sub_district.json');
      const subdistrictsData = await subdistrictsRes.json();

      // 2. ลบข้อมูลเก่า
      await supabaseAdmin.from('subdistricts').delete().neq('id', '00000');
      await supabaseAdmin.from('districts').delete().neq('id', '00');
      await supabaseAdmin.from('provinces').delete().neq('id', '00');

      // 3. บันทึกจังหวัด
      const provincesToInsert = provincesData.map((p: any) => ({
        id: p.id,
        name_th: p.name_th,
        name_en: p.name_en,
      }));

      const { error: provinceError } = await supabaseAdmin
        .from('provinces')
        .insert(provincesToInsert);

      if (provinceError) throw provinceError;

      // 4. บันทึกอำเภอ (แบ่งเป็นชุด)
      const districtsToInsert = districtsData.map((d: any) => ({
        id: d.id,
        province_id: d.province_id,
        name_th: d.name_th,
        name_en: d.name_en,
        zipcode: d.zipcode,
      }));

      for (let i = 0; i < districtsToInsert.length; i += 1000) {
        const chunk = districtsToInsert.slice(i, i + 1000);
        const { error } = await supabaseAdmin.from('districts').insert(chunk);
        if (error) throw error;
      }

      // 5. บันทึกตำบล (แบ่งเป็นชุด)
      const subdistrictsToInsert = subdistrictsData.map((s: any) => ({
        id: s.id,
        district_id: s.district_id,
        name_th: s.name_th,
        name_en: s.name_en,
        zipcode: s.zipcode,
      }));

      for (let i = 0; i < subdistrictsToInsert.length; i += 1000) {
        const chunk = subdistrictsToInsert.slice(i, i + 1000);
        const { error } = await supabaseAdmin.from('subdistricts').insert(chunk);
        if (error) throw error;
      }

      return NextResponse.json({
        success: true,
        message: 'นำเข้าข้อมูลสำเร็จ',
        counts: {
          provinces: provincesData.length,
          districts: districtsData.length,
          subdistricts: subdistrictsData.length,
        }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error.message || 'Import failed' },
      { status: 500 }
    );
  }
}