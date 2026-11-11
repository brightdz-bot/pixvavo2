import { Wilaya } from '../types';

export const ALGERIA_WILAYAS: Wilaya[] = [
  { id: '16', code: '16', nameAr: 'الجزائر العاصمة', nameFr: 'Alger', standardDeliveryFee: 400, deliveryDays: '24-48 ساعة' },
  { id: '09', code: '09', nameAr: 'البليدة', nameFr: 'Blida', standardDeliveryFee: 500, deliveryDays: '24-48 ساعة' },
  { id: '31', code: '31', nameAr: 'وهران', nameFr: 'Oran', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '25', code: '25', nameAr: 'قسنطينة', nameFr: 'Constantine', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '19', code: '19', nameAr: 'سطيف', nameFr: 'Sétif', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '23', code: '23', nameAr: 'عنابة', nameFr: 'Annaba', standardDeliveryFee: 700, deliveryDays: '48-72 ساعة' },
  { id: '13', code: '13', nameAr: 'تلمسان', nameFr: 'Tlemcen', standardDeliveryFee: 700, deliveryDays: '48-72 ساعة' },
  { id: '05', code: '05', nameAr: 'باتنة', nameFr: 'Batna', standardDeliveryFee: 700, deliveryDays: '48-72 ساعة' },
  { id: '06', code: '06', nameAr: 'بجاية', nameFr: 'Béjaïa', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '02', code: '02', nameAr: 'الشلف', nameFr: 'Chlef', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '15', code: '15', nameAr: 'تيزي وزو', nameFr: 'Tizi Ouzou', standardDeliveryFee: 600, deliveryDays: '48-72 ساعة' },
  { id: '35', code: '35', nameAr: 'بومرداس', nameFr: 'Boumerdès', standardDeliveryFee: 500, deliveryDays: '24-48 ساعة' },
  { id: '42', code: '42', nameAr: 'تيبازة', nameFr: 'Tipaza', standardDeliveryFee: 500, deliveryDays: '24-48 ساعة' },
  { id: '27', code: '27', nameAr: 'مستغانم', nameFr: 'Mostaganem', standardDeliveryFee: 650, deliveryDays: '48-72 ساعة' },
  { id: '07', code: '07', nameAr: 'بسكرة', nameFr: 'Biskra', standardDeliveryFee: 800, deliveryDays: '3-4 أيام' },
  { id: '30', code: '30', nameAr: 'ورقلة', nameFr: 'Ouargla', standardDeliveryFee: 900, deliveryDays: '3-4 أيام' }
];

export function getWilayaById(id: string): Wilaya | undefined {
  return ALGERIA_WILAYAS.find(w => w.id === id);
}

export function formatDZD(amount: number): string {
  return new Intl.NumberFormat('ar-DZ').format(amount) + ' د.ج';
}
