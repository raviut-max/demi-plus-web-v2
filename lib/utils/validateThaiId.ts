export function validateThaiIdCard(id: string): { valid: boolean; message: string } {
  if (!/^\d{13}$/.test(id)) return { valid: false, message: 'กรุณากรอกเลขบัตร 13 หลัก' };
  if (id[0] === '0') return { valid: false, message: 'เลขบัตรไม่ขึ้นต้นด้วย 0' };

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  
  return parseInt(id[12]) === checkDigit 
    ? { valid: true, message: '' } 
    : { valid: false, message: 'เลขบัตรไม่ถูกต้อง (Checksum ไม่ผ่านมาตรฐาน)' };
}