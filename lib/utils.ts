import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const reverseTransliterationMap = {
  'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'Đ': 'Ђ',
  'E': 'Е', 'Ž': 'Ж', 'Z': 'З', 'I': 'И', 'J': 'Ј', 'K': 'К',
  'L': 'Л', 'Lj': 'Љ', 'M': 'М', 'N': 'Н', 'Nj': 'Њ', 'O': 'О',
  'P': 'П', 'R': 'Р', 'S': 'С', 'Š': 'Ш', 'T': 'Т', 'Ć': 'Ћ',
  'U': 'У', 'F': 'Ф', 'H': 'Х', 'C': 'Ц', 'Č': 'Ч', 'Dž': 'Џ',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'đ': 'ђ',
  'e': 'е', 'ž': 'ж', 'z': 'з', 'i': 'и', 'j': 'ј', 'k': 'к',
  'l': 'л', 'lj': 'љ', 'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о',
  'p': 'п', 'r': 'р', 's': 'с', 'š': 'ш', 't': 'т', 'ć': 'ћ',
  'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'č': 'ч', 'dž': 'џ',
};

const osisanaReverseMap = {
  'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'Dj': 'Ђ',
  'E': 'Е', 'Z': 'Ж', 'Z': 'З', 'I': 'И', 'J': 'Ј', 'K': 'К',
  'L': 'Л', 'Lj': 'Љ', 'M': 'М', 'N': 'Н', 'Nj': 'Њ', 'O': 'О',
  'P': 'П', 'R': 'Р', 'S': 'С', 'S': 'Ш', 'T': 'Т', 'C': 'Ћ',
  'U': 'У', 'F': 'Ф', 'H': 'Х', 'C': 'Ц', 'C': 'Ч', 'Dz': 'Џ',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'dj': 'ђ',
  'e': 'е', 'z': 'ж', 'z': 'з', 'i': 'и', 'j': 'ј', 'k': 'к',
  'l': 'л', 'lj': 'љ', 'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о',
  'p': 'п', 'r': 'р', 's': 'с', 's': 'ш', 't': 'т', 'c': 'ћ',
  'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'c': 'ч', 'dz': 'џ',
};

export function latinToCyrillic(text, osisana = false) {
  const map = osisana ? osisanaReverseMap : reverseTransliterationMap;
  return [...text].map(char => map[char] || char).join('');
}
