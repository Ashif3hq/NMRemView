// Reference data: chemical shift ranges by functional group (1H, 13C), NMR-active
// isotopes, solvent residual peaks, common impurities, coupling constants and a small
// library of reference compounds. Values are typical literature ranges (CDCl3 unless noted).

// [id, name, min, max, typical, elements, tags, note, expected {mult, nH}]
const H = [
  ['h-si', 'Si–CH₃ (TMS, silyl ethers)', -0.1, 0.3, 0.05, ['Si'], 'silyl tms tbs tms-ether silane', 'TMS reference at 0.00 ppm; TBS shows 0.05 (6H) + 0.90 (9H)', { mult: 's' }],
  ['h-cprop', 'Cyclopropane C–H', 0.2, 0.8, 0.5, [], 'cyclopropyl ring strain', 'Shielded by ring current of the strained ring'],
  ['h-ch3', 'Alkyl CH₃ (R–CH₃)', 0.8, 1.05, 0.9, [], 'methyl alkyl aliphatic chain', 'Triplet next to CH₂, doublet next to CH', { nH: 3 }],
  ['h-ch2', 'Alkyl CH₂ (R–CH₂–R)', 1.15, 1.5, 1.3, [], 'methylene alkyl aliphatic chain', 'Long chains give a broad envelope at 1.25'],
  ['h-ch', 'Alkyl CH (methine)', 1.4, 2.0, 1.6, [], 'methine aliphatic branched', ''],
  ['h-tbu', 'tert-Butyl C(CH₃)₃', 0.85, 1.35, 1.0, [], 'tert-butyl tbu boc', 'Sharp 9H singlet; Boc group ~1.45', { mult: 's', nH: 9 }],
  ['h-boc', 'Boc / tBu ester (OC(CH₃)₃)', 1.4, 1.5, 1.45, ['O'], 'boc tert-butyl ester carbamate protecting', '9H singlet', { mult: 's', nH: 9 }],
  ['h-allyl', 'Allylic C=C–CH', 1.6, 2.3, 1.9, [], 'allylic alkene', ''],
  ['h-acyl-ch3', 'Methyl ketone CH₃–C(=O)R', 2.05, 2.7, 2.15, ['O'], 'methyl ketone acetyl carbonyl', 'Aryl methyl ketones ~2.6', { mult: 's', nH: 3 }],
  ['h-oac', 'Acetate CH₃–C(=O)O', 1.95, 2.15, 2.05, ['O'], 'acetate acetyl ester carbonyl', 'Ethyl acetate impurity at 2.05', { mult: 's', nH: 3 }],
  ['h-ch2co', 'CH₂/CH α to C=O', 2.1, 2.7, 2.35, ['O'], 'alpha carbonyl ketone ester acid', ''],
  ['h-arch3', 'Benzylic CH₃ (Ar–CH₃)', 2.2, 2.5, 2.33, [], 'benzylic toluene aromatic methyl', '', { mult: 's', nH: 3 }],
  ['h-arch2', 'Benzylic CH₂/CH (Ar–CH)', 2.5, 3.0, 2.65, [], 'benzylic aromatic', ''],
  ['h-alkyne', 'Terminal alkyne C≡C–H', 1.8, 3.2, 2.5, [], 'alkyne acetylene triple bond', 'Often a small t or d (⁴J ≈ 2.5 Hz)'],
  ['h-nch', 'Amine N–CH', 2.2, 3.0, 2.5, ['N'], 'amine nitrogen alkylamine', ''],
  ['h-nch3', 'Amine N–CH₃', 2.2, 2.5, 2.3, ['N'], 'amine nitrogen methylamine dimethylamine', '', { mult: 's', nH: 3 }],
  ['h-amide-nch', 'Amide N–CH₃ / N–CH₂', 2.75, 3.5, 2.95, ['N', 'O'], 'amide nitrogen dmf peptide', 'Rotamers can double these signals'],
  ['h-arnch', 'Aryl amine Ar–N–CH₃', 2.8, 3.1, 2.95, ['N'], 'aniline nitrogen', '', { mult: 's' }],
  ['h-sch', 'Thioether/thiol S–CH', 2.0, 2.9, 2.5, ['S'], 'sulfur thioether sulfide thiol mercaptan', 'S–CH₃ ≈ 2.1'],
  ['h-sh', 'Thiol S–H', 1.2, 2.0, 1.4, ['S'], 'thiol mercaptan sulfur', 'Often a triplet coupling to CH₂ (J ≈ 8 Hz)'],
  ['h-so', 'Sulfoxide/sulfone CH₃–S(O)', 2.5, 3.1, 2.8, ['S', 'O'], 'sulfoxide sulfone dmso mesyl sulfur', 'Mesylate CH₃SO₂O ≈ 3.0', { mult: 's' }],
  ['h-cl', 'Alkyl chloride CH–Cl', 3.4, 4.1, 3.55, ['Cl'], 'chloride chlorine halide alkyl halogen', 'CHCl₂ ≈ 5.8; CH₂Cl₂ 5.30'],
  ['h-br', 'Alkyl bromide CH–Br', 3.3, 4.3, 3.45, ['Br'], 'bromide bromine halide halogen', ''],
  ['h-i', 'Alkyl iodide CH–I', 3.1, 4.3, 3.2, ['I'], 'iodide iodine halide halogen', ''],
  ['h-f', 'Alkyl fluoride CH–F', 4.3, 4.8, 4.45, ['F'], 'fluoride fluorine halide halogen', 'Large ²J(H,F) ≈ 47 Hz doublet'],
  ['h-ch2cf3', 'CH₂–CF₃', 2.1, 4.0, 3.9, ['F'], 'trifluoromethyl fluorine', 'Quartet from ³J(H,F) ≈ 8–11 Hz'],
  ['h-oh-co', 'Ether/alcohol CH–O', 3.3, 4.1, 3.6, ['O'], 'ether alcohol oxygen hydroxyl', ''],
  ['h-och3', 'Aliphatic methyl ether CH₃–O', 3.2, 3.45, 3.35, ['O'], 'methoxy ether oxygen', '', { mult: 's', nH: 3 }],
  ['h-arome', 'Aryl methyl ether Ar–OCH₃', 3.7, 3.95, 3.82, ['O'], 'methoxy anisole aryl ether oxygen', '', { mult: 's', nH: 3 }],
  ['h-co2me', 'Methyl ester –CO₂CH₃', 3.6, 3.95, 3.7, ['O'], 'methyl ester carbonyl oxygen', 'Aryl esters ~3.9', { mult: 's', nH: 3 }],
  ['h-co2ch2', 'Ester O–CH₂ (e.g. ethyl ester)', 4.0, 4.45, 4.12, ['O'], 'ester ethyl carbonyl oxygen', 'Quartet (J ≈ 7.1) in ethyl esters', { mult: 'q', nH: 2 }],
  ['h-co2ch', 'Ester O–CH (secondary)', 4.75, 5.2, 4.95, ['O'], 'ester isopropyl carbonyl oxygen', ''],
  ['h-arch2o', 'Benzylic Ar–CH₂–O', 4.4, 5.2, 4.6, ['O'], 'benzyl ether ester alcohol oxygen bn', 'Benzyl ester ≈ 5.1', { nH: 2 }],
  ['h-acetal', 'Acetal O–CH–O', 4.5, 5.6, 4.9, ['O'], 'acetal sugar anomeric ketal', 'Anomeric H in sugars'],
  ['h-epox', 'Epoxide CH', 2.5, 3.2, 2.8, ['O'], 'epoxide oxirane', ''],
  ['h-no2', 'Nitroalkane CH–NO₂', 4.3, 4.7, 4.4, ['N', 'O'], 'nitro nitroalkane nitrogen', ''],
  ['h-cn', 'CH α to nitrile (CH–C≡N)', 2.2, 2.6, 2.35, ['N'], 'nitrile cyano nitrogen', ''],
  ['h-pch3', 'P–CH₃ / P–CH₂', 1.2, 2.0, 1.5, ['P'], 'phosphorus phosphonate phosphine phosphonium', 'Doublet ²J(H,P) ≈ 13–18 Hz'],
  ['h-poch2', 'Phosphate/phosphonate P–O–CH₂', 3.9, 4.2, 4.05, ['P', 'O'], 'phosphorus phosphate phosphonate ester', 'Extra ³J(H,P) ≈ 7 Hz splitting'],
  ['h-ph', 'P–H (H-phosphonate/phosphine)', 6.0, 7.8, 6.8, ['P'], 'phosphorus phosphite', 'Huge ¹J(H,P) ≈ 600–700 Hz doublet'],
  ['h-oh', 'Alcohol O–H', 0.5, 5.0, 2.0, ['O'], 'alcohol hydroxyl oh exchangeable', 'Broad, concentration-dependent; disappears with D₂O shake', { mult: 'br s', nH: 1 }],
  ['h-nh', 'Amine N–H', 0.5, 3.5, 1.5, ['N'], 'amine nh exchangeable', 'Broad; exchanges with D₂O', { mult: 'br s' }],
  ['h-nh2ar', 'Aniline N–H₂', 3.3, 4.2, 3.6, ['N'], 'aniline amine nh2 exchangeable', '', { mult: 'br s', nH: 2 }],
  ['h-amide-nh', 'Amide N–H', 5.5, 8.7, 6.5, ['N', 'O'], 'amide nh peptide exchangeable', 'In DMSO-d₆ ~7.5–9.5'],
  ['h-phenol', 'Phenol O–H', 4.5, 7.5, 5.5, ['O'], 'phenol hydroxyl exchangeable', 'In DMSO-d₆ 9–10', { mult: 'br s', nH: 1 }],
  ['h-boh', 'Boronic acid B(OH)₂', 4.5, 8.5, 8.0, ['B', 'O'], 'boron boronic acid', 'Broad; ~8.0 in DMSO-d₆', { mult: 'br s' }],
  ['h-vinyl2', 'Terminal alkene =CH₂', 4.6, 5.3, 4.95, [], 'alkene vinyl olefin double bond', 'cis J ≈ 10, trans J ≈ 17, gem J ≈ 1–2 Hz'],
  ['h-vinyl', 'Internal alkene CH=CH', 5.2, 5.9, 5.4, [], 'alkene olefin double bond', ''],
  ['h-enone', 'Conjugated alkene (α,β-unsaturated C=O)', 5.8, 7.2, 6.5, ['O'], 'enone acrylate alkene michael', 'α-H ≈ 5.8–6.2, β-H ≈ 6.8–7.0; trans J ≈ 16 Hz'],
  ['h-vinylo', 'Enol ether =CH–O', 6.0, 6.6, 6.4, ['O'], 'enol ether vinyl ether alkene oxygen', ''],
  ['h-arrich', 'Aromatic H ortho/para to OR, NR₂, OH', 6.5, 7.0, 6.8, [], 'aromatic electron-rich phenol aniline anisole', ''],
  ['h-ar', 'Aromatic H (benzene ring)', 6.9, 7.7, 7.3, [], 'aromatic benzene phenyl aryl ring', 'Monosubstituted phenyl: 5H multiplet; para: two 2H doublets (J ≈ 8.5)'],
  ['h-arpoor', 'Aromatic H ortho to C=O, NO₂, CN', 7.7, 8.3, 8.0, [], 'aromatic electron-poor nitro carbonyl', ''],
  ['h-pyr-a', 'Pyridine α-H (next to N)', 8.4, 8.8, 8.6, ['N'], 'pyridine heteroaromatic nitrogen', ''],
  ['h-pyr-b', 'Pyridine β/γ-H', 7.1, 7.8, 7.4, ['N'], 'pyridine heteroaromatic nitrogen', ''],
  ['h-furan', 'Furan ring H', 6.2, 7.5, 7.4, ['O'], 'furan heteroaromatic oxygen', 'α-H ≈ 7.4, β-H ≈ 6.3'],
  ['h-thioph', 'Thiophene ring H', 6.9, 7.4, 7.1, ['S'], 'thiophene heteroaromatic sulfur', ''],
  ['h-pyrrole', 'Pyrrole/indole ring C–H', 6.0, 6.9, 6.6, ['N'], 'pyrrole indole heteroaromatic nitrogen', 'Indole N–H ≈ 8.1 (br)'],
  ['h-imid', 'Imidazole / triazole C–H', 6.9, 8.2, 7.6, ['N'], 'imidazole triazole azole heteroaromatic nitrogen', ''],
  ['h-imine', 'Imine / oxime CH=N', 7.5, 8.6, 8.1, ['N'], 'imine oxime hydrazone schiff base nitrogen', ''],
  ['h-formyl', 'Formamide/formate H–C(=O)X', 7.9, 8.3, 8.05, ['O', 'N'], 'formamide formate dmf', 'DMF 8.02'],
  ['h-cho', 'Aldehyde CHO', 9.4, 10.2, 9.8, ['O'], 'aldehyde formyl carbonyl', 'Aryl ~9.9–10.1 (s); aliphatic ~9.6–9.8 (t, J ≈ 2)', { nH: 1 }],
  ['h-cooh', 'Carboxylic acid COOH', 10.0, 13.5, 11.5, ['O'], 'carboxylic acid cooh exchangeable', 'Very broad; may be invisible', { mult: 'br s', nH: 1 }],
  ['h-chelate', 'H-bonded / chelated OH (enol, salicyl)', 11.0, 16.5, 12.5, ['O'], 'enol chelated hydrogen bond salicylaldehyde', 'Sharp, downfield'],
];

const C = [
  ['c-si', 'Si–CH₃', -5, 5, 0, ['Si'], 'silyl tms tbs silane', 'TMS = 0.0'],
  ['c-i', 'C–I', -10, 15, 5, ['I'], 'iodide iodine halide halogen', 'Heavy-atom shielding moves C–I upfield'],
  ['c-ch3', 'Alkyl CH₃', 8, 25, 14, [], 'methyl alkyl aliphatic', ''],
  ['c-ch2', 'Alkyl CH₂', 18, 45, 29, [], 'methylene alkyl aliphatic', ''],
  ['c-ch', 'Alkyl CH / quaternary C', 25, 50, 35, [], 'methine quaternary aliphatic', ''],
  ['c-acyl', 'CH₃/CH₂ α to C=O', 20, 45, 30, ['O'], 'alpha carbonyl acetyl', 'Acetyl CH₃ ≈ 21 (ester), 26–30 (ketone)'],
  ['c-br', 'C–Br', 25, 45, 33, ['Br'], 'bromide bromine halide halogen', ''],
  ['c-cl', 'C–Cl', 40, 65, 45, ['Cl'], 'chloride chlorine halide halogen', 'CH₂Cl₂ 53.5; CHCl₃ 77.2'],
  ['c-s', 'C–S (thioether)', 10, 45, 30, ['S'], 'sulfur thioether sulfide thiol', 'S–CH₃ ≈ 15'],
  ['c-so', 'C–S(O)/C–SO₂', 38, 60, 44, ['S', 'O'], 'sulfoxide sulfone sulfonyl sulfur', 'DMSO 40.8'],
  ['c-n', 'C–N (amine)', 30, 60, 45, ['N'], 'amine nitrogen alkylamine', 'N–CH₃ ≈ 40–45'],
  ['c-namide', 'C–N (amide/carbamate)', 25, 55, 37, ['N', 'O'], 'amide nitrogen peptide', 'DMF 36.5, 31.4'],
  ['c-no2', 'C–NO₂', 70, 80, 75, ['N', 'O'], 'nitro nitroalkane nitrogen', ''],
  ['c-epox', 'Epoxide C–O', 40, 55, 47, ['O'], 'epoxide oxirane', ''],
  ['c-co2me', 'Methyl ester OCH₃', 50, 53, 52, ['O'], 'methyl ester methoxy', ''],
  ['c-ome', 'Ether OCH₃ (aliphatic / aryl)', 54, 62, 55.5, ['O'], 'methoxy ether anisole', 'Aryl OCH₃ ≈ 55–56'],
  ['c-co', 'C–O (alcohol / ether / ester)', 55, 85, 68, ['O'], 'alcohol ether oxygen hydroxyl ester', 'Ethyl ester OCH₂ ≈ 60.5; sugars 60–80'],
  ['c-f', 'C–F (aliphatic)', 75, 98, 84, ['F'], 'fluoride fluorine halide halogen', 'Doublet ¹J(C,F) ≈ 160–170 Hz'],
  ['c-alkyne', 'Alkyne C≡C', 65, 95, 80, [], 'alkyne triple bond', 'Terminal ≡CH ≈ 68–72'],
  ['c-acetal', 'Acetal O–C–O', 90, 112, 100, ['O'], 'acetal ketal anomeric sugar', ''],
  ['c-alkene', 'Alkene C=C', 100, 150, 125, [], 'alkene olefin vinyl double bond', 'Terminal =CH₂ ≈ 110–117'],
  ['c-cn', 'Nitrile C≡N', 112, 125, 118, ['N'], 'nitrile cyano nitrogen', 'Weak (no NOE, quaternary)'],
  ['c-cf3', 'CF₃', 115, 130, 124, ['F'], 'trifluoromethyl fluorine', 'Quartet ¹J(C,F) ≈ 270–290 Hz'],
  ['c-ar', 'Aromatic C–H / C–C', 115, 145, 128.5, [], 'aromatic benzene phenyl aryl ring', 'Benzene 128.4; substituted ipso 135–145'],
  ['c-arrich', 'Aromatic C ortho/para to O, N', 100, 120, 114, [], 'aromatic electron-rich phenol aniline anisole', ''],
  ['c-aro', 'Aromatic C–O / C–N (ipso)', 140, 165, 155, ['O', 'N'], 'phenol anisole aniline ipso aromatic', 'Phenol C–OH ≈ 155, anisole C–OMe ≈ 160'],
  ['c-arf', 'Aromatic C–F', 155, 168, 162, ['F'], 'fluoroarene fluorine', 'Doublet ¹J(C,F) ≈ 245 Hz; ortho C ²J ≈ 21 Hz'],
  ['c-hetar', 'Heteroaromatic C=N (pyridine C2)', 140, 160, 150, ['N'], 'pyridine pyrimidine heteroaromatic nitrogen', ''],
  ['c-imine', 'Imine / oxime C=N', 145, 170, 160, ['N'], 'imine oxime hydrazone nitrogen', ''],
  ['c-carbonate', 'Carbonate / carbamate / urea C=O', 150, 160, 155, ['O', 'N'], 'carbonate carbamate urea boc carbonyl', 'Boc C=O ≈ 155, Boc C(CH₃)₃ ≈ 80, 28.4'],
  ['c-amide', 'Amide C=O', 160, 175, 170, ['N', 'O'], 'amide lactam peptide carbonyl', ''],
  ['c-ester', 'Ester / lactone C=O', 165, 175, 171, ['O'], 'ester lactone carbonyl', 'Conjugated (benzoate) esters ≈ 166'],
  ['c-anhyd', 'Anhydride / acid chloride C=O', 160, 175, 168, ['O', 'Cl'], 'anhydride acid chloride acyl chloride carbonyl', ''],
  ['c-acid', 'Carboxylic acid C=O', 170, 185, 178, ['O'], 'carboxylic acid cooh carbonyl', ''],
  ['c-ald', 'Aldehyde C=O', 188, 205, 195, ['O'], 'aldehyde formyl carbonyl', 'Shows as CH in DEPT'],
  ['c-ketone', 'Ketone C=O', 195, 220, 208, ['O'], 'ketone carbonyl', 'Conjugated aryl ketones ≈ 196–200'],
  ['c-cs', 'Thiocarbonyl C=S', 190, 215, 200, ['S'], 'thiocarbonyl thione thioamide sulfur', ''],
  ['c-cp', 'C–P', 10, 40, 25, ['P'], 'phosphorus phosphonate phosphine', 'Doublet ¹J(C,P) ≈ 50–140 Hz'],
  ['c-cb', 'C–B', 20, 40, 30, ['B'], 'boron boronate', 'Often broadened beyond detection (quadrupolar ¹¹B)'],
];

function expand(list, nucleus) {
  return list.map(([id, name, min, max, typical, elements, tags, note, expected]) => ({ id, name, nucleus, min, max, typical, elements, tags, note, expected: expected || null }));
}

export const SHIFT_GROUPS = [...expand(H, '1H'), ...expand(C, '13C')];

export const ELEMENTS = {
  H: { name: 'Hydrogen', isotopes: [{ iso: '1H', spin: '1/2', abundance: 99.985, freq: 100, receptivity: 1 }, { iso: '2H', spin: '1', abundance: 0.015, freq: 15.351 }], note: 'Deuterium (²H, spin 1) splits solvent ¹³C peaks into 1:1:1 triplets (CDCl₃) or septets (DMSO-d₆).' },
  C: { name: 'Carbon', isotopes: [{ iso: '13C', spin: '1/2', abundance: 1.07, freq: 25.145, receptivity: 1.7e-4 }], note: '¹³C satellites appear ±¹J(C,H)/2 (≈ ±62–80 Hz) around strong ¹H singlets at 0.55% each.' },
  N: { name: 'Nitrogen', isotopes: [{ iso: '14N', spin: '1', abundance: 99.632, freq: 7.226 }, { iso: '15N', spin: '1/2', abundance: 0.368, freq: 10.137 }], note: 'Quadrupolar ¹⁴N broadens N–H and adjacent ¹H signals; N–H protons often appear as broad singlets.' },
  O: { name: 'Oxygen', isotopes: [{ iso: '17O', spin: '5/2', abundance: 0.038, freq: 13.56 }], note: 'No observable coupling; oxygen deshields neighbouring H (3.3–4.5 ppm) and C (50–90 ppm).' },
  F: { name: 'Fluorine', isotopes: [{ iso: '19F', spin: '1/2', abundance: 100, freq: 94.094, receptivity: 0.83 }], note: '¹⁹F couples strongly to both ¹H and ¹³C: C–F ¹J ≈ 245 Hz (aryl), CF₃ ¹J ≈ 272 Hz (quartet), ²J(H,F) ≈ 47 Hz.' },
  P: { name: 'Phosphorus', isotopes: [{ iso: '31P', spin: '1/2', abundance: 100, freq: 40.481, receptivity: 0.066 }], note: '³¹P splits nearby ¹H and ¹³C: ²J(H,P) ≈ 13–18 Hz, ³J(H,P) ≈ 7 Hz, ¹J(C,P) 50–140 Hz.' },
  Si: { name: 'Silicon', isotopes: [{ iso: '29Si', spin: '1/2', abundance: 4.685, freq: 19.867 }], note: 'Si–CH₃ near 0 ppm (¹H and ¹³C); small ²⁹Si satellites around TMS.' },
  S: { name: 'Sulfur', isotopes: [{ iso: '33S', spin: '3/2', abundance: 0.76, freq: 7.676 }], note: 'No observable coupling; S–CH 2.0–3.0 ppm, sulfoxides/sulfones further downfield.' },
  Cl: { name: 'Chlorine', isotopes: [{ iso: '35Cl', spin: '3/2', abundance: 75.78, freq: 9.798 }, { iso: '37Cl', spin: '3/2', abundance: 24.22, freq: 8.156 }], note: 'Quadrupolar, no visible splitting. CH₂–Cl ≈ 3.4–3.7 ppm (¹H), 40–50 ppm (¹³C).' },
  Br: { name: 'Bromine', isotopes: [{ iso: '79Br', spin: '3/2', abundance: 50.69, freq: 25.054 }, { iso: '81Br', spin: '3/2', abundance: 49.31, freq: 27.006 }], note: 'Quadrupolar, no visible splitting. C–Br carbons sit upfield of C–Cl (25–40 ppm).' },
  I: { name: 'Iodine', isotopes: [{ iso: '127I', spin: '5/2', abundance: 100, freq: 20.007 }], note: 'Heavy-atom effect shields directly bonded carbon (–10 to 15 ppm).' },
  B: { name: 'Boron', isotopes: [{ iso: '11B', spin: '3/2', abundance: 80.1, freq: 32.084 }, { iso: '10B', spin: '3', abundance: 19.9, freq: 10.746 }], note: 'Carbon bonded to boron is often too broad to see in ¹³C.' },
  Li: { name: 'Lithium', isotopes: [{ iso: '7Li', spin: '3/2', abundance: 92.41, freq: 38.863 }], note: '' },
  Na: { name: 'Sodium', isotopes: [{ iso: '23Na', spin: '3/2', abundance: 100, freq: 26.452 }], note: '' },
  Se: { name: 'Selenium', isotopes: [{ iso: '77Se', spin: '1/2', abundance: 7.63, freq: 19.071 }], note: 'Se–CH₃ ≈ 2.0 ppm (¹H).' },
  Sn: { name: 'Tin', isotopes: [{ iso: '119Sn', spin: '1/2', abundance: 8.59, freq: 37.29 }], note: 'Sn satellites (²J ≈ 50 Hz) around Sn–CH signals.' },
  Pt: { name: 'Platinum', isotopes: [{ iso: '195Pt', spin: '1/2', abundance: 33.8, freq: 21.4 }], note: '¹⁹⁵Pt satellites (≈ 1:4:1 pattern) on ligand signals.' },
};

const ELEMENT_ALIASES = { hydrogen: 'H', proton: 'H', carbon: 'C', nitrogen: 'N', oxygen: 'O', fluorine: 'F', phosphorus: 'P', silicon: 'Si', sulfur: 'S', sulphur: 'S', chlorine: 'Cl', bromine: 'Br', iodine: 'I', boron: 'B', lithium: 'Li', sodium: 'Na', selenium: 'Se', tin: 'Sn', platinum: 'Pt' };

// [name, 1H residual peaks, 13C peaks, water 1H]
export const SOLVENTS = [
  { id: 'CDCl3', names: ['cdcl3', 'chloroform-d', 'chloroform'], h: [7.26], c: [77.16], water: 1.56 },
  { id: 'DMSO-d6', names: ['dmso', 'dmso-d6', 'dmso-d₆'], h: [2.50], c: [39.52], water: 3.33 },
  { id: 'CD3OD', names: ['cd3od', 'methanol-d4', 'meod', 'methanol'], h: [3.31], c: [49.00], water: 4.87 },
  { id: 'D2O', names: ['d2o', 'water'], h: [4.79], c: [], water: 4.79 },
  { id: 'Acetone-d6', names: ['acetone', 'acetone-d6'], h: [2.05], c: [29.84, 206.26], water: 2.84 },
  { id: 'C6D6', names: ['c6d6', 'benzene-d6', 'benzene'], h: [7.16], c: [128.06], water: 0.40 },
  { id: 'CD3CN', names: ['cd3cn', 'acetonitrile-d3', 'acetonitrile'], h: [1.94], c: [1.32, 118.26], water: 2.13 },
  { id: 'CD2Cl2', names: ['cd2cl2', 'dichloromethane-d2', 'methylene chloride'], h: [5.32], c: [53.84], water: 1.52 },
  { id: 'THF-d8', names: ['thf', 'thf-d8'], h: [3.58, 1.72], c: [67.21, 25.31], water: 2.46 },
  { id: 'Toluene-d8', names: ['toluene', 'toluene-d8'], h: [7.09, 7.01, 6.97, 2.08], c: [137.48, 128.87, 127.96, 125.13, 20.43], water: 0.43 },
  { id: 'Pyridine-d5', names: ['pyridine', 'pyridine-d5'], h: [8.74, 7.58, 7.22], c: [150.35, 135.91, 123.87], water: 4.96 },
];

export function findSolvent(name) {
  if (!name) return null;
  const s = String(name).toLowerCase().replace(/\s+/g, '');
  return SOLVENTS.find((v) => v.id.toLowerCase() === s || v.names.some((n) => s.includes(n.replace(/\s+/g, '')))) || null;
}

// Common laboratory impurities (Fulmer et al., Organometallics 2010, 29, 2176) in CDCl3 / DMSO-d6.
export const IMPURITIES = [
  { name: 'Water', CDCl3: { h: [1.56] }, 'DMSO-d6': { h: [3.33] } },
  { name: 'Acetone', CDCl3: { h: [2.17], c: [207.07, 30.92] }, 'DMSO-d6': { h: [2.09], c: [206.31, 30.56] } },
  { name: 'Acetonitrile', CDCl3: { h: [2.10], c: [116.43, 1.89] }, 'DMSO-d6': { h: [2.07], c: [117.91, 1.03] } },
  { name: 'Benzene', CDCl3: { h: [7.36], c: [128.37] }, 'DMSO-d6': { h: [7.37], c: [128.30] } },
  { name: 'Dichloromethane', CDCl3: { h: [5.30], c: [53.52] }, 'DMSO-d6': { h: [5.76], c: [54.84] } },
  { name: 'Diethyl ether', CDCl3: { h: [3.48, 1.21], c: [65.91, 15.20] }, 'DMSO-d6': { h: [3.38, 1.09], c: [62.05, 15.12] } },
  { name: 'DMF', CDCl3: { h: [8.02, 2.96, 2.88], c: [162.62, 36.50, 31.39] }, 'DMSO-d6': { h: [7.95, 2.89, 2.73], c: [162.29, 35.73, 30.73] } },
  { name: 'DMSO', CDCl3: { h: [2.62], c: [40.76] } },
  { name: 'Ethanol', CDCl3: { h: [3.72, 1.25], c: [58.28, 18.41] }, 'DMSO-d6': { h: [3.44, 1.06], c: [56.07, 18.51] } },
  { name: 'Ethyl acetate', CDCl3: { h: [4.12, 2.05, 1.26], c: [171.36, 60.49, 21.04, 14.19] }, 'DMSO-d6': { h: [4.03, 1.99, 1.17], c: [170.31, 59.74, 20.68, 14.40] } },
  { name: 'n-Hexane', CDCl3: { h: [1.26, 0.88], c: [31.64, 22.70, 14.14] }, 'DMSO-d6': { h: [1.25, 0.86], c: [30.95, 22.05, 13.88] } },
  { name: 'Methanol', CDCl3: { h: [3.49], c: [50.41] }, 'DMSO-d6': { h: [3.16], c: [48.59] } },
  { name: 'THF', CDCl3: { h: [3.76, 1.85], c: [67.97, 25.62] }, 'DMSO-d6': { h: [3.60, 1.76], c: [67.03, 25.14] } },
  { name: 'Toluene', CDCl3: { h: [7.25, 7.17, 2.36], c: [137.89, 129.07, 128.26, 125.33, 21.46] }, 'DMSO-d6': { h: [7.18, 2.30], c: [137.35, 128.88, 128.18, 125.29, 20.99] } },
  { name: 'Triethylamine', CDCl3: { h: [2.53, 1.03], c: [46.25, 11.61] }, 'DMSO-d6': { h: [2.43, 0.93], c: [45.74, 10.75] } },
  { name: 'Grease', CDCl3: { h: [1.26, 0.86], c: [29.76] } },
  { name: 'Silicone grease', CDCl3: { h: [0.07], c: [1.19] } },
  { name: 'Pyridine', CDCl3: { h: [8.62, 7.68, 7.29], c: [149.90, 135.96, 123.75] } },
  { name: 'Chloroform', CDCl3: { h: [7.26], c: [77.36] }, 'DMSO-d6': { h: [8.32], c: [79.16] } },
  { name: 'TMS', CDCl3: { h: [0.00], c: [0.0] }, 'DMSO-d6': { h: [0.00], c: [0.0] } },
];

export const COUPLINGS = [
  { name: 'Vicinal sp³ H–C–C–H (free rotation)', range: '6–8 Hz', typical: 7 },
  { name: 'Geminal H–C–H (sp³)', range: '10–18 Hz', typical: 14 },
  { name: 'Geminal =CH₂', range: '0–3 Hz', typical: 1.5 },
  { name: 'Alkene cis H–C=C–H', range: '6–12 Hz', typical: 10 },
  { name: 'Alkene trans H–C=C–H', range: '12–18 Hz', typical: 16 },
  { name: 'Aldehyde H–C–CHO', range: '1–3 Hz', typical: 2 },
  { name: 'Aromatic ortho', range: '6–9 Hz', typical: 8 },
  { name: 'Aromatic meta', range: '1–3 Hz', typical: 2 },
  { name: 'Aromatic para', range: '0–1 Hz', typical: 0.5 },
  { name: 'Cyclohexane axial–axial', range: '8–14 Hz', typical: 11 },
  { name: 'Cyclohexane axial–equatorial / eq–eq', range: '2–5 Hz', typical: 3 },
  { name: 'H–C–F geminal ²J(H,F)', range: '45–50 Hz', typical: 47 },
  { name: 'H–C–C–F vicinal ³J(H,F)', range: '5–25 Hz', typical: 20 },
  { name: '¹J(C,H) sp³ / sp² / sp', range: '125 / 160 / 250 Hz', typical: 125 },
  { name: '¹J(C,F) aryl / CF₃', range: '245 / 272 Hz', typical: 245 },
  { name: '²J(H,P) / ³J(H,P)', range: '13–18 / 6–8 Hz', typical: 15 },
];

// Reference compounds. h: [ppm, multiplicity, nH], c: [ppm...]. CDCl3 unless solvent given.
export const COMPOUNDS = [
  { name: 'Ethyl acetate', formula: 'C4H8O2', h: [[4.12, 'q', 2], [2.05, 's', 3], [1.26, 't', 3]], c: [171.4, 60.5, 21.0, 14.2] },
  { name: 'Acetone', formula: 'C3H6O', h: [[2.17, 's', 6]], c: [207.1, 30.9] },
  { name: 'Ethanol', formula: 'C2H6O', h: [[3.72, 'q', 2], [1.25, 't', 3]], c: [58.3, 18.4] },
  { name: 'Methanol', formula: 'CH4O', h: [[3.49, 's', 3]], c: [50.4] },
  { name: 'Toluene', formula: 'C7H8', h: [[7.22, 'm', 5], [2.36, 's', 3]], c: [137.9, 129.1, 128.3, 125.3, 21.5] },
  { name: 'Benzene', formula: 'C6H6', h: [[7.36, 's', 6]], c: [128.4] },
  { name: 'Diethyl ether', formula: 'C4H10O', h: [[3.48, 'q', 4], [1.21, 't', 6]], c: [65.9, 15.2] },
  { name: 'Tetrahydrofuran', formula: 'C4H8O', h: [[3.76, 'm', 4], [1.85, 'm', 4]], c: [68.0, 25.6] },
  { name: 'Dichloromethane', formula: 'CH2Cl2', h: [[5.30, 's', 2]], c: [53.5] },
  { name: 'Acetic acid', formula: 'C2H4O2', h: [[11.4, 'br s', 1], [2.10, 's', 3]], c: [176.0, 20.8] },
  { name: 'Ethylbenzene', formula: 'C8H10', h: [[7.22, 'm', 5], [2.65, 'q', 2], [1.24, 't', 3]], c: [144.3, 128.4, 127.9, 125.7, 28.9, 15.6] },
  { name: 'Anisole', formula: 'C7H8O', h: [[7.29, 'm', 2], [6.94, 't', 1], [6.90, 'd', 2], [3.80, 's', 3]], c: [159.7, 129.5, 120.7, 114.0, 55.1] },
  { name: 'Benzaldehyde', formula: 'C7H6O', h: [[10.02, 's', 1], [7.88, 'd', 2], [7.64, 't', 1], [7.53, 't', 2]], c: [192.4, 136.4, 134.5, 129.7, 129.0] },
  { name: 'Acetophenone', formula: 'C8H8O', h: [[7.96, 'd', 2], [7.56, 't', 1], [7.46, 't', 2], [2.61, 's', 3]], c: [198.1, 137.1, 133.1, 128.6, 128.3, 26.6] },
  { name: 'Benzoic acid', formula: 'C7H6O2', h: [[12.0, 'br s', 1], [8.13, 'd', 2], [7.62, 't', 1], [7.49, 't', 2]], c: [172.5, 133.9, 130.3, 129.4, 128.5] },
  { name: 'Methyl benzoate', formula: 'C8H8O2', h: [[8.04, 'd', 2], [7.55, 't', 1], [7.43, 't', 2], [3.91, 's', 3]], c: [167.1, 132.9, 130.2, 129.6, 128.4, 52.1] },
  { name: 'Ethyl benzoate', formula: 'C9H10O2', h: [[8.05, 'd', 2], [7.54, 't', 1], [7.43, 't', 2], [4.38, 'q', 2], [1.39, 't', 3]], c: [166.6, 132.8, 130.6, 129.6, 128.3, 60.9, 14.4] },
  { name: 'Phenol', formula: 'C6H6O', h: [[7.25, 't', 2], [6.94, 't', 1], [6.84, 'd', 2], [5.3, 'br s', 1]], c: [155.4, 129.7, 121.0, 115.3] },
  { name: 'Aniline', formula: 'C6H7N', h: [[7.17, 't', 2], [6.77, 't', 1], [6.69, 'd', 2], [3.6, 'br s', 2]], c: [146.4, 129.3, 118.6, 115.2] },
  { name: 'Nitrobenzene', formula: 'C6H5NO2', h: [[8.22, 'd', 2], [7.70, 't', 1], [7.55, 't', 2]], c: [148.3, 134.7, 129.4, 123.5] },
  { name: 'Benzyl alcohol', formula: 'C7H8O', h: [[7.33, 'm', 5], [4.67, 's', 2], [2.0, 'br s', 1]], c: [140.9, 128.6, 127.7, 127.0, 65.3] },
  { name: 'Aspirin (acetylsalicylic acid)', formula: 'C9H8O4', h: [[11.0, 'br s', 1], [8.12, 'dd', 1], [7.62, 'td', 1], [7.36, 't', 1], [7.14, 'd', 1], [2.36, 's', 3]], c: [170.2, 169.8, 151.3, 134.9, 132.5, 126.2, 124.0, 122.3, 21.0] },
  { name: 'Ibuprofen', formula: 'C13H18O2', h: [[7.22, 'd', 2], [7.10, 'd', 2], [3.71, 'q', 1], [2.45, 'd', 2], [1.85, 'm', 1], [1.50, 'd', 3], [0.90, 'd', 6]], c: [181.0, 140.9, 137.0, 129.4, 127.3, 45.1, 45.0, 30.2, 22.4, 18.1] },
  { name: 'Paracetamol (DMSO-d₆)', formula: 'C8H9NO2', solvent: 'DMSO-d6', h: [[9.65, 's', 1], [9.14, 's', 1], [7.34, 'd', 2], [6.68, 'd', 2], [1.98, 's', 3]], c: [167.6, 153.2, 131.1, 120.9, 115.0, 23.8] },
  { name: 'Caffeine', formula: 'C8H10N4O2', h: [[7.51, 's', 1], [4.00, 's', 3], [3.58, 's', 3], [3.41, 's', 3]], c: [155.4, 151.7, 148.7, 141.4, 107.6, 33.6, 29.7, 27.9] },
  { name: 'Vanillin', formula: 'C8H8O3', h: [[9.83, 's', 1], [7.43, 'm', 2], [7.04, 'd', 1], [6.2, 'br s', 1], [3.97, 's', 3]], c: [191.0, 151.7, 147.2, 129.9, 127.6, 114.4, 108.8, 56.1] },
  { name: 'trans-Cinnamic acid', formula: 'C9H8O2', h: [[7.80, 'd', 1], [7.56, 'm', 2], [7.41, 'm', 3], [6.46, 'd', 1]], c: [172.7, 147.1, 134.0, 130.8, 129.0, 128.4, 117.3] },
  { name: 'Styrene', formula: 'C8H8', h: [[7.42, 'd', 2], [7.33, 't', 2], [7.26, 't', 1], [6.72, 'dd', 1], [5.75, 'd', 1], [5.24, 'd', 1]], c: [137.6, 136.9, 128.5, 127.8, 126.2, 113.8] },
  { name: 'Cyclohexanone', formula: 'C6H10O', h: [[2.33, 't', 4], [1.86, 'm', 4], [1.72, 'm', 2]], c: [212.0, 42.0, 27.1, 25.1] },
  { name: 'Cyclohexane', formula: 'C6H12', h: [[1.43, 's', 12]], c: [26.9] },
  { name: 'n-Hexane', formula: 'C6H14', h: [[1.26, 'm', 8], [0.88, 't', 6]], c: [31.6, 22.7, 14.1] },
  { name: 'N,N-Dimethylformamide', formula: 'C3H7NO', h: [[8.02, 's', 1], [2.96, 's', 3], [2.88, 's', 3]], c: [162.6, 36.5, 31.4] },
  { name: 'Dimethyl sulfoxide', formula: 'C2H6OS', h: [[2.62, 's', 6]], c: [40.8] },
  { name: 'Acetonitrile', formula: 'C2H3N', h: [[2.10, 's', 3]], c: [116.4, 1.9] },
  { name: 'Pyridine', formula: 'C5H5N', h: [[8.62, 'd', 2], [7.68, 't', 1], [7.29, 't', 2]], c: [149.9, 136.0, 123.8] },
  { name: 'Triethylamine', formula: 'C6H15N', h: [[2.53, 'q', 6], [1.03, 't', 9]], c: [46.3, 11.6] },
  { name: 'tert-Butanol', formula: 'C4H10O', h: [[1.28, 's', 9]], c: [69.2, 31.3] },
  { name: 'Isopropanol', formula: 'C3H8O', h: [[4.04, 'hept', 1], [1.22, 'd', 6]], c: [64.5, 25.1] },
  { name: 'Methyl acetate', formula: 'C3H6O2', h: [[3.67, 's', 3], [2.06, 's', 3]], c: [171.6, 51.6, 20.7] },
  { name: 'Diethyl malonate', formula: 'C7H12O4', h: [[4.20, 'q', 4], [3.36, 's', 2], [1.28, 't', 6]], c: [166.6, 61.5, 41.7, 14.1] },
  { name: 'Ethyl acetoacetate', formula: 'C6H10O3', h: [[4.20, 'q', 2], [3.44, 's', 2], [2.27, 's', 3], [1.28, 't', 3]], c: [200.7, 167.1, 61.4, 50.2, 30.2, 14.1] },
  { name: 'Naphthalene', formula: 'C10H8', h: [[7.84, 'm', 4], [7.48, 'm', 4]], c: [133.5, 128.0, 125.9] },
  { name: 'Chlorobenzene', formula: 'C6H5Cl', h: [[7.32, 'm', 5]], c: [134.3, 129.7, 128.6, 126.4] },
  { name: 'Bromobenzene', formula: 'C6H5Br', h: [[7.50, 'd', 2], [7.30, 't', 1], [7.24, 't', 2]], c: [131.5, 130.0, 126.8, 122.6] },
  { name: 'Fluorobenzene', formula: 'C6H5F', h: [[7.32, 'm', 2], [7.12, 't', 1], [7.04, 't', 2]], c: [162.9, 130.0, 124.1, 115.4] },
  { name: '1-Bromobutane', formula: 'C4H9Br', h: [[3.41, 't', 2], [1.85, 'p', 2], [1.47, 'h', 2], [0.93, 't', 3]], c: [34.8, 33.4, 21.4, 13.3] },
  { name: 'Benzyl bromide', formula: 'C7H7Br', h: [[7.35, 'm', 5], [4.50, 's', 2]], c: [137.8, 129.0, 128.8, 128.4, 33.6] },
  { name: 'Butan-2-one', formula: 'C4H8O', h: [[2.44, 'q', 2], [2.14, 's', 3], [1.06, 't', 3]], c: [209.3, 36.9, 29.4, 7.9] },
  { name: 'Propanal', formula: 'C3H6O', h: [[9.79, 't', 1], [2.46, 'qd', 2], [1.11, 't', 3]], c: [203.0, 37.3, 6.0] },
  { name: 'Cytisine', formula: 'C11H14N2O', h: [[7.29, 'dd', 1], [6.43, 'd', 1], [5.98, 'd', 1], [4.09, 'd', 1], [3.89, 'dd', 1], [3.00, 'm', 4], [2.31, 'm', 1], [1.93, 'm', 2]], c: [163.6, 151.1, 138.7, 116.7, 104.9, 53.7, 52.8, 49.9, 35.5, 27.6, 26.2] },
  { name: 'Strychnine', formula: 'C21H22N2O2', h: [[8.09, 'd', 1], [7.24, 'm', 2], [7.09, 't', 1], [5.89, 'm', 1], [4.28, 'dt', 1], [4.13, 'm', 1], [4.06, 'dd', 1], [3.92, 'd', 1], [3.85, 'd', 1], [3.71, 'm', 1], [3.17, 'm', 2], [2.88, 'm', 1], [2.70, 'm', 2], [2.35, 'm', 1], [1.89, 'm', 2], [1.47, 'm', 1], [1.27, 'm', 1]], c: [169.3, 142.2, 140.5, 132.7, 128.6, 127.3, 124.2, 122.2, 116.2, 77.6, 64.6, 60.3, 60.1, 52.7, 52.0, 50.3, 48.2, 42.5, 42.4, 31.6, 26.9] },
];

// Search groups, elements and compounds by element symbol/name, functional group or shift.
export function searchReference(query, nucleus) {
  const q = String(query || '').trim();
  if (!q) return { groups: [], element: null, compounds: [] };
  const lower = q.toLowerCase();
  let element = null;
  const sym = Object.keys(ELEMENTS).find((s) => s.toLowerCase() === lower) || ELEMENT_ALIASES[lower];
  if (sym && (q === sym || q.length > 2 || ELEMENT_ALIASES[lower])) element = { symbol: sym, ...ELEMENTS[sym] };
  const shift = /^-?\d+(\.\d+)?$/.test(q) ? parseFloat(q) : null;
  const words = lower.split(/[\s,]+/).filter(Boolean);
  const groups = SHIFT_GROUPS.filter((g) => {
    if (nucleus && g.nucleus !== nucleus) return false;
    if (shift !== null) { const tol = g.nucleus === '13C' ? 2 : 0.1; return shift >= g.min - tol && shift <= g.max + tol; }
    if (element) return g.elements.includes(element.symbol) || (element.symbol === 'C' && g.nucleus === '13C') || (element.symbol === 'H' && g.nucleus === '1H');
    const hay = (g.name + ' ' + g.tags + ' ' + g.elements.join(' ')).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const compounds = shift !== null ? [] : COMPOUNDS.filter((c) => {
    if (element) return element.symbol !== 'C' && element.symbol !== 'H' && new RegExp(element.symbol + '(?![a-z])').test(c.formula);
    return words.every((w) => c.name.toLowerCase().includes(w) || c.formula.toLowerCase() === w);
  });
  return { groups, element, compounds, shift };
}
