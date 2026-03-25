'use client';

interface ThaiDatePickerProps {
  label: string;
  value: string; // รูปแบบ: YYYY-MM-DD
  onChange: (value: string) => void;
  name: string;
  required?: boolean;
  minYear?: number;
  maxYear?: number;
}

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export default function ThaiDatePicker({
  label,
  value,
  onChange,
  name,
  required = false,
  minYear = 2443, // พ.ศ. 2443 (ค.ศ. 1900)
  maxYear = 2570, // พ.ศ. 2570 (ค.ศ. 2027)
}: ThaiDatePickerProps) {
  // แยกวันที่จาก value
  const parseDate = (dateString: string) => {
    if (!dateString) return { day: '', month: '', year: '' };
    
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1); // 1-12
    const year = String(date.getFullYear() + 543); // แปลง ค.ศ. เป็น พ.ศ.
    
    return { day, month, year };
  };

  const { day, month, year } = parseDate(value);

  // รวมวันที่เป็น string
  const combineDate = (d: string, m: string, y: string) => {
    if (!d || !m || !y) return '';
    
    const buddhistYear = parseInt(y);
    const christianYear = buddhistYear - 543;
    const monthIndex = parseInt(m) - 1;
    
    const date = new Date(christianYear, monthIndex, parseInt(d));
    return date.toISOString().split('T')[0];
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDay = e.target.value;
    const newValue = combineDate(newDay, month, year);
    onChange(newValue);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    const newValue = combineDate(day, newMonth, year);
    onChange(newValue);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newYear = e.target.value;
    const newValue = combineDate(day, month, newYear);
    onChange(newValue);
  };

  // สร้าง options สำหรับปี
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions.push(y);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {/* วัน */}
        <div>
          <select
            name={`${name}_day`}
            value={day}
            onChange={handleDayChange}
            required={required}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">วัน</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d).padStart(2, '0')}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* เดือน */}
        <div>
          <select
            name={`${name}_month`}
            value={month}
            onChange={handleMonthChange}
            required={required}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">เดือน</option>
            {THAI_MONTHS.map((monthName, index) => (
              <option key={index + 1} value={String(index + 1)}>
                {monthName}
              </option>
            ))}
          </select>
        </div>

        {/* ปี พ.ศ. */}
        <div>
          <select
            name={`${name}_year`}
            value={year}
            onChange={handleYearChange}
            required={required}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">ปี พ.ศ.</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        💡 เลือก วัน-เดือน-ปี (พ.ศ.)
      </p>
    </div>
  );
}