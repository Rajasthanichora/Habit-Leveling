import React from 'react';
import { SvgProps } from 'react-native-svg';

// SVGs imported as components via react-native-svg-transformer
const RunningMan8584 = require('../assets/Category_icons/running-man-8584.svg').default;
const RunningManFitness16873 = require('../assets/Category_icons/running-man-and-fitness-16873.svg').default;
const StrongManArm16869 = require('../assets/Category_icons/strong-man-arm-and-dumbbell-16869.svg').default;
const Dumbbell8481 = require('../assets/Category_icons/dumbbell-8481.svg').default;
const Heart5797 = require('../assets/Category_icons/heart-5797.svg').default;
const Medicine3192 = require('../assets/Category_icons/medicine-3192.svg').default;
const Pills3941 = require('../assets/Category_icons/pills-3941.svg').default;
const WaterBottle21757 = require('../assets/Category_icons/water-bottle-and-water-drop-21757.svg').default;
const WaterBottle21758 = require('../assets/Category_icons/water-bottle-and-water-glass-21758.svg').default;
const PlasticWaterBottle21759 = require('../assets/Category_icons/plastic-water-bottle-and-water-glass-21759.svg').default;
const Book1 = require('../assets/Category_icons/book (1).svg').default;
const Book = require('../assets/Category_icons/book.svg').default;
const Education = require('../assets/Category_icons/education.svg').default;
const GreenBook13445 = require('../assets/Category_icons/green-book-13445.svg').default;
const GreenBook13481 = require('../assets/Category_icons/green-book-13481.svg').default;
const LaptopStudent12650 = require('../assets/Category_icons/laptop-student-12650.svg').default;
const OpenedBook13454 = require('../assets/Category_icons/opened-book-13454.svg').default;
const OpenedBook13456 = require('../assets/Category_icons/opened-book-13456.svg').default;
const OpenedBook13457 = require('../assets/Category_icons/opened-book-13457.svg').default;
const OpenedBook13458 = require('../assets/Category_icons/opened-book-13458.svg').default;
const OpenedBook13518 = require('../assets/Category_icons/opened-book-13518.svg').default;
const BrownBriefcase21041 = require('../assets/Category_icons/brown-briefcase-work-experience-21041.svg').default;
const DrillHand9528 = require('../assets/Category_icons/drill-and-hand-9528.svg').default;
const HammerHand9536 = require('../assets/Category_icons/hammer-and-hand-9536.svg').default;
const RepairTool5840 = require('../assets/Category_icons/repair-tool-5840.svg').default;
const WrenchHand9527 = require('../assets/Category_icons/wrench-and-hand-9527.svg').default;

const SVG_ICON_COMPONENTS: Record<string, React.ComponentType<SvgProps>> = {
  'running-man-8584': RunningMan8584,
  'running-man-and-fitness-16873': RunningManFitness16873,
  'strong-man-arm-and-dumbbell-16869': StrongManArm16869,
  'dumbbell-8481': Dumbbell8481,
  'heart-5797': Heart5797,
  'medicine-3192': Medicine3192,
  'pills-3941': Pills3941,
  'water-bottle-and-water-drop-21757': WaterBottle21757,
  'water-bottle-and-water-glass-21758': WaterBottle21758,
  'plastic-water-bottle-and-water-glass-21759': PlasticWaterBottle21759,
  'book-1': Book1,
  'book': Book,
  'education': Education,
  'green-book-13445': GreenBook13445,
  'green-book-13481': GreenBook13481,
  'laptop-student-12650': LaptopStudent12650,
  'opened-book-13454': OpenedBook13454,
  'opened-book-13456': OpenedBook13456,
  'opened-book-13457': OpenedBook13457,
  'opened-book-13458': OpenedBook13458,
  'opened-book-13518': OpenedBook13518,
  'brown-briefcase-work-experience-21041': BrownBriefcase21041,
  'drill-and-hand-9528': DrillHand9528,
  'hammer-and-hand-9536': HammerHand9536,
  'repair-tool-5840': RepairTool5840,
  'wrench-and-hand-9527': WrenchHand9527,
};

export const SVG_ICON_NAMES = Object.keys(SVG_ICON_COMPONENTS);

export function getSvgIconComponent(name: string): React.ComponentType<SvgProps> | null {
  return SVG_ICON_COMPONENTS[name] || null;
}

export function isSvgIcon(icon: string): boolean {
  return SVG_ICON_NAMES.includes(icon);
}
