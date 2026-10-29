// lib/pdf/patientRecordTemplate.ts
// ✅ เทมเพลตกลางสร้างระเบียนคนไข้ PDF ฉบับสมบูรณ์ (A4)
// ✅ ใช้ร่วมทั้งหน้าบันทึกรวม (page.tsx) และหน้ารายคน ([id]/page.tsx)
import { supabase } from '@/lib/supabase/client';

export interface RecordMeta {
  preparedBy: string;
  coachName: string;
  generatedAt: string;
  docCode: string;
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const formatThaiDate = (dateString: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const shortThaiDate = (dateString: string) => {
  const d = new Date(dateString);
  return `${THAI_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
};

export const buildRecordMeta = (preparedBy: string, coachName: string, patient: any): RecordMeta => {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  return {
    preparedBy,
    coachName,
    generatedAt: `${formatThaiDate(now.toISOString())} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`,
    docCode: `HB-${patient?.hospital_number || 'NOHN'}-${ymd}`,
  };
};

// ✅ ดึงข้อมูลครบถ้วน + ชื่อโค้ช
export const fetchPatientRecordData = async (patientId: string) => {
  const { data: patient, error } = await supabase
    .from('profiles')
    .select(`
      id, first_name, last_name, hospital_number, age, gender,
      pam_level, pam_score, zone, current_weight, waist_circumference,
      blood_sugar, height, bmi, hba1c_level, program_start_date,
      hospital_id, coach_id,
      hospitals:hospital_id (name)
    `)
    .eq('id', patientId)
    .single();
  if (error) throw error;

  const { data: followups } = await supabase
    .from('appointment_followups')
    .select('*')
    .eq('user_id', patientId)
    .order('followup_date', { ascending: false });

  const { data: screenings } = await supabase
    .from('screenings')
    .select('*')
    .eq('user_id', patientId)
    .order('screening_date', { ascending: false });

  let coachName = '-';
  if (patient?.coach_id) {
    const { data: doc } = await supabase
      .from('doctors')
      .select('full_name_th')
      .eq('user_id', patient.coach_id)
      .single();
    coachName = doc?.full_name_th || '-';
  }

  return { patient, followups: followups || [], screenings: screenings || [], coachName };
};

// ================= ตัวช่วยแสดงผล =================
const statusBadge = (s: string | null) => {
  const map: any = {
    excellent: { t: 'ดีเยี่ยม', bg: '#dcfce7', fg: '#15803d' },
    good: { t: 'ดี', bg: '#dbeafe', fg: '#1d4ed8' },
    fair: { t: 'พอใช้', bg: '#fef9c3', fg: '#a16207' },
    needs_improvement: { t: 'ต้องปรับปรุง', bg: '#fee2e2', fg: '#b91c1c' },
    monitoring: { t: 'เฝ้าระวัง', bg: '#f3e8ff', fg: '#7e22ce' },
  };
  const m = map[s || ''] || { t: s || '-', bg: '#f3f4f6', fg: '#374151' };
  return `<span style="background:${m.bg};color:${m.fg};padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;">${m.t}</span>`;
};

const compliance = (s: string | null) =>
  s === 'completed' ? '✅ ตามแผน' : s === 'not_completed' ? '❌ ไม่ตามแผน' : '⚪ ไม่มีในแผน';

const deltaTag = (cur: number | null, prev: number | null, unit: string, goodWhenDown: boolean) => {
  if (cur == null || prev == null) return '';
  const d = +(cur - prev).toFixed(1);
  if (d === 0) return `<div style="font-size:10px;color:#6b7280;margin-top:2px;">= ไม่เปลี่ยนแปลง</div>`;
  const down = d < 0;
  const good = goodWhenDown ? down : !down;
  const color = good ? '#16a34a' : '#dc2626';
  return `<div style="font-size:10px;color:${color};margin-top:2px;">${down ? '↓' : '↑'} ${down ? 'ลดลง' : 'เพิ่มขึ้น'} ${Math.abs(d)} ${unit}</div>`;
};

const secTitle = (num: number, title: string) => `
  <div style="display:flex;align-items:center;gap:8px;margin:16px 0 10px;">
    <div style="width:22px;height:22px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">${num}</div>
    <div style="font-size:15px;font-weight:800;color:#111827;">${title}</div>
  </div>`;

// ✅ กราฟเส้น SVG (น้ำหนัก + FPG)
const buildTrendLineSVG = (points: { label: string; w: number | null; f: number | null }[]) => {
  const W = 660, H = 230, PL = 46, PR = 46, PT = 18, PB = 30;
  const ws = points.map(p => p.w).filter(v => v != null) as number[];
  const fs = points.map(p => p.f).filter(v => v != null) as number[];
  if (!ws.length || !fs.length) return '<div style="color:#9ca3af;font-size:12px;">ไม่มีข้อมูลเพียงพอสำหรับกราฟ</div>';
  const wMin = Math.min(...ws), wMax = Math.max(...ws);
  const fMin = Math.min(...fs), fMax = Math.max(...fs);
  const wSpan = wMax - wMin || 1, fSpan = fMax - fMin || 1;
  const n = points.length;
  const x = (i: number) => PL + (n === 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (n - 1));
  const yW = (v: number) => PT + (1 - (v - wMin) / wSpan) * (H - PT - PB);
  const yF = (v: number) => PT + (1 - (v - fMin) / fSpan) * (H - PT - PB);
  const wPts = points.map((p, i) => (p.w != null ? `${x(i)},${yW(p.w)}` : null)).filter(Boolean).join(' ');
  const fPts = points.map((p, i) => (p.f != null ? `${x(i)},${yF(p.f)}` : null)).filter(Boolean).join(' ');
  const cw = points.map((p, i) => (p.w != null ? `<circle cx="${x(i)}" cy="${yW(p.w)}" r="3.5" fill="#2563eb"/>` : '')).join('');
  const cf = points.map((p, i) => (p.f != null ? `<circle cx="${x(i)}" cy="${yF(p.f)}" r="3.5" fill="#16a34a"/>` : '')).join('');
  const xl = points.map((p, i) => `<text x="${x(i)}" y="${H - 10}" font-size="10" fill="#6b7280" text-anchor="middle">${p.label}</text>`).join('');
  const yw = [wMin, (wMin + wMax) / 2, wMax].map(v => `<text x="${PL - 6}" y="${yW(v) + 3}" font-size="9" fill="#2563eb" text-anchor="end">${(+v).toFixed(1)}</text>`).join('');
  const yf = [fMin, (fMin + fMax) / 2, fMax].map(v => `<text x="${W - PR + 6}" y="${yF(v) + 3}" font-size="9" fill="#16a34a">${Math.round(v)}</text>`).join('');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
    <rect x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="#f9fafb" stroke="#e5e7eb"/>
    <polyline points="${wPts}" fill="none" stroke="#2563eb" stroke-width="2"/>
    <polyline points="${fPts}" fill="none" stroke="#16a34a" stroke-width="2"/>
    ${cw}${cf}${xl}${yw}${yf}
    <text x="${PL}" y="12" font-size="10" fill="#2563eb">น้ำหนัก (กก.)</text>
    <text x="${W - PR}" y="12" font-size="10" fill="#16a34a" text-anchor="end">FPG (mg/dL)</text>
  </svg>`;
};

// ✅ กราฟแท่ง (div ล้วน ปลอดภัยกับ html2canvas)
const buildBarDiv = (items: { label: string; value: number | null }[], max: number, color: string) => `
  <div style="display:flex;align-items:flex-end;gap:12px;height:130px;padding:0 6px;border-bottom:1px solid #d1d5db;">
    ${items.map(it => {
      const h = max > 0 ? Math.max(4, Math.round(((it.value ?? 0) / max) * 100)) : 4;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
        <div style="font-size:10px;color:#374151;font-weight:700;margin-bottom:2px;">${it.value ?? '-'}</div>
        <div style="width:70%;max-width:46px;height:${h}px;background:${color};border-radius:4px 4px 0 0;"></div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:12px;padding:4px 6px 0;">
    ${items.map(it => `<div style="flex:1;text-align:center;font-size:10px;color:#6b7280;">${it.label}</div>`).join('')}
  </div>`;

const imgOrPlaceholder = (url: string | null, maxH: number, caption: string | null) =>
  url
    ? `<div style="border:2px solid #d1d5db;border-radius:8px;overflow:hidden;text-align:center;background:#ffffff;">
        <img src="${url}" style="width:100%;max-height:${maxH}px;object-fit:contain;" />
      </div>${caption ? `<div style="font-size:11px;color:#6b7280;margin-top:6px;">${caption}</div>` : ''}`
    : `<div style="border:2px dashed #d1d5db;border-radius:8px;background:#f9fafb;height:170px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;">✕ ไม่พบรูปภาพ</div>
      ${caption ? `<div style="font-size:11px;color:#6b7280;margin-top:6px;">${caption}</div>` : ''}`;

// ================= เทมเพลตหลัก =================
export const renderPatientPages = (patient: any, followups: any[], screenings: any[], meta: RecordMeta): string[] => {
  const latest = followups[0];
  const prev = followups[1];
  const latestScreening = screenings[0];
  const screeningsAsc = [...screenings].reverse();
  const followupsAsc = [...followups].reverse();
  const inners: string[] = [];

  const pamForDate = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    let best: any = null;
    for (const s of screeningsAsc) {
      if (new Date(s.screening_date).getTime() <= t) best = s;
    }
    return best?.pam_level_result || '-';
  };

  /* ----- PAGE 1: หัวเอกสาร + ข้อมูลผู้ป่วย + ผลประเมิน + PROMS รายข้อ ----- */
  inners.push(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:6px;">
      <div>
        <div style="font-size:22px;font-weight:800;color:#2563eb;">Community Bridge</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">ระบบดูแลผู้ป่วยกลุ่มเสี่ยงเบาหวาน (PreDM)</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:17px;font-weight:800;color:#111827;">ระเบียนติดตามผลครบฉบับสมบูรณ์</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Complete Follow-up Record</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">เอกสารฉบับนี้จัดทำเมื่อ: ${meta.generatedAt}</div>
      </div>
    </div>

    ${secTitle(1, 'ข้อมูลผู้ป่วย')}
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 16px;font-size:13px;">
        <div><div style="color:#6b7280;font-size:11px;">ชื่อ-นามสกุล</div><div style="font-weight:700;">${patient.first_name || ''} ${patient.last_name || ''}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">HN (Hospital Number)</div><div style="font-weight:700;">${patient.hospital_number || '-'}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">อายุ / เพศ</div><div style="font-weight:700;">${patient.age || '-'} ปี / ${patient.gender === 'female' ? 'หญิง' : 'ชาย'}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">PAM Level</div><div style="font-weight:700;">${patient.pam_level || 'L0'}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">PROMS Zone</div><div style="font-weight:700;">${patient.zone || '-'}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">Confidence Score</div><div style="font-weight:700;">${latest?.confidence_score ?? latestScreening?.confidence_score ?? '-'}/10</div></div>
        <div><div style="color:#6b7280;font-size:11px;">วันที่เริ่มต้นโปรแกรม</div><div style="font-weight:700;">${formatThaiDate(patient.program_start_date)}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">ผู้ดูแล/โค้ช</div><div style="font-weight:700;">${meta.coachName}</div></div>
        <div><div style="color:#6b7280;font-size:11px;">โรงพยาบาล</div><div style="font-weight:700;">${patient.hospitals?.name || '-'}</div></div>
      </div>
    </div>

    ${secTitle(2, 'ผลการประเมินตนเอง (Self-Assessment Results)')}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:12px;color:#6b7280;">PAM Score</div>
        <div style="font-size:30px;font-weight:800;color:#2563eb;">${latestScreening?.pam_total_score || '-'}</div>
        <div style="font-size:12px;color:#374151;">${latestScreening?.pam_level_result || patient.pam_level || '-'}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">ประเมินเมื่อ ${latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</div>
      </div>
      <div style="background:#faf5ff;border:2px solid #e9d5ff;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:12px;color:#6b7280;">PROMS Zone</div>
        <div style="font-size:30px;font-weight:800;color:#9333ea;">${latestScreening?.proms_zone || '-'}</div>
        <div style="font-size:12px;color:#374151;">Q1:${latestScreening?.proms_q1_score || 0} Q2:${latestScreening?.proms_q2_score || 0} Q3:${latestScreening?.proms_q3_score || 0} Q4:${latestScreening?.proms_q4_score || 0}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">ประเมินเมื่อ ${latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</div>
      </div>
      <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:12px;color:#6b7280;">Confidence Score</div>
        <div style="font-size:30px;font-weight:800;color:#16a34a;">${latestScreening?.confidence_score || latest?.confidence_score || '-'}/10</div>
        <div style="font-size:12px;color:#374151;">เกณฑ์การให้คะแนน 1-10</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">ประเมินเมื่อ ${latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</div>
      </div>
    </div>

    <div style="font-size:12px;font-weight:700;color:#374151;margin:12px 0 6px;">รายละเอียดเชิง PROMS (Patient-Reported Outcome Measures):</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
      ${[
        { q: 'Q1: สุขภาพร่างกาย', v: latestScreening?.proms_q1_score },
        { q: 'Q2: ความกังวลใจ', v: latestScreening?.proms_q2_score },
        { q: 'Q3: การมีส่วนร่วมทางสังคม', v: latestScreening?.proms_q3_score },
        { q: 'Q4: สุขภาพจิตใจ', v: latestScreening?.proms_q4_score },
      ].map(item => `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;">
          <div style="color:#6b7280;font-size:11px;">${item.q}</div>
          <div style="font-weight:700;margin-top:2px;">${item.v ?? '-'}/4 <span style="font-weight:600;color:${(item.v ?? 0) >= 3 ? '#16a34a' : '#a16207'};">(${(item.v ?? 0) >= 3 ? 'Good' : 'Fair'})</span></div>
        </div>`).join('')}
    </div>
  `);

  /* ----- PAGE 2: ค่าสุขภาพปัจจุบัน + กราฟแนวโน้ม ----- */
  const trendPoints = followupsAsc.slice(-6).map(f => ({ label: shortThaiDate(f.followup_date), w: f.weight, f: f.blood_sugar_dtx }));
  const confBars = followupsAsc.slice(-4).map(f => ({ label: `รอบ ${f.followup_round}`, value: f.confidence_score }));
  const pamBars = screeningsAsc.slice(-4).map((s, i) => ({ label: `ครั้ง ${i + 1}`, value: s.pam_total_score }));

  inners.push(`
    ${secTitle(3, 'ค่าสุขภาพปัจจุบัน')}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">น้ำหนัก</div>
        <div style="font-size:20px;font-weight:800;">${latest?.weight ?? patient.current_weight ?? '-'} <span style="font-size:11px;">กก.</span></div>
        ${deltaTag(latest?.weight ?? null, prev?.weight ?? null, 'กก.', true)}
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">รอบเอว</div>
        <div style="font-size:20px;font-weight:800;">${latest?.waist_circumference ?? patient.waist_circumference ?? '-'} <span style="font-size:11px;">ซม.</span></div>
        ${deltaTag(latest?.waist_circumference ?? null, prev?.waist_circumference ?? null, 'ซม.', true)}
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">ความดัน SYS</div>
        <div style="font-size:20px;font-weight:800;">${latest?.blood_pressure_sys ?? '-'} <span style="font-size:11px;">mmHg</span></div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">ความดัน DIA</div>
        <div style="font-size:20px;font-weight:800;">${latest?.blood_pressure_dia ?? '-'} <span style="font-size:11px;">mmHg</span></div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">FPG</div>
        <div style="font-size:20px;font-weight:800;">${latest?.blood_sugar_dtx ?? patient.blood_sugar ?? '-'} <span style="font-size:11px;">mg/dL</span></div>
        ${deltaTag(latest?.blood_sugar_dtx ?? null, prev?.blood_sugar_dtx ?? null, 'mg/dL', true)}
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">BMI</div>
        <div style="font-size:20px;font-weight:800;">${patient.bmi ?? '-'} <span style="font-size:11px;">kg/m²</span></div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">Confidence</div>
        <div style="font-size:20px;font-weight:800;">${latest?.confidence_score ?? '-'} <span style="font-size:11px;">/10</span></div>
        ${deltaTag(latest?.confidence_score ?? null, prev?.confidence_score ?? null, 'คะแนน', false)}
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">HbA1c</div>
        <div style="font-size:20px;font-weight:800;">${patient.hba1c_level ?? '-'} <span style="font-size:11px;">%</span></div>
      </div>
    </div>

    ${secTitle(4, 'แนวโน้มสุขภาพ (Trend Charts)')}
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">น้ำหนัก (กก.) และ FPG (mg/dL) - 6 รอบล่าสุด</div>
    ${buildTrendLineSVG(trendPoints)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;">
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Confidence Score</div>
        ${buildBarDiv(confBars, 10, '#16a34a')}
      </div>
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">PAM Score</div>
        ${buildBarDiv(pamBars, 100, '#2563eb')}
      </div>
    </div>
  `);

  /* ----- PAGE 3+: ประวัติการติดตามแบบ Timeline (แบ่งอัตโนมัติ) ----- */
  const timelineEntry = (f: any) => `
    <div style="position:relative;margin-left:6px;padding-left:20px;border-left:2px solid #bfdbfe;margin-bottom:12px;">
      <div style="position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #ffffff;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:13px;font-weight:800;color:#111827;">${formatThaiDate(f.followup_date)} <span style="font-weight:600;color:#6b7280;">• รอบที่ ${f.followup_round}</span></div>
        ${statusBadge(f.followup_status)}
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;font-size:12px;">
        <div><div style="color:#6b7280;font-size:10px;">น้ำหนัก</div><div style="font-weight:700;">${f.weight ?? '-'} กก.</div></div>
        <div><div style="color:#6b7280;font-size:10px;">FPG</div><div style="font-weight:700;">${f.blood_sugar_dtx ?? '-'} mg/dL</div></div>
        <div><div style="color:#6b7280;font-size:10px;">Confidence</div><div style="font-weight:700;">${f.confidence_score ?? '-'}/10</div></div>
        <div><div style="color:#6b7280;font-size:10px;">PAM Level</div><div style="font-weight:700;">${pamForDate(f.followup_date)}</div></div>
      </div>
      ${f.summary ? `<div style="margin-top:6px;font-size:12px;color:#374151;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;"><span style="color:#6b7280;font-weight:700;">สรุป: </span>${f.summary}</div>` : ''}
    </div>`;

  if (followups.length === 0) {
    inners.push(`
      ${secTitle(5, 'ประวัติการติดตาม (Follow-up History)')}
      <div style="text-align:center;color:#9ca3af;padding:60px 0;font-size:14px;">ยังไม่มีประวัติการติดตาม</div>
    `);
  } else {
    const MAX_H = 980;
    const head = (label: string) => `
      <div style="display:flex;align-items:center;gap:8px;margin:0 0 14px;">
        <div style="width:22px;height:22px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">5</div>
        <div style="font-size:16px;font-weight:800;color:#111827;border-bottom:2px solid #2563eb;padding-bottom:8px;flex:1;">ประวัติการติดตาม (${label})</div>
      </div>`;

    const measure = document.createElement('div');
    measure.style.width = '698px';
    measure.style.position = 'fixed';
    measure.style.left = '-10000px';
    measure.style.top = '0';
    measure.style.visibility = 'hidden';
    document.body.appendChild(measure);

    const chunks: any[][] = [];
    let cur: any[] = [];
    for (let i = 0; i < followups.length; i++) {
      const trial = [...cur, followups[i]];
      measure.innerHTML = head('วัด') + trial.map(timelineEntry).join('');
      if (measure.scrollHeight > MAX_H && cur.length > 0) {
        chunks.push(cur);
        cur = [followups[i]];
      } else {
        cur = trial;
      }
    }
    if (cur.length) chunks.push(cur);
    document.body.removeChild(measure);

    chunks.forEach(chunk => {
      const first = chunk[0]?.followup_round ?? 0;
      const last = chunk[chunk.length - 1]?.followup_round ?? 0;
      const label = first === last ? `รอบที่ ${first} จาก ${followups.length} รอบ` : `รอบที่ ${first}-${last} จาก ${followups.length} รอบ • เรียงจากล่าสุด`;
      inners.push(head(label) + chunk.map(timelineEntry).join(''));
    });
  }

  /* ----- PAGE: Life Schedule (รูปใหญ่แบบเดิม) ----- */
  inners.push(`
    ${secTitle(6, 'Life Schedule - ตารางชีวิตประจำวัน')}
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${latest ? `${formatThaiDate(latest.followup_date)} • รอบที่ ${latest.followup_round}` : '-'}</div>
    ${imgOrPlaceholder(latest?.life_schedule_image_url ?? null, 840, latest?.life_schedule_image_url ? 'ตารางชีวิตประจำวันของผู้ป่วย' : 'ไม่ได้แนบรูปภาพในรอบล่าสุด')}
  `);

  /* ----- PAGE: Floating Chart + Dream Card (รูปใหญ่แบบเดิม) ----- */
  inners.push(`
    ${secTitle(7, 'รูปภาพประกอบ')}
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">📈 Floating Chart - กราฟแนวโน้ม</div>
    ${imgOrPlaceholder(latest?.floating_chart_image_url ?? null, 400, latest?.floating_chart_summary || 'แนวโน้มค่าสุขภาพของผู้ป่วย')}
    <div style="font-size:14px;font-weight:700;margin:16px 0 6px;">💭 Dream Card - บัตรความฝัน</div>
    ${imgOrPlaceholder(latest?.dream_card_image_url ?? null, 400, latest?.dream_card_description || 'ไม่มีคำอธิบาย')}
  `);

  /* ----- PAGE สุดท้าย: ปฏิบัติตามแผน + การปรับตัว + สรุป + ลายเซ็น + Meta ----- */
  const recLines = (latest?.recommendations || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
  const recHtml = recLines.length > 1
    ? `<ol style="margin:0;padding-left:18px;font-size:13px;">${recLines.map(l => `<li style="margin-bottom:4px;">${l}</li>`).join('')}</ol>`
    : `<div style="font-size:13px;">${recLines[0] || '-'}</div>`;

  const notDone = [
    latest?.food_amount_status === 'not_completed' ? 'ปริมาณอาหาร' : null,
    latest?.food_type_status === 'not_completed' ? 'ชนิดอาหาร' : null,
    latest?.movement_status === 'not_completed' ? 'การออกกำลังกาย/เคลื่อนไหวร่างกาย' : null,
  ].filter(Boolean);
  const planText = `มุ่งเพิ่มคะแนนความมั่นใจจาก ${latest?.confidence_score ?? '-'}/10 ในรอบถัดไป โดยเน้น${notDone.length ? 'การปฏิบัติตามแผนเรื่อง: ' + notDone.join(', ') : 'การรักษาการปฏิบัติตามแผนที่ดีต่อเนื่อง'} พร้อมติดตามแนวโน้มน้ำหนักและ FPG ตามกราฟแนวโน้มปัจจุบัน`;

  inners.push(`
    ${secTitle(8, 'สถานะการปฏิบัติตามแผน')}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:4px 14px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span>ปริมาณอาหาร</span><span style="font-weight:700;">${compliance(latest?.food_amount_status ?? null)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span>ชนิดอาหาร</span><span style="font-weight:700;">${compliance(latest?.food_type_status ?? null)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>การออกกำลังกาย/เคลื่อนไหวร่างกาย</span><span style="font-weight:700;">${compliance(latest?.movement_status ?? null)}</span></div>
    </div>

    ${secTitle(9, 'การปรับตัว')}
    ${latest?.adaptation_summary ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;"><div style="color:#6b7280;font-size:11px;font-weight:700;margin-bottom:4px;">สรุปการปรับตัว</div>${latest.adaptation_summary}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:13px;"><div style="color:#6b7280;font-size:11px;font-weight:700;margin-bottom:4px;">อุปสรรค</div>${latest?.adaptation_obstacles || 'ไม่มีอุปสรรคสำคัญ'}</div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:13px;"><div style="color:#6b7280;font-size:11px;font-weight:700;margin-bottom:4px;">โอกาส/จุดแข็ง</div>${latest?.adaptation_opportunities || '-'}</div>
    </div>

    ${secTitle(10, 'สรุปและคำแนะนำ')}
    ${latest?.summary ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;"><div style="color:#6b7280;font-size:11px;font-weight:700;margin-bottom:4px;">สรุปผลการติดตาม</div>${latest.summary}</div>` : ''}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;">
      <div style="color:#6b7280;font-size:11px;font-weight:700;margin-bottom:4px;">คำแนะนำ</div>
      ${recHtml}
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:13px;">
      <div style="color:#1d4ed8;font-size:11px;font-weight:700;margin-bottom:4px;">แผนปรับปรุง/เป้าหมายถัดไป (Confidence Improvement Plan)</div>
      ${planText}
    </div>

    <div style="margin-top:40px;display:flex;gap:40px;">
      <div style="flex:1;text-align:center;">
        <div style="height:64px;border-bottom:1px solid #9ca3af;"></div>
        <div style="font-size:13px;font-weight:700;margin-top:6px;">ผู้บันทึก (อสม./เจ้าหน้าที่)</div>
        <div style="font-size:12px;color:#374151;margin-top:2px;">${meta.preparedBy}</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="height:64px;border-bottom:1px solid #9ca3af;"></div>
        <div style="font-size:13px;font-weight:700;margin-top:6px;">ผู้ป่วย/ญาติ</div>
        <div style="font-size:12px;color:#374151;margin-top:2px;">${patient.first_name || ''} ${patient.last_name || ''}</div>
      </div>
    </div>

    <div style="margin-top:28px;display:flex;justify-content:space-between;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:8px;">
      <div>
        ผู้จัดทำ: ${meta.preparedBy}<br/>
        เวลาจัดทำ: ${meta.generatedAt}<br/>
        รหัสเอกสาร: ${meta.docCode}
      </div>
      <div style="text-align:right;">
        Community Bridge v1.0<br/>
        ระบบดูแลผู้ป่วย PreDM<br/>
        เอกสารนี้สร้างโดยระบบอัตโนมัติ
      </div>
    </div>
  `);

  // ห่อทุกหน้าด้วยกรอบ A4 + เลขหน้า
  return inners.map((inner, i) => `
    <div style="width:794px;height:1123px;box-sizing:border-box;padding:44px 48px 56px 48px;background:#ffffff;position:relative;overflow:hidden;font-family:'Sarabun','Noto Sans Thai','Helvetica Neue',Arial,sans-serif;color:#111827;">
      ${inner}
      <div style="position:absolute;bottom:20px;left:48px;right:48px;border-top:1px solid #e5e7eb;padding-top:6px;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
        <span>Community Bridge v1.0 • ระเบียนติดตามผล • ${meta.docCode}</span>
        <span>หน้า ${i + 1} / ${inners.length}</span>
      </div>
    </div>
  `);
};

// ✅ สร้าง PDF Blob จากเทมเพลต (capture ทีละหน้า)
export const generatePatientPDFBlob = async (patient: any, followups: any[], screenings: any[], meta: RecordMeta): Promise<Blob> => {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas-pro');

  const pagesHtml = renderPatientPages(patient, followups, screenings, meta);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pagesHtml.length; i++) {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.zIndex = '-1';
    container.innerHTML = pagesHtml[i];
    document.body.appendChild(container);

    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(imgs.map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); })
    ));
    await new Promise(r => setTimeout(r, 200));

    const pageEl = container.firstElementChild as HTMLElement;
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      height: 1123,
      windowWidth: 794,
    });
    document.body.removeChild(container);

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  }

  return pdf.output('blob');
};