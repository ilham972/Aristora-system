// The Grade 6-11 maths syllabus (Tamil medium), from the syllabus pages the owner sent (October 2026).
// Unit codes follow the unit books (U01, U02 ... in syllabus order), so a book's code always matches its unit.
// Term 0 = an extra book outside the term plan (Grade 9 U00 revision).
// Tamil names are as printed; Grade 7's page was English, so its Tamil names are translations to check.
// This list only seeds the units table once; after that the owner can rename units in the app.

export type UnitSeed = { grade: number; code: string; term: 0 | 1 | 2 | 3; en: string; ta: string };

type Row = [term: 0 | 1 | 2 | 3, en: string, ta: string];

function grade(g: number, rows: Row[], extra: Record<string, Row> = {}): UnitSeed[] {
  const out: UnitSeed[] = Object.entries(extra).map(([code, [term, en, ta]]) => ({ grade: g, code, term, en, ta }));
  rows.forEach(([term, en, ta], i) => out.push({ grade: g, code: `U${String(i + 1).padStart(2, "0")}`, term, en, ta }));
  return out;
}

export const SYLLABUS: UnitSeed[] = [
  ...grade(6, [
    [1, "Circles", "வட்டங்கள்"],
    [1, "Place value", "இடப் பெறுமானம்"],
    [1, "Mathematical operations on whole numbers", "முழு எண்களில் கணிதச் செய்கைகள்"],
    [1, "Time", "காலம்"],
    [1, "Number line", "எண் கோடு"],
    [1, "Estimation and rounding off", "மதிப்பிடலும் மட்டந்தட்டலும்"],
    [1, "Angles", "கோணங்கள்"],
    [1, "Directions", "திசைகள்"],
    [2, "Fractions", "பின்னங்கள்"],
    [2, "Sets", "தெரிதல்"],
    [2, "Factors and multiples", "காரணிகளும் மடங்குகளும்"],
    [2, "Rectilinear plane figures", "நேர்கோட்டுத் தளவுருவங்கள்"],
    [2, "Decimals", "தசமங்கள்"],
    [2, "Types of numbers and number patterns", "எண் வகைகளும் எண் கோலங்களும்"],
    [2, "Length", "நீளம்"],
    [2, "Liquid measurements", "திரவ அளவீடு"],
    [2, "Solids", "திண்மங்கள்"],
    [3, "Algebraic symbols", "அட்சரகணிதக் குறியீடுகள்"],
    [3, "Constructing and substituting algebraic expressions", "அட்சரகணிதக் கோவைகள் உருவாக்கலும் பிரதியிடுதலும்"],
    [3, "Mass", "திணிவு"],
    [3, "Ratios", "விகிதம்"],
    [3, "Collecting and representing data", "தரவுகளைச் சேகரித்தலும் வகைகுறித்தலும்"],
    [3, "Interpreting data", "தரவுகளுக்கு விளக்கம் கூறல்"],
    [3, "Indices", "சுட்டிகள்"],
    [3, "Area", "பரப்பளவு"],
  ]),
  ...grade(7, [
    [1, "Bilateral symmetry", "இருபக்கச் சமச்சீர்"],
    [1, "Sets", "தொடைகள்"],
    [1, "Mathematical operations on whole numbers", "முழு எண்களிலான கணிதச் செய்கைகள்"],
    [1, "Factors and multiples", "காரணிகளும் மடங்குகளும்"],
    [1, "Indices", "சுட்டிகள்"],
    [1, "Time", "காலம்"],
    [1, "Parallel straight lines", "சமாந்தர நேர்கோடுகள்"],
    [1, "Directed numbers", "திசைகொண்ட எண்கள்"],
    [1, "Angles", "கோணங்கள்"],
    [2, "Fractions", "பின்னங்கள்"],
    [2, "Decimals", "தசமங்கள்"],
    [2, "Algebraic expressions", "அட்சரகணிதக் கோவைகள்"],
    [2, "Mass", "திணிவு"],
    [2, "Rectilinear plane figures", "நேர்கோட்டுத் தளவுருவங்கள்"],
    [2, "Equations and formulae", "சமன்பாடுகளும் சூத்திரங்களும்"],
    [2, "Length", "நீளம்"],
    [2, "Area", "பரப்பளவு"],
    [2, "Circles", "வட்டங்கள்"],
    [2, "Volume", "கனவளவு"],
    [2, "Liquid measurements", "திரவ அளவீடுகள்"],
    [3, "Ratios", "விகிதங்கள்"],
    [3, "Percentages", "சதவீதங்கள்"],
    [3, "Cartesian plane", "தெக்காட்டின் தளம்"],
    [3, "Construction of plane figures", "தளவுருக்களை அமைத்தல்"],
    [3, "Solids", "திண்மங்கள்"],
    [3, "Data representation and interpretation", "தரவுகளை வகைகுறித்தலும் விளக்கம் கூறலும்"],
    [3, "Scale diagrams", "அளவிடைப் படங்கள்"],
    [3, "Tessellation", "தெசலாக்கம்"],
    [3, "Likelihood of an event", "நிகழ்வொன்றின் நிகழ்தகவு"],
  ]),
  // Grade 8: the syllabus page has 30 units; the Grade 8 unit books add Tessellation as U31.
  ...grade(8, [
    [1, "Number patterns", "எண்கோலங்கள்"],
    [1, "Perimeter", "சுற்றளவு"],
    [1, "Angles", "கோணங்கள்"],
    [1, "Directed numbers", "திசைகொண்ட எண்கள்"],
    [1, "Algebraic expressions", "அட்சரகணிதக் கோவைகள்"],
    [1, "Solids", "திண்மங்கள்"],
    [1, "Factors", "காரணிகள்"],
    [1, "Square roots", "வர்க்கமூலம்"],
    [1, "Mass", "திணிவு"],
    [1, "Indices", "சுட்டிகள்"],
    [2, "Symmetry", "சமச்சீர்"],
    [2, "Triangles", "முக்கோணிகள்"],
    [2, "Fractions", "பின்னங்கள்"],
    [2, "Fractions (multiply and divide)", "பின்னங்கள் (பெருக்கல், வகுத்தல்)"],
    [2, "Decimals", "தசமஎண்"],
    [2, "Ratio", "விகிதம்"],
    [2, "Equations", "சமன்பாடுகள்"],
    [2, "Percentages", "சதவீதம்"],
    [2, "Sets", "தொடைகள்"],
    [2, "Area", "பரப்பளவு"],
    [2, "Time", "காலம்"],
    [3, "Volume and capacity", "கனவளவு, கொள்ளளவு"],
    [3, "Circle", "வட்டம்"],
    [3, "Location and directions", "திசைகோள்"],
    [3, "Number line and Cartesian plane", "எண்கோடு, தெக்காட்டின் தளம்"],
    [3, "Loci and constructions", "ஒழுக்குகளும் அமைப்புகளும்"],
    [3, "Data representation", "தரவுகளை வகைகுறித்தலும் மைய நாட்ட அளவைகளும்"],
    [3, "Scale diagrams", "அளவிடைப்படம்"],
    [3, "Inequalities", "சமனிலிகள்"],
    [3, "Probability", "நிகழ்தகவு"],
    [3, "Tessellation", "தெசலாக்கம்"],
  ]),
  ...grade(
    9,
    [
      [1, "Number patterns", "எண் கோலங்கள்"],
      [1, "Binary numbers", "துவித எண்கள்"],
      [1, "Fractions", "பின்னங்கள்"],
      [1, "Percentages", "சதவீதம்"],
      [1, "Algebraic expressions", "அட்சரகணிதக் கோவைகள்"],
      [1, "Factors of algebraic expressions", "அட்சரகணிதக் கோவைகளின் காரணிகள்"],
      [1, "Axioms", "வெளிப்படையுண்மைகள்"],
      [1, "Angles of straight and parallel lines", "நேர்கோடுகள், சமாந்தரக்கோடுகள் தொடர்பான கோணங்கள்"],
      [1, "Liquid measurements", "திரவ அளவீடு"],
      [2, "Direct proportions", "நேர் விகிதசமன்"],
      [2, "Calculator", "கணிகருவி"],
      [2, "Indices", "சுட்டிகள்"],
      [2, "Rounding off and scientific notation", "மட்டந்தட்டலும் விஞ்ஞானமுறைக் குறிப்பீடும்"],
      [2, "Loci and constructions", "ஒழுக்குகளும் அமைப்புகளும்"],
      [2, "Equations", "சமன்பாடுகள்"],
      [2, "Angles of a triangle", "முக்கோணியொன்றின் கோணங்கள்"],
      [2, "Formulae", "சூத்திரங்கள்"],
      [2, "Circumference of a circle", "வட்டமொன்றின் பரிதி"],
      [2, "Pythagoras' relation", "பைதகரசின் தொடர்பு"],
      [2, "Graphs", "வரைபுகள்"],
      [3, "Inequalities", "சமனிலிகள்"],
      [3, "Sets", "தொடைகள்"],
      [3, "Area", "பரப்பளவு"],
      [3, "Probability", "நிகழ்தகவு"],
      [3, "Angles of polygons", "பல்கோணிகளின் கோணங்கள்"],
      [3, "Algebraic fractions", "அட்சரகணிதப் பின்னங்கள்"],
      [3, "Scale diagrams", "அளவிடைப் படங்கள்"],
      [3, "Data representation and interpretation", "தரவுகளை வகைகுறித்தலும் விளக்கம் கூறலும்"],
    ],
    { U00: [0, "Revision of earlier grades", "முந்திய தரங்களின் மீட்டல்"] },
  ),
  ...grade(10, [
    [1, "Perimeter", "சுற்றளவு"],
    [1, "Square root", "வர்க்கமூலம்"],
    [1, "Fractions", "பின்னங்கள்"],
    [1, "Binomial expressions", "ஈருறுப்புக் கோவைகள்"],
    [1, "Congruence of triangles", "முக்கோணிகளின் ஒருங்கிசைவு"],
    [1, "Area", "பரப்பளவு"],
    [1, "Factors of quadratic expressions", "இருபடிக் கோவைகளின் காரணிகள்"],
    [1, "Triangles I", "முக்கோணிகள் I"],
    [1, "Triangles II", "முக்கோணிகள் II"],
    [1, "Inverse proportions", "நேர்மாறு விகிதசமன்"],
    [1, "Data representation", "தரவுகளை வகைகுறித்தல்"],
    [1, "Least common multiple of algebraic expressions", "அட்சரகணிதக் கோவைகளின் பொது மடங்குகளுட் சிறியது"],
    [2, "Algebraic fractions", "அட்சரகணிதப் பின்னங்கள்"],
    [2, "Percentages", "சதவீதம்"],
    [2, "Equations", "சமன்பாடுகள்"],
    [2, "Parallelograms I", "இணைகரங்கள் I"],
    [2, "Parallelograms II", "இணைகரங்கள் II"],
    [2, "Sets", "தொடைகள்"],
    [2, "Logarithms I", "மடக்கை I"],
    [2, "Logarithms II", "மடக்கை II"],
    [2, "Graphs", "வரைபுகள்"],
    [2, "Rates", "வீதம்"],
    [2, "Formulae", "சூத்திரங்கள்"],
    [3, "Algebraic inequalities", "அட்சரகணிதச் சமனிலிகள்"],
    [3, "Arithmetic progressions", "கூட்டல் விருத்தி"],
    [3, "Frequency distributions", "எண் பரம்பல்"],
    [3, "Chords of a circle", "வட்டத்தின் நாண்கள்"],
    [3, "Constructions", "அமைப்புகள்"],
    [3, "Surface area and volume", "மேற்பரப்பளவும் கனவளவும்"],
    [3, "Probability", "நிகழ்தகவு"],
    [3, "Angles in a circle", "வட்டத்தின் கோணங்கள்"],
    [3, "Scale diagrams", "அளவிடைப் படம்"],
  ]),
  ...grade(11, [
    [1, "Real numbers", "மெய்யெண்கள்"],
    [1, "Indices and logarithms I", "சுட்டிகளும் மடக்கைகளும் I"],
    [1, "Indices and logarithms II", "சுட்டிகளும் மடக்கைகளும் II"],
    [1, "Surface area of solids", "திண்மங்களின் மேற்பரப்பின் பரப்பளவு"],
    [1, "Volume of solids", "திண்மங்களின் கனவளவு"],
    [1, "Binomial expressions", "ஈருறுப்புக் கோவைகள்"],
    [1, "Algebraic fractions", "அட்சரகணிதப் பின்னங்கள்"],
    [1, "Areas of plane figures between parallel lines", "சமாந்தரக் கோடுகளுக்கிடையில் உள்ள தளவுருவங்களின் பரப்பளவு"],
    [2, "Percentages", "சதவீதம்"],
    [2, "Shares", "பங்குகள்"],
    [2, "Mid-point theorem", "நடுப்புள்ளித் தேற்றம்"],
    [2, "Graphs", "வரைபுகள்"],
    [2, "Equations", "சமன்பாடுகள்"],
    [2, "Equiangular triangles", "சமகோண முக்கோணிகள்"],
    [2, "Data representation and interpretation", "தரவுகளை வகைகுறித்தலும் விளக்கம் கூறலும்"],
    [2, "Geometric progressions", "பெருக்கல் விருத்தி"],
    [3, "Pythagoras' theorem", "பைதகரஸ் தேற்றம்"],
    [3, "Trigonometry", "திரிகோணகணிதம்"],
    [3, "Matrices", "தாயங்கள்"],
    [3, "Inequalities", "சமனிலிகள்"],
    [3, "Cyclic quadrilaterals", "வட்ட நாற்பக்கல்"],
    [3, "Tangents", "தொடலிகள்"],
    [3, "Constructions", "அமைப்புகள்"],
    [3, "Sets", "தொடைகள்"],
    [3, "Probability", "நிகழ்தகவு"],
  ]),
];

export const GRADES = [6, 7, 8, 9, 10, 11] as const;

/**
 * OL: the O/L exam's own "grade" of books (his request, 1 Nov 2026), stored as grade 12 and shown as "OL". Its topics
 * follow the exam paper, not the school terms: a unit's `term` is its part (1 = Paper I A, 2 = Paper I B, 3 = Paper II A,
 * 4 = Paper II B). No student is in it: teachers give OL books to any student (mostly Grade 11, some Grade 10), one by
 * one or all at once, and his own grade and term stay as they are.
 */
export const OL = 12;
/** Every grade that has books: 6–11 and OL. */
export const BOOK_GRADES = [...GRADES, OL] as const;
export const OL_PARTS: Record<number, { id: "IA" | "IB" | "IIA" | "IIB"; en: string; ta: string }> = {
  1: { id: "IA", en: "Paper I · Part A", ta: "பகுதி 1A" },
  2: { id: "IB", en: "Paper I · Part B", ta: "பகுதி 1B" },
  3: { id: "IIA", en: "Paper II · Part A", ta: "பகுதி 2A" },
  4: { id: "IIB", en: "Paper II · Part B", ta: "பகுதி 2B" },
};

/** "OL" for the O/L books, the number for a school grade. */
export function gradeName(grade: number | null | undefined): string {
  return grade === OL ? "OL" : String(grade ?? "?");
}

/** "Grade 8", or "OL". */
export function gradeWords(grade: number | null | undefined): string {
  return grade === OL ? "OL" : `Grade ${grade ?? "?"}`;
}

/** His O/L tracker sheet (Paper 1 A 34, Paper 1 B 7, Paper 2 12 = A 1–6 + B 7–12, as the exam's questions), in his
 *  order and his Tamil; seeded once (setup.ensure step 4), then renamed in the app. */
export const OL_TOPICS: [part: 1 | 2 | 3 | 4, en: string, ta: string][] = [
  [1, "Square root", "வர்க்கமூலம்"],
  [1, "Inverse proportion", "நேர்மாறு விகிதசமன்"],
  [1, "Taxes", "வரிகள்"],
  [1, "Simple interest", "எளிய வட்டி"],
  [1, "Indices and logarithms", "சுட்டிகளும் மடக்கைகளும்"],
  [1, "Geometric progressions", "பெருக்கல் விருத்தி"],
  [1, "Compound interest", "கூட்டு வட்டி"],
  [1, "Perimeter", "சுற்றளவு"],
  [1, "Area", "பரப்பளவு"],
  [1, "Prism", "அரியம்"],
  [1, "Cylinder", "உருளை"],
  [1, "Speed", "கதி"],
  [1, "Rates", "வீதம்"],
  [1, "Angles of elevation and depression", "ஏற்றக்கோணம், இறக்கக்கோணம்"],
  [1, "Trigonometry", "திரிகோண கணிதம்"],
  [1, "Factors", "காரணிகள்"],
  [1, "Least common multiple", "பொ.ம.சி"],
  [1, "Algebraic fractions", "அட்சரகணிதப் பின்னங்கள்"],
  [1, "Quadratic equations", "இருபடிச் சமன்பாடு"],
  [1, "Straight line", "நேர்கோடு"],
  [1, "Inequalities", "சமனிலிகள்"],
  [1, "Matrices", "தாயம்"],
  [1, "Triangles", "முக்கோணிகள்"],
  [1, "Congruence", "ஒருங்கிசைவு"],
  [1, "Parallelograms", "இணைகரம்"],
  [1, "Angles in a circle", "வட்டத்தின் கோணங்கள்"],
  [1, "Chords of a circle", "வட்ட நாண்கள்"],
  [1, "Loci", "ஒழுக்குகள்"],
  [1, "Pythagoras' theorem", "பைதகரசின் தேற்றம்"],
  [1, "Mid-point theorem", "நடுப்புள்ளித் தேற்றம்"],
  [1, "Cyclic quadrilaterals", "வட்ட நாற்பக்கல்கள்"],
  [1, "Data representation", "தரவுகளை வகைகுறித்தல்"],
  [1, "Sets", "தொடைகள்"],
  [1, "Probability", "நிகழ்தகவு"],
  [2, "Fractions", "பின்னங்கள்"],
  [2, "Perimeter and area", "சுற்றளவும் பரப்பளவும்"],
  [2, "Share market", "பங்குச்சந்தை"],
  [2, "Distance–time graph", "தூர – நேர வரைபு"],
  [2, "Taxes", "வரிகள்"],
  [2, "Tree diagrams and grids", "மரவரியும் நெய்யரியும்"],
  [2, "Data representation", "தரவுகளை வகைகுறித்தல்"],
  [3, "Percentages", "சதவீதம்"],
  [3, "Graphs", "வரைபு"],
  [3, "Simultaneous equations", "ஒருங்கமை சமன்பாடு"],
  [3, "Quadratic equations", "இருபடிச் சமன்பாடு"],
  [3, "Statistics", "புள்ளிவிபரவியல்"],
  [3, "Trigonometry", "திரிகோண கணிதம்"],
  [4, "Arithmetic and geometric progressions", "கூட்டல் பெருக்கல் விருத்தி"],
  [4, "Constructions", "அமைப்பு"],
  [4, "Volume and logarithms", "கனவளவும் மடக்கையும்"],
  [4, "Theorems on rectilinear plane figures", "நேர்கோட்டுத் தளவுருவங்களின் தேற்றங்கள்"],
  [4, "Circle theorems", "வட்டத் தேற்றங்கள்"],
  [4, "Sets and probability", "தொடைகளும் நிகழ்தகவும்"],
];

/** "G8-U03" (OL: "OL-U44"): the stable key of a unit (grade + code). */
export function unitKey(grade: number, code: string): string {
  return grade === OL ? `OL-${code}` : `G${grade}-${code}`;
}

/** An OL topic's number on his sheet: its place in its paper (Paper 1 A 01–34, 1 B 01–07, Paper 2 01–12). */
export function olNumber(unit: { term: number; order: number }, units: readonly { grade: number; term: number; order: number }[]): number {
  const paper = (t: number) => (t <= 2 ? t : 3); // Paper 2 numbers run on from Part A into Part B
  const same = units.filter((u) => u.grade === OL && paper(u.term) === paper(unit.term)).sort((a, b) => a.term - b.term || a.order - b.order);
  return same.findIndex((u) => u.term === unit.term && u.order === unit.order) + 1;
}

/** Book order inside a grade: U00 (extra) last, then by code. */
export function unitOrder(code: string): number {
  const n = Number(code.replace(/\D/g, ""));
  return n === 0 ? 999 : n;
}

/** The school term a date falls in (Sri Lanka: January-April, May-August, September-December). */
export function termOf(now: number): 1 | 2 | 3 {
  const m = new Date(now + 5.5 * 3_600_000).getUTCMonth();
  return m < 4 ? 1 : m < 8 ? 2 : 3;
}
