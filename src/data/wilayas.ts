import { Wilaya } from '../types';

// Delivery tiers (DZD). Merchants can override any fee in Settings (store.customWilayaFees).
const NORTH_NEAR = { fee: 500, days: '24-48 ساعة' };
const NORTH = { fee: 600, days: '48-72 ساعة' };
const HIGHLANDS = { fee: 700, days: '48-72 ساعة' };
const SOUTH = { fee: 900, days: '3-4 أيام' };
const FAR_SOUTH = { fee: 1200, days: '4-6 أيام' };

// [code, nameAr, nameFr, tier, optional exact fee override]
type Row = [string, string, string, { fee: number; days: string }, number?];

const ROWS: Row[] = [
  ['01', 'أدرار', 'Adrar', FAR_SOUTH],
  ['02', 'الشلف', 'Chlef', NORTH],
  ['03', 'الأغواط', 'Laghouat', SOUTH],
  ['04', 'أم البواقي', 'Oum El Bouaghi', HIGHLANDS],
  ['05', 'باتنة', 'Batna', HIGHLANDS],
  ['06', 'بجاية', 'Béjaïa', NORTH],
  ['07', 'بسكرة', 'Biskra', SOUTH, 800],
  ['08', 'بشار', 'Béchar', FAR_SOUTH],
  ['09', 'البليدة', 'Blida', NORTH_NEAR],
  ['10', 'البويرة', 'Bouira', NORTH],
  ['11', 'تمنراست', 'Tamanrasset', FAR_SOUTH],
  ['12', 'تبسة', 'Tébessa', HIGHLANDS],
  ['13', 'تلمسان', 'Tlemcen', HIGHLANDS],
  ['14', 'تيارت', 'Tiaret', HIGHLANDS],
  ['15', 'تيزي وزو', 'Tizi Ouzou', NORTH],
  ['16', 'الجزائر العاصمة', 'Alger', { fee: 400, days: '24-48 ساعة' }],
  ['17', 'الجلفة', 'Djelfa', SOUTH],
  ['18', 'جيجل', 'Jijel', NORTH],
  ['19', 'سطيف', 'Sétif', NORTH],
  ['20', 'سعيدة', 'Saïda', HIGHLANDS],
  ['21', 'سكيكدة', 'Skikda', NORTH],
  ['22', 'سيدي بلعباس', 'Sidi Bel Abbès', HIGHLANDS],
  ['23', 'عنابة', 'Annaba', HIGHLANDS],
  ['24', 'قالمة', 'Guelma', HIGHLANDS],
  ['25', 'قسنطينة', 'Constantine', NORTH],
  ['26', 'المدية', 'Médéa', NORTH],
  ['27', 'مستغانم', 'Mostaganem', NORTH, 650],
  ['28', 'المسيلة', 'M\'Sila', HIGHLANDS],
  ['29', 'معسكر', 'Mascara', HIGHLANDS],
  ['30', 'ورقلة', 'Ouargla', SOUTH],
  ['31', 'وهران', 'Oran', NORTH],
  ['32', 'البيض', 'El Bayadh', SOUTH],
  ['33', 'إليزي', 'Illizi', FAR_SOUTH],
  ['34', 'برج بوعريريج', 'Bordj Bou Arréridj', NORTH],
  ['35', 'بومرداس', 'Boumerdès', NORTH_NEAR],
  ['36', 'الطارف', 'El Tarf', HIGHLANDS],
  ['37', 'تندوف', 'Tindouf', FAR_SOUTH],
  ['38', 'تيسمسيلت', 'Tissemsilt', HIGHLANDS],
  ['39', 'الوادي', 'El Oued', SOUTH],
  ['40', 'خنشلة', 'Khenchela', HIGHLANDS],
  ['41', 'سوق أهراس', 'Souk Ahras', HIGHLANDS],
  ['42', 'تيبازة', 'Tipaza', NORTH_NEAR],
  ['43', 'ميلة', 'Mila', NORTH],
  ['44', 'عين الدفلى', 'Aïn Defla', NORTH],
  ['45', 'النعامة', 'Naâma', SOUTH],
  ['46', 'عين تموشنت', 'Aïn Témouchent', HIGHLANDS],
  ['47', 'غرداية', 'Ghardaïa', SOUTH],
  ['48', 'غليزان', 'Relizane', HIGHLANDS],
  ['49', 'تيميمون', 'Timimoun', FAR_SOUTH],
  ['50', 'برج باجي مختار', 'Bordj Badji Mokhtar', FAR_SOUTH],
  ['51', 'أولاد جلال', 'Ouled Djellal', SOUTH],
  ['52', 'بني عباس', 'Béni Abbès', FAR_SOUTH],
  ['53', 'عين صالح', 'In Salah', FAR_SOUTH],
  ['54', 'عين قزام', 'In Guezzam', FAR_SOUTH],
  ['55', 'تقرت', 'Touggourt', SOUTH],
  ['56', 'جانت', 'Djanet', FAR_SOUTH],
  ['57', 'المغير', 'El M\'Ghair', SOUTH],
  ['58', 'المنيعة', 'El Menia', FAR_SOUTH]
];

// All 58 wilayas, so the "58 wilayas" promise in the UI is true.
export const ALGERIA_WILAYAS: Wilaya[] = ROWS.map(([code, nameAr, nameFr, tier, feeOverride]) => ({
  id: code,
  code,
  nameAr,
  nameFr,
  standardDeliveryFee: feeOverride ?? tier.fee,
  deliveryDays: tier.days
}));

export function getWilayaById(id: string): Wilaya | undefined {
  return ALGERIA_WILAYAS.find(w => w.id === id);
}

export function formatDZD(amount: number): string {
  return new Intl.NumberFormat('ar-DZ').format(amount) + ' د.ج';
}
