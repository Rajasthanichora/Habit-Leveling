import { ImageSourcePropType } from 'react-native';

const SVG_ICON_FILES: Record<string, ImageSourcePropType> = {
  'running-man-8584': require('../assets/Category_icons/running-man-8584.svg'),
  'running-man-and-fitness-16873': require('../assets/Category_icons/running-man-and-fitness-16873.svg'),
  'strong-man-arm-and-dumbbell-16869': require('../assets/Category_icons/strong-man-arm-and-dumbbell-16869.svg'),
  'dumbbell-8481': require('../assets/Category_icons/dumbbell-8481.svg'),
  'heart-5797': require('../assets/Category_icons/heart-5797.svg'),
  'medicine-3192': require('../assets/Category_icons/medicine-3192.svg'),
  'pills-3941': require('../assets/Category_icons/pills-3941.svg'),
  'water-bottle-and-water-drop-21757': require('../assets/Category_icons/water-bottle-and-water-drop-21757.svg'),
  'water-bottle-and-water-glass-21758': require('../assets/Category_icons/water-bottle-and-water-glass-21758.svg'),
  'plastic-water-bottle-and-water-glass-21759': require('../assets/Category_icons/plastic-water-bottle-and-water-glass-21759.svg'),
  'book-1': require('../assets/Category_icons/book (1).svg'),
  'book': require('../assets/Category_icons/book.svg'),
  'education': require('../assets/Category_icons/education.svg'),
  'green-book-13445': require('../assets/Category_icons/green-book-13445.svg'),
  'green-book-13481': require('../assets/Category_icons/green-book-13481.svg'),
  'laptop-student-12650': require('../assets/Category_icons/laptop-student-12650.svg'),
  'opened-book-13454': require('../assets/Category_icons/opened-book-13454.svg'),
  'opened-book-13456': require('../assets/Category_icons/opened-book-13456.svg'),
  'opened-book-13457': require('../assets/Category_icons/opened-book-13457.svg'),
  'opened-book-13458': require('../assets/Category_icons/opened-book-13458.svg'),
  'opened-book-13518': require('../assets/Category_icons/opened-book-13518.svg'),
  'brown-briefcase-work-experience-21041': require('../assets/Category_icons/brown-briefcase-work-experience-21041.svg'),
  'drill-and-hand-9528': require('../assets/Category_icons/drill-and-hand-9528.svg'),
  'hammer-and-hand-9536': require('../assets/Category_icons/hammer-and-hand-9536.svg'),
  'repair-tool-5840': require('../assets/Category_icons/repair-tool-5840.svg'),
  'wrench-and-hand-9527': require('../assets/Category_icons/wrench-and-hand-9527.svg'),
};

export const SVG_ICON_NAMES = Object.keys(SVG_ICON_FILES);

export function getSvgIconSource(name: string): ImageSourcePropType {
  return SVG_ICON_FILES[name] || SVG_ICON_FILES['running-man-8584'];
}

export function isSvgIcon(icon: string): boolean {
  return SVG_ICON_NAMES.includes(icon);
}
